// Riftbound : catalogue depuis la galerie officielle Riot (en-us, zh-cn ; fr-fr dès que Riot y publie les noms français),
// prix TCGplayer via Riftcodex (identifiants) + TCGCSV, prix Cardmarket via ses fichiers publics.
import {
  getJSON, getText, sleep, htmlToText, normName, loadCardmarket, cardmarketBlock, cardmarketRef, matchByPrice,
  getUsdToEur, tcgcsvPrices, tcgcsvGroups, tcgcsvGroupProducts, tcgplayerBlock, tcgplayerRef, isFoilOnly, writeTcg,
  isRecent, addTcgplayerVariants, productTag, addSetImages,
} from './lib.mjs';

// L'anglais d'abord : la version française n'est publiée que si ses noms diffèrent vraiment des noms anglais.
const GALLERY = {
  en: 'https://riftbound.leagueoflegends.com/en-us/card-gallery/',
  fr: 'https://riftbound.leagueoflegends.com/fr-fr/card-gallery/',
  zh: 'https://riftbound.leagueoflegends.com/zh-cn/card-gallery/',
};
const RIFTCODEX = 'https://api.riftcodex.com';
const TCGCSV_CATEGORY = 89;
const CARDMARKET_GAME = 22;

async function galleryCards(url) {
  const html = await getText(url);
  const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
  return data.props.pageProps.page.blades.find((b) => b.cards)?.cards.items || [];
}

async function riftcodex() {
  const sets = (await getJSON(`${RIFTCODEX}/sets?size=100`)).items;
  const cards = new Map();
  for (let page = 1; ; page++) {
    const res = await getJSON(`${RIFTCODEX}/cards?size=100&page=${page}`);
    // La galerie Riot écrit « ogn-299-star-298 » ce que Riftcodex écrit « ogn-299*-298 » (versions signées).
    for (const c of res.items) cards.set(c.riftbound_id.replace('*', '-star'), c);
    if (page >= res.pages) break;
    await sleep(80);
  }
  return { sets, cards };
}

// Champ de la galerie Riot → texte affichable (les libellés sont déjà traduits par Riot).
function fieldValue(f) {
  if (!f || typeof f !== 'object') return null;
  if (f.value && typeof f.value === 'object') return f.value.label;
  if (f.value != null) return String(f.value);
  if (Array.isArray(f.values)) return f.values.map((v) => v.label).join(', ');
  if (Array.isArray(f.type)) return f.type.map((v) => v.label).join(', ');
  if (Array.isArray(f.tags)) return f.tags.join(', ');
  return null;
}

// Carte Riftcodex mise au format d'une carte de la galerie Riot (champs utilisés plus bas).
// « unl-235*-219 » → numéro « UNL-235*/219 ».
function fromRiftcodex(c) {
  const k = c.classification || {};
  return {
    id: c.riftbound_id.replace('*', '-star'),
    collectorNumber: c.collector_number,
    name: c.name,
    set: { value: { id: c.set?.set_id, label: c.set?.label } },
    publicCode: c.riftbound_id.toUpperCase().replace(/^([A-Z]+)-(.+)-(\d+)$/, '$1-$2/$3'),
    cardImage: { url: c.media?.image_url },
    rarity: { label: 'rarity', value: { label: k.rarity } },
    cardType: { label: 'type', type: [{ label: [k.supertype, k.type].filter(Boolean).join(' ') }] },
    domain: k.domain?.length ? { label: 'domain', values: k.domain.map((d) => ({ label: d })) } : undefined,
    illustrator: c.media?.artist ? { label: 'illustrator', values: [{ label: c.media.artist }] } : undefined,
    text: c.text?.rich ? { label: '', richText: { body: c.text.rich } } : undefined,
  };
}

// ---------- Français : seulement les noms officiels de Riot ----------
// Pendant la bêta, la galerie fr-fr reprend les noms anglais : pas de version française tant que moins de 30 %
// des noms diffèrent de l'anglais (aucune traduction maison : l'appli affiche alors les cartes anglaises).
const OFFICIAL_FRENCH_SHARE = 0.3;
const englishNames = new Map();

const SKIP = new Set(['id', 'collectorNumber', 'name', 'set', 'publicCode', 'cardImage', 'orientation', 'text', 'effect']);

export async function build(outDir) {
  console.log('Riftbound…');
  const [fx, cm, rc] = await Promise.all([getUsdToEur(), loadCardmarket(CARDMARKET_GAME), riftcodex()]);
  const groups = rc.sets.map((s) => s.tcgplayer_id).filter(Boolean);
  const tcg = await tcgcsvPrices(TCGCSV_CATEGORY, groups);
  // Extensions TCGplayer (abréviation = code du set) : dates et produits des sets que Riftcodex ne relie pas encore.
  const groupList = await tcgcsvGroups(TCGCSV_CATEGORY);
  const tcgGroups = new Map(groupList.map((g) => [g.abbreviation, g]));
  const tcgGroupsById = new Map(groupList.map((g) => [g.groupId, g]));
  let productsCache;
  const allProducts = async () => {
    if (!productsCache) {
      productsCache = [];
      for (const g of groupList) productsCache.push(...(await tcgcsvGroupProducts(TCGCSV_CATEGORY, g.groupId)));
    }
    return productsCache;
  };
  const setOrder = new Map(rc.sets.map((s) => [s.set_id, (s.published_on || '').slice(0, 10)]));
  const cmExpansions = new Map(rc.sets.map((s) => [s.set_id, [].concat(s.cardmarket_id || []).map(Number)]));

  for (const [lang, url] of Object.entries(GALLERY)) {
    const all = await galleryCards(url);
    const bySet = new Map();
    for (const c of all) {
      const id = c.set?.value?.id;
      if (!bySet.has(id)) bySet.set(id, { id, name: c.set.value.label, cards: [] });
      bySet.get(id).cards.push(c);
    }

    // Cartes absentes de la galerie Riot mais connues de Riftcodex : promos de tournoi
    // (dont les cartes « Metal »), promos, cartes juge… Ce sont souvent les plus chères : on les ajoute
    // sous la même forme que les cartes de la galerie (textes en anglais, image officielle Riot).
    const galleryIds = new Set(all.map((c) => c.id));
    for (const rcCard of rc.cards.values()) {
      if (galleryIds.has(rcCard.riftbound_id.replace('*', '-star'))) continue;
      const sid = rcCard.set?.set_id;
      if (!sid) continue;
      if (!bySet.has(sid)) {
        const rcSet = rc.sets.find((s) => s.set_id === sid);
        bySet.set(sid, { id: sid, name: rcSet?.name || rcCard.set?.label || sid, cards: [] });
      }
      bySet.get(sid).cards.push(fromRiftcodex(rcCard));
    }

    const sets = [];
    const cmUsed = new Set(); // produits Cardmarket déjà associés
    for (const set of bySet.values()) {
      set.cards.sort((a, b) => (a.collectorNumber ?? 0) - (b.collectorNumber ?? 0) || a.id.localeCompare(b.id));
      // La galerie Riot abrège parfois le nom (« Jinx ») : Riftcodex a le nom complet (« Jinx - Loose Cannon »).
      // Carte inconnue de Riftcodex (ex. signées d'une extension récente) : nom du produit TCGplayer associé.
      const tcgNames = new Map();
      const fullName = (c) => rc.cards.get(c.id)?.name || tcgNames.get(c) || c.name;
      // Sans identifiant d'extension Cardmarket connu, on la retrouve par recouvrement des noms (au moins 50 %).
      const exps = cmExpansions.get(set.id) || [];
      const products = exps.length ? cm.products.filter((p) => exps.includes(p.idExpansion)) : cm.products;
      // « (Alternate Art) », « (Signature) »… : même nom chez Cardmarket, la version suivante est le produit suivant.
      const zhName = (c) => {
        const suffix = fullName(c).match(/\s*\([^)]*\)$/)?.[0];
        return suffix && !/[(（]/.test(c.name) ? c.name + suffix : c.name;
      };
      const baseName = (c) => normName(fullName(c).replace(/\s*\([^)]*\)\s*$/, ''));

      // Cartes sans prix TCGplayer via Riftcodex (pas d'identifiant, ou produit hors des extensions qu'il relie) :
      // produits de l'extension TCGplayer de même code, par numéro puis par nom.
      const group = tcgGroups.get(set.id);
      const missing = set.cards.filter((c) => !tcg.get(Number(rc.cards.get(c.id)?.tcgplayer_id)));
      const tcgFallback = group && missing.length
        ? await (async () => {
          const products = await tcgcsvGroupProducts(TCGCSV_CATEGORY, group.groupId);
          // 1) Par numéro : identifiant Riot « rad-sp1-005 » ↔ numéro TCGplayer « SP1/005 », « rad-r02 » ↔ « R02 ».
          const numberOf = (c) => {
            const parts = c.id.split('-').slice(1);
            return (parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0] || '').toUpperCase();
          };
          const byNumber = new Map(products.filter((p) => p.number).map((p) => [p.number.toUpperCase(), p]));
          const result = new Map();
          for (const c of missing) {
            // Numéro imprimé « VEN-190*/166 » ↔ « 190*/166 » (versions signées, promos), sinon l'identifiant.
            const printed = String(c.publicCode || '').toUpperCase().replace(/^[A-Z0-9]+-/, '');
            const p = byNumber.get(printed) || byNumber.get(numberOf(c));
            if (p) result.set(c, p);
          }
          // 2) Par nom pour le reste.
          const byName = matchByPrice({
            products,
            cards: missing.filter((c) => !result.has(c)),
            keyOfProduct: (p) => normName(p.name.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*-\s*[A-Z]{2,4}\d*\s*$/, '')),
            keyOfCard: baseName,
            groupOf: (p) => p.groupId,
            refOfCard: () => null,
            refOfProduct: () => null,
            prior: (c, p) => (/\(/.test(p.name) === /\(/.test(fullName(c)) ? 0.2 : 0.9),
          });
          for (const [c, p] of byName) result.set(c, p);
          return result;
        })()
        : new Map();
      for (const [c, p] of tcgFallback) if (!rc.cards.has(c.id)) tcgNames.set(c, p.name.replace(/^([^,(]+), /, '$1 - '));
      const tcgProductId = (c) => {
        const id = Number(rc.cards.get(c.id)?.tcgplayer_id);
        return (tcg.has(id) && id) || tcgFallback.get(c)?.productId || id || undefined;
      };
      const tcgEntries = (c) => tcg.get(tcgProductId(c)) || tcgFallback.get(c)?.prices;
      const cmMatch = matchByPrice({
        products,
        cards: set.cards,
        keyOfProduct: (p) => normName(p.name),
        keyOfCard: baseName,
        groupOf: (p) => p.idExpansion,
        refOfCard: (c) => (tcgplayerRef(tcgEntries(c)) || 0) * fx || null,
        refOfProduct: (p) => cardmarketRef(cm.prices.get(p.idProduct)),
        minRatio: exps.length ? 0 : 0.5,
        tolerant: () => isRecent(setOrder.get(set.id) || group?.publishedOn),
      });
      for (const p of cmMatch.values()) cmUsed.add(p.idProduct);

      const cards = set.cards.map((c) => {
        const ref = rc.cards.get(c.id);
        const prices = [];
        const cmProduct = cmMatch.get(c);
        const cmBlock = cmProduct && cardmarketBlock(cm.prices.get(cmProduct.idProduct), null, { foil: isFoilOnly(tcgEntries(c)) });
        if (cmBlock) prices.push(cmBlock);
        const productId = tcgProductId(c);
        const tp = productId && tcgplayerBlock(tcgEntries(c), `https://www.tcgplayer.com/product/${productId}`);
        if (tp) prices.push(tp);

        const details = [['set', set.name], ['number', c.publicCode]];
        for (const [k, f] of Object.entries(c)) {
          if (SKIP.has(k)) continue;
          const v = fieldValue(f);
          if (v && f.label) details.push([f.label, v]);
        }
        const text = c.text?.richText?.body ?? c.effect?.richText?.body;
        return {
          id: c.id,
          // Chinois : nom traduit de la galerie ; sinon le nom complet anglais (la galerie l'abrège parfois).
          // (suffixe « (Signature) », « (Metal) »… repris s'il manque au nom chinois)
          name: lang === 'zh' ? zhName(c) : fullName(c),
          number: c.publicCode,
          subtitle: c.rarity?.value?.label,
          image: c.cardImage?.url,
          details,
          texts: [
            text && { title: c.text?.label, titleKey: 'effect', body: htmlToText(text) },
            ref?.text?.flavour && { titleKey: 'flavor', body: `« ${ref.text.flavour} »` },
          ].filter(Boolean),
          prices,
          links: [
            productId && { label: 'TCGplayer', url: `https://www.tcgplayer.com/product/${productId}` },
            { label: 'Cardmarket', url: `https://www.cardmarket.com/${lang === 'fr' ? 'fr' : 'en'}/Riftbound/Products/Search?searchString=${encodeURIComponent(c.name)}` },
          ].filter(Boolean),
        };
      });
      const date = setOrder.get(set.id) || group?.publishedOn?.slice(0, 10) || '';
      sets.push({ id: set.id, name: set.name, subtitle: date ? `${set.id} · ${date}` : set.id, date, cards, tcgGroupId: group?.groupId });
    }
    addVariants(sets, { allProducts: await allProducts(), groups: tcgGroupsById, cm, cmUsed, fx, lang });
    sets.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const cardsOf = sets.flatMap((s) => s.cards);
    if (lang === 'en') for (const c of cardsOf) englishNames.set(c.id, c.name);
    if (lang === 'fr') {
      const translated = cardsOf.filter((c) => englishNames.has(c.id) && englishNames.get(c.id) !== c.name).length;
      if (translated < cardsOf.length * OFFICIAL_FRENCH_SHARE) {
        console.log(`  riftbound/fr : pas encore de noms français officiels (${translated}/${cardsOf.length} traduits) : version française non publiée`);
        continue;
      }
      console.log(`  riftbound/fr : noms français officiels détectés (${translated}/${cardsOf.length}) : à activer dans l'appli (languages de Riftbound)`);
    }
    await addSetImages(sets, TCGCSV_CATEGORY);
    await writeTcg(outDir, 'riftbound', lang, sets);
  }
}

// Produits TCGplayer absents de la galerie et de Riftcodex : cartes Metal « Prize Wall », bundles (T1, Worlds),
// Secret Garden, runes alternatives… Base = carte de même numéro dans l'extension du même groupe, si elle existe.
function addVariants(sets, { allProducts, groups, cm, cmUsed, fx, lang }) {
  const setOfGroup = new Map(sets.filter((s) => s.tcgGroupId).map((s) => [s.tcgGroupId, s]));
  const added = addTcgplayerVariants({
    sets,
    products: allProducts,
    groups,
    makeCard: (p, g) => {
      const base = setOfGroup.get(p.groupId)?.cards.find((c) => c.number?.toUpperCase().endsWith(`-${p.number.toUpperCase()}`));
      const tag = productTag(p.name);
      const name = p.name.replace(/^([^,(]+), /, '$1 - ');
      return {
        id: `tcg${p.productId}`,
        // Sans mention chez TCGplayer : on précise le groupe (ex. promo de tournoi d'une carte Metal).
        name: base ? `${base.name.replace(/\s*\([^)]*\)\s*$/, '')} ${tag || `(${g?.abbreviation || 'promo'})`}` : name,
        number: base?.number || p.number,
        subtitle: base?.subtitle,
        image: p.image,
        thumb: p.thumb,
        details: [['set', g?.name], ...(base ? base.details.filter(([k]) => k !== 'set') : [['number', p.number]])],
        texts: base?.texts || [],
        prices: [tcgplayerBlock(p.prices, p.url)],
        links: [
          { label: 'TCGplayer', url: p.url },
          { label: 'Cardmarket', url: `https://www.cardmarket.com/${lang === 'fr' ? 'fr' : 'en'}/Riftbound/Products/Search?searchString=${encodeURIComponent(name.replace(/\s*\(.*$/, ''))}` },
        ],
      };
    },
  });
  // Prix Cardmarket par nom (sans mention entre parenthèses) puis proximité de prix.
  const free = cm.products.filter((p) => !cmUsed.has(p.idProduct));
  let n = 0;
  for (const [set, list] of added) {
    const match = matchByPrice({
      products: free,
      cards: list,
      keyOfProduct: (p) => normName(p.name),
      keyOfCard: (x) => normName(x.card.name.replace(/\s*\(.*$/, '')),
      groupOf: (p) => p.idExpansion,
      refOfCard: (x) => (tcgplayerRef(x.product.prices) || 0) * fx || null,
      refOfProduct: (p) => cardmarketRef(cm.prices.get(p.idProduct)),
      maxRatio: 3,
      tolerant: () => isRecent(set.date),
    });
    for (const [x, p] of match) {
      const block = cardmarketBlock(cm.prices.get(p.idProduct), null, { foil: isFoilOnly(x.product.prices) });
      if (block) { x.card.prices.unshift(block); n++; }
    }
  }
  const total = [...added.values()].reduce((a, l) => a + l.length, 0);
  console.log(`  riftbound/${lang} : ${total} variantes TCGplayer ajoutées (${n} avec prix Cardmarket)`);
}
