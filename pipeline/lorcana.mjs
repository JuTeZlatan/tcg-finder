// Disney Lorcana : catalogue FR/EN (textes + images officielles) via LorcanaJSON,
// qui fournit aussi les identifiants Cardmarket et TCGplayer de chaque carte → association exacte.
// Pour les cartes encore sans identifiants (extensions toutes récentes), association de secours :
// TCGplayer par extension + numéro (+ nom), Cardmarket par nom anglais puis proximité de prix.
import {
  getJSON, clean, normName, similarity, loadCardmarket, cardmarketBlock, cardmarketRef, matchByPrice, getUsdToEur,
  tcgcsvCategoryId, tcgcsvGroups, tcgcsvGroupProducts, tcgcsvPrices, tcgplayerBlock, tcgplayerRef, isFoilOnly, writeTcg,
  isRecent, addTcgplayerVariants, productTag, addSetImages,
} from './lib.mjs';

// Promos absentes de LorcanaJSON (Disney Lorcana Promo, D23, cartes de tournoi…) : produits TCGplayer avec prix
// qu'aucune carte ne référence. Base = carte de même nom (textes, caractéristiques) dans la langue choisie.
let allProducts;
const untagged = (name) => normName(name.replace(/\s*\(.*$/, ''));
async function addVariants(sets, { categoryId, groups, cm, fx, lang, enCards }) {
  if (!allProducts) {
    allProducts = [];
    for (const g of groups) allProducts.push(...(await tcgcsvGroupProducts(categoryId, g.groupId)));
  }
  // Les produits TCGplayer sont en anglais : nom anglais → identifiant LorcanaJSON → carte dans la langue choisie.
  const byId = new Map(sets.flatMap((s) => s.cards.map((c) => [c.id, c])));
  const baseByName = new Map();
  for (const c of enCards) if (!baseByName.has(untagged(c.fullName))) baseByName.set(untagged(c.fullName), byId.get(String(c.id)));
  const added = addTcgplayerVariants({
    sets,
    products: allProducts,
    groups: new Map(groups.map((g) => [g.groupId, g])),
    makeCard: (p, g) => {
      const base = baseByName.get(untagged(p.name));
      const tag = productTag(p.name);
      return {
        id: `tcg${p.productId}`,
        name: base ? `${base.name} ${tag || `(${g?.name})`}` : p.name,
        number: p.number,
        subtitle: base?.subtitle,
        image: p.image,
        thumb: p.thumb,
        details: [['set', g?.name], ['number', p.number], ...(base ? base.details.filter(([k]) => k !== 'set' && k !== 'number') : [])],
        texts: base?.texts || [],
        prices: [tcgplayerBlock(p.prices, p.url)],
        links: [
          { label: 'TCGplayer', url: p.url },
          { label: 'Cardmarket', url: `https://www.cardmarket.com/${lang === 'fr' ? 'fr' : 'en'}/Lorcana/Products/Search?searchString=${encodeURIComponent(p.name.replace(/\s*\(.*$/, ''))}` },
        ],
      };
    },
  });
  let n = 0;
  for (const [set, list] of added) {
    const match = matchByPrice({
      products: cm.products,
      cards: list,
      keyOfProduct: (p) => normName(p.name),
      keyOfCard: (x) => untagged(x.product.name),
      groupOf: (p) => p.idExpansion,
      refOfCard: (x) => (tcgplayerRef(x.product.prices) || 0) * fx || null,
      refOfProduct: (p) => cardmarketRef(cm.prices.get(p.idProduct), { foil: true }),
      maxRatio: 3,
      tolerant: () => isRecent(set.date),
    });
    for (const [x, p] of match) {
      const block = cardmarketBlock(cm.prices.get(p.idProduct), null, { foil: true });
      if (block) { x.card.prices.unshift(block); n++; }
    }
  }
  const total = [...added.values()].reduce((a, l) => a + l.length, 0);
  console.log(`  lorcana/${lang} : ${total} variantes TCGplayer ajoutées (${n} avec prix Cardmarket)`);
}

const LORCANAJSON = (lang) => `https://lorcanajson.org/files/current/${lang}/allCards.json`;
const CARDMARKET_GAME = 19;

export async function build(outDir) {
  console.log('Lorcana…');
  const categoryId = await tcgcsvCategoryId('lorcana');
  const [fx, cm, tcg, groups, en, fr] = await Promise.all([
    getUsdToEur(), loadCardmarket(CARDMARKET_GAME), tcgcsvPrices(categoryId), tcgcsvGroups(categoryId),
    getJSON(LORCANAJSON('en')), getJSON(LORCANAJSON('fr')),
  ]);
  const enById = new Map(en.cards.map((c) => [c.id, c]));
  const groupByCode = new Map(groups.map((g) => [String(g.abbreviation).trim(), g]));

  // ---- Associations de secours, calculées une fois (sur les cartes anglaises) ----
  const missing = en.cards.filter((c) => !c.externalLinks?.tcgPlayerId || !c.externalLinks?.cardmarketId);
  const fallbackTcg = new Map(); // id carte → produit TCGplayer
  const productsCache = new Map();
  for (const c of missing.filter((c) => !c.externalLinks?.tcgPlayerId)) {
    const g = groupByCode.get(String(c.setCode));
    if (!g) continue;
    if (!productsCache.has(g.groupId)) productsCache.set(g.groupId, await tcgcsvGroupProducts(categoryId, g.groupId));
    const candidates = productsCache.get(g.groupId).filter((p) => p.number && parseInt(p.number, 10) === c.number);
    const best = candidates.sort((a, b) => similarity(c.fullName, b.name) - similarity(c.fullName, a.name))[0];
    if (best && similarity(c.fullName, best.name) >= 0.5) fallbackTcg.set(c.id, best);
  }
  const tcgEntriesOf = (c) => tcg.get(c.externalLinks?.tcgPlayerId) || fallbackTcg.get(c.id)?.prices;
  const fallbackCm = matchByPrice({
    products: cm.products,
    cards: missing.filter((c) => !c.externalLinks?.cardmarketId),
    keyOfProduct: (p) => normName(p.name),
    keyOfCard: (c) => normName(c.fullName),
    groupOf: (p) => p.idExpansion,
    refOfCard: (c) => (tcgplayerRef(tcgEntriesOf(c)) || 0) * fx || null,
    refOfProduct: (p) => cardmarketRef(cm.prices.get(p.idProduct), { foil: true }),
    minRatio: 0.5,
  });
  console.log(`  lorcana : secours TCGplayer ${fallbackTcg.size}, Cardmarket ${fallbackCm.size} (sur ${missing.length} cartes sans identifiant)`);

  for (const [lang, data] of [['fr', fr], ['en', en]]) {
    const sets = Object.entries(data.sets).map(([code, s]) => ({
      id: code,
      name: s.name,
      subtitle: `${code}${s.releaseDate ? ` · ${s.releaseDate}` : ''}`,
      date: s.releaseDate || '',
      cards: [],
    }));
    const byCode = new Map(sets.map((s) => [s.id, s]));

    for (const c of data.cards) {
      const set = byCode.get(String(c.setCode));
      if (!set) continue;
      const enCard = enById.get(c.id) || c;
      const links = c.externalLinks || {};
      const tcgEntries = tcgEntriesOf(enCard);
      const fbTcg = fallbackTcg.get(c.id);
      const cmId = links.cardmarketId || fallbackCm.get(enCard)?.idProduct;
      const tcgUrl = links.tcgPlayerUrl || (fbTcg && `https://www.tcgplayer.com/product/${fbTcg.productId}`);
      const prices = [
        cardmarketBlock(cm.prices.get(cmId), links.cardmarketUrl, {
          foil: isFoilOnly(tcgEntries) || (c.foilTypes?.length > 0 && !c.foilTypes.includes('None')),
        }),
        tcgplayerBlock(tcgEntries, tcgUrl),
      ].filter(Boolean);
      set.cards.push({
        id: String(c.id),
        name: c.fullName,
        number: String(c.number),
        subtitle: c.rarity,
        image: c.images?.full,
        thumb: c.images?.thumbnail,
        details: clean([
          ['set', set.name],
          ['number', `${c.number} · ${c.setCode}`],
          ['rarity', c.rarity],
          ['type', [].concat(c.type).join(', ')],
          ['ink', c.color],
          ['cost', c.cost],
          ['inkwell', c.inkwell == null ? null : c.inkwell ? '✓' : '✗'],
          ['strength', c.strength],
          ['willpower', c.willpower],
          ['lore', c.lore],
          ['subTypes', c.subtypesText],
          ['illustrator', c.artistsText],
        ]),
        texts: [
          c.fullText && { titleKey: 'effect', body: c.fullText },
          c.flavorText && { titleKey: 'flavor', body: `« ${c.flavorText} »` },
        ].filter(Boolean),
        prices,
        links: [
          links.cardmarketUrl && { label: 'Cardmarket', url: links.cardmarketUrl },
          tcgUrl && { label: 'TCGplayer', url: tcgUrl },
          links.cardTraderUrl && { label: 'CardTrader', url: links.cardTraderUrl },
        ].filter(Boolean),
      });
    }
    for (const s of sets) s.cards.sort((a, b) => Number(a.number) - Number(b.number));
    for (const s of sets) s.tcgGroupId = groupByCode.get(s.id)?.groupId;
    await addVariants(sets, { categoryId, groups, cm, fx, lang, enCards: en.cards });
    sets.sort((a, b) => b.date.localeCompare(a.date));
    await addSetImages(sets, categoryId);
    await writeTcg(outDir, 'lorcana', lang, sets.filter((s) => s.cards.length));
  }
}
