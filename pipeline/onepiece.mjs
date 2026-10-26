// One Piece Card Game :
// - catalogue FR/EN (noms, textes, caractéristiques) depuis les sites officiels Bandai ;
// - produit TCGplayer exact de chaque carte (via TCGCSV) → prix du jour, lien produit, date de sortie ;
//   les versions d'une même carte sont départagées grâce aux prix relevés par OPTCG API pour chaque identifiant officiel ;
// - prix Cardmarket via ses fichiers publics, associés par code de carte puis par proximité de prix.
import {
  getJSON, getText, sleep, htmlToText, clean, loadCardmarket, cardmarketBlock, cardmarketRef, matchByPrice,
  getUsdToEur, tcgcsvGroups, tcgcsvGroupProducts, tcgplayerBlock, tcgplayerRef, isFoilOnly, writeTcg,
  isRecent, addTcgplayerVariants, productTag, addSetImages,
} from './lib.mjs';

// Le site japonais a plus de séries (sorties en avance au Japon) ; leurs prix sont ceux des cartes internationales de même code.
const SITES = { fr: 'https://fr.onepiece-cardgame.com', en: 'https://en.onepiece-cardgame.com', ja: 'https://www.onepiece-cardgame.com' };
const OPTCG = 'https://optcgapi.com/api';
const TCGCSV_CATEGORY = 68;
const CARDMARKET_GAME = 18;

function parseSeries(html) {
  const out = [];
  for (const m of html.matchAll(/<option value="(\d+)"[^>]*>([^<]+)/g)) {
    const label = htmlToText(htmlToText(m[2])).replace(/\s+/g, ' ').trim();
    // Code de la série entre crochets : « [OP-09] » (FR/EN) ou « 【OP-09】 » (JA).
    const code = label.match(/[[【]([^\]】]+)[\]】]\s*$/)?.[1];
    const name = label.replace(/\s*[[【][^\]】]+[\]】]\s*$/, '').replace(/^.*?-\s*(.+?)\s*-$/, '$1').trim();
    if (code) out.push({ seriesId: m[1], code, name, label });
  }
  return out;
}

function parseCards(html, site) {
  const cards = [];
  for (const m of html.matchAll(/<dl class="modalCol" id="([^"]+)">([\s\S]*?)<\/dl>/g)) {
    const [, id, block] = m;
    const info = [...block.matchAll(/<span>([^<]*)<\/span>/g)].map((x) => htmlToText(x[1]));
    const name = htmlToText(block.match(/<div class="cardName">([\s\S]*?)<\/div>/)?.[1]);
    const img = block.match(/data-src="\.\.\/([^"]+)"/)?.[1];
    const fields = {};
    for (const f of block.matchAll(/<div class="(\w+)">\s*<h3>([\s\S]*?)<\/h3>([\s\S]*?)<\/div>/g)) {
      fields[f[1]] = { label: htmlToText(f[2]).replace(/\n/g, ' '), value: htmlToText(f[3]) };
    }
    const attr = block.match(/<div class="attribute">[\s\S]*?<i>([^<]*)<\/i>/)?.[1];
    cards.push({ id, number: info[0], rarity: info[1], type: info[2], name, officialImage: img ? `${site}/${img}` : null, fields, attribute: attr });
  }
  return cards;
}

// identifiant officiel (ex. EB01-012_r1) → relevés OPTCG API (un même identifiant peut exister dans plusieurs sets)
async function optcgCards() {
  const map = new Map();
  const add = (list) => {
    for (const c of list || []) {
      if (!map.has(c.card_image_id)) map.set(c.card_image_id, []);
      map.get(c.card_image_id).push(c);
    }
  };
  add(await getJSON(`${OPTCG}/allSetCards/`));
  for (const d of (await getJSON(`${OPTCG}/allDecks/`)) || []) {
    add(await getJSON(`${OPTCG}/decks/${d.structure_deck_id}/`));
    await sleep(100);
  }
  return map;
}

async function tcgplayerCatalog() {
  const groups = await tcgcsvGroups(TCGCSV_CATEGORY);
  const products = [];
  for (const g of groups) {
    products.push(...(await tcgcsvGroupProducts(TCGCSV_CATEGORY, g.groupId)));
    await sleep(80);
  }
  return { groups: new Map(groups.map((g) => [g.groupId, g])), products: products.filter((p) => p.number) };
}

// Sans prix pour départager : la version de base va au produit sans mention entre parenthèses.
const hasTag = (p) => /\(/.test(p.name);
const prior = (card, product) => {
  const base = !card.id.includes('_');
  if (base) return hasTag(product) ? 0.9 : 0.2;
  return hasTag(product) ? 0.5 : 1.0;
};

export async function build(outDir) {
  console.log('One Piece…');
  const [fx, cm, optcg, tcg] = await Promise.all([getUsdToEur(), loadCardmarket(CARDMARKET_GAME), optcgCards(), tcgplayerCatalog()]);
  const codeOf = (p) => p.name.match(/\(([A-Z]+\d*-\d+)\)/)?.[1];

  // Anglais en premier : ses cartes servent de base aux variantes absentes des sites FR / JA.
  const enBases = new Map();
  for (const lang of ['en', 'fr', 'ja']) {
    const site = SITES[lang];
    const series = parseSeries(await getText(`${site}/cardlist/`));
    const sets = [];
    const cmUsed = new Set(); // produits Cardmarket déjà associés à une carte du site officiel
    for (const s of series) {
      const html = await getText(`${site}/cardlist/?series=${s.seriesId}`);
      await sleep(300);
      const seen = new Set();
      const raw = parseCards(html || '', site).filter((c) => !seen.has(c.id) && seen.add(c.id));
      raw.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      if (!raw.length) continue;

      // Prix OPTCG API de la carte (celui de ce set en priorité), en euros : sert à identifier la bonne version TCGplayer.
      const setKey = s.code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const optcgOf = (c) => {
        const rows = optcg.get(c.id) || [];
        return rows.find((r) => r.set_id?.replace(/[^A-Z0-9]/gi, '').toUpperCase() === setKey) || rows[0];
      };
      const tcgMatch = matchByPrice({
        products: tcg.products,
        cards: raw,
        keyOfProduct: (p) => p.number,
        keyOfCard: (c) => c.number,
        groupOf: (p) => p.groupId,
        refOfCard: (c) => (Number(optcgOf(c)?.market_price) || 0) * fx || null,
        refOfProduct: (p) => (tcgplayerRef(p.prices) || 0) * fx || null,
        prior,
        maxRatio: 3,
        tolerant: (c, p) => isRecent(tcg.groups.get(p.groupId)?.publishedOn),
      });

      // Date de sortie : celle de l'extension TCGplayer qui regroupe le plus de cartes du set.
      const groupCount = new Map();
      for (const p of tcgMatch.values()) groupCount.set(p.groupId, (groupCount.get(p.groupId) || 0) + 1);
      const mainGroup = [...groupCount].sort((a, b) => b[1] - a[1])[0]?.[0];
      const date = tcg.groups.get(mainGroup)?.publishedOn?.slice(0, 10) || '';

      // Prix TCGplayer de référence en euros (produit exact, sinon relevé OPTCG API).
      const tcgEur = (c) => {
        const p = tcgMatch.get(c);
        const usd = (p && tcgplayerRef(p.prices)) || Number(optcgOf(c)?.market_price) || null;
        return usd ? usd * fx : null;
      };
      const cmMatch = matchByPrice({
        products: cm.products,
        cards: raw,
        keyOfProduct: codeOf,
        keyOfCard: (c) => c.number,
        groupOf: (p) => p.idExpansion,
        refOfCard: tcgEur,
        refOfProduct: (p) => cardmarketRef(cm.prices.get(p.idProduct)),
        maxRatio: 4,
        tolerant: () => isRecent(date),
      });
      for (const p of cmMatch.values()) cmUsed.add(p.idProduct);

      const cards = raw.map((c) => {
        const f = c.fields;
        const costIsLife = /vie|life|ライフ/i.test(f.cost?.label || '');
        const product = tcgMatch.get(c);
        const prices = [];
        const cmProduct = cmMatch.get(c);
        const cmBlock = cmProduct && cardmarketBlock(cm.prices.get(cmProduct.idProduct), null, { foil: isFoilOnly(product?.prices) });
        if (cmBlock) prices.push(cmBlock);
        const tp = product && tcgplayerBlock(product.prices, product.url);
        if (tp) prices.push(tp);
        else {
          const o = optcgOf(c);
          const market = Number(o?.market_price) || null;
          if (market) prices.push({ source: 'TCGplayer', items: [{ label: 'market', value: market, currency: 'USD' }], ref: { value: market, currency: 'USD' }, updated: o.date_scraped });
        }
        return {
          id: c.id,
          name: c.name,
          number: c.number,
          subtitle: c.rarity,
          // Images officielles dans la langue choisie. Aucune source gratuite sans filigrane « SAMPLE » n'existe :
          // TCGplayer, Limitless et OPTCG API reprennent les mêmes images officielles.
          image: c.officialImage || product?.image,
          thumb: c.officialImage || product?.thumb,
          details: clean([
            ['set', s.label],
            ['number', c.number],
            ['rarity', c.rarity],
            ['type', c.type],
            ['color', f.color?.value],
            [costIsLife ? 'life' : 'cost', f.cost?.value],
            ['power', f.power?.value],
            ['counter', f.counter?.value],
            ['attribute', c.attribute],
            ['subTypes', f.feature?.value],
            ['block', f.block?.value],
          ]),
          texts: [
            f.text?.value && f.text.value !== '-' && { titleKey: 'effect', body: f.text.value },
            f.trigger?.value && { title: f.trigger.label, body: f.trigger.value },
          ].filter(Boolean),
          prices,
          links: [
            { label: 'Cardmarket', url: `https://www.cardmarket.com/${lang === 'fr' ? 'fr' : 'en'}/OnePiece/Products/Search?searchString=${encodeURIComponent(c.number)}` },
            { label: 'TCGplayer', url: product?.url || `https://www.tcgplayer.com/search/one-piece-card-game/product?q=${encodeURIComponent(c.number)}` },
          ],
        };
      });
      sets.push({ id: s.code, name: s.name, subtitle: date ? `${s.code} · ${date}` : s.code, date, cards, tcgGroupId: mainGroup });
    }
    addVariants(sets, { tcg, cm, cmUsed, codeOf, fx, lang, enBases });
    sets.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    await addSetImages(sets, TCGCSV_CATEGORY);
    await writeTcg(outDir, 'onepiece', lang, sets);
  }
}

// Versions vendues mais absentes du site officiel : avant-premières, Anniversary, SP, numérotées, promos de tournoi…
// Elles reprennent le texte de la carte de base (même numéro) dans la langue choisie, avec l'image et le prix TCGplayer.
function addVariants(sets, { tcg, cm, cmUsed, codeOf, fx, lang, enBases }) {
  const baseByNumber = new Map(lang === 'en' ? [] : enBases);
  for (const s of sets) {
    for (const c of s.cards) if (!baseByNumber.has(c.number) || !c.id.includes('_')) baseByNumber.set(c.number, c);
  }
  if (lang === 'en') for (const [k, c] of baseByNumber) enBases.set(k, c);
  const added = addTcgplayerVariants({
    sets,
    products: tcg.products,
    groups: tcg.groups,
    makeCard: (p, g) => {
      const base = baseByNumber.get(p.number);
      // « (027) », « (OP15-051) » : simple numéro pour départager chez TCGplayer, on préfère le nom du groupe.
      const tag = productTag(p.name);
      const label = tag && !/^\(([A-Z]+\d*-)?\d+\)$/.test(tag) ? tag : `(${g?.name})`;
      return {
        id: `tcg${p.productId}`,
        name: base ? `${base.name} ${label}` : p.name,
        number: p.number,
        subtitle: base?.subtitle,
        image: p.image,
        thumb: p.thumb,
        details: [['set', g?.name], ...(base ? base.details.filter(([k]) => k !== 'set') : [['number', p.number]])],
        texts: base?.texts || [],
        prices: [tcgplayerBlock(p.prices, p.url)],
        links: [
          { label: 'Cardmarket', url: `https://www.cardmarket.com/${lang === 'fr' ? 'fr' : 'en'}/OnePiece/Products/Search?searchString=${encodeURIComponent(p.number)}` },
          { label: 'TCGplayer', url: p.url },
        ],
      };
    },
  });
  // Prix Cardmarket : produits de même code pas encore associés, par proximité de prix.
  const free = cm.products.filter((p) => !cmUsed.has(p.idProduct));
  let n = 0;
  for (const [set, list] of added) {
    const cmMatch = matchByPrice({
      products: free,
      cards: list,
      keyOfProduct: codeOf,
      keyOfCard: (x) => x.product.number,
      groupOf: (p) => p.idExpansion,
      refOfCard: (x) => (tcgplayerRef(x.product.prices) || 0) * fx || null,
      refOfProduct: (p) => cardmarketRef(cm.prices.get(p.idProduct)),
      maxRatio: 3,
      tolerant: () => isRecent(set.date),
    });
    for (const [x, p] of cmMatch) {
      const block = cardmarketBlock(cm.prices.get(p.idProduct), null, { foil: isFoilOnly(x.product.prices) });
      if (block) x.card.prices.unshift(block);
      n++;
    }
  }
  const total = [...added.values()].reduce((a, l) => a + l.length, 0);
  console.log(`  onepiece/${lang} : ${total} variantes TCGplayer ajoutées (${n} avec prix Cardmarket)`);
}
