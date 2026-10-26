// Yu-Gi-Oh! : prix Cardmarket par édition (code + rareté), que YGOPRODeck ne donne que pour la carte toutes éditions confondues.
// Cardmarket ne nomme pas les éditions dans ses fichiers publics : on retrouve l'extension Cardmarket par les noms de cartes,
// puis l'édition (rareté) par proximité de prix avec TCGplayer (prix de l'édition fourni par YGOPRODeck).
// Sortie : pipeline/out/yugioh/cardmarket.json = { "LOB-EN001|Ultra Rare": [idProduct, réf, tendance, plus bas, moy. 30 j] }
import {
  getJSON, writeJSON, num, sleep, normName, loadCardmarket, cardmarketRef, buildProductIndex, matchByPrice, getUsdToEur,
  tcgcsvCategoryId, tcgcsvGroups, tcgcsvGroupProducts,
} from './lib.mjs';

const CARDMARKET_GAME = 3;

export async function build(outDir) {
  console.log('Yu-Gi-Oh! (prix Cardmarket par édition)…');
  const [fx, cm, ygo] = await Promise.all([
    getUsdToEur(), loadCardmarket(CARDMARKET_GAME), getJSON('https://db.ygoprodeck.com/api/v7/cardinfo.php'),
  ]);

  // Éditions regroupées par extension YGOPRODeck.
  const bySet = new Map();
  for (const c of ygo.data) {
    for (const e of c.card_sets || []) {
      if (!bySet.has(e.set_name)) bySet.set(e.set_name, []);
      bySet.get(e.set_name).push({ name: c.name, code: e.set_code, rarity: e.set_rarity, tcgUsd: num(e.set_price) });
    }
  }

  const keyOfProduct = (p) => normName(p.name);
  const groupOf = (p) => p.idExpansion;
  const index = buildProductIndex(cm.products, keyOfProduct, groupOf);
  // Meilleure édition pour chaque produit Cardmarket : un produit ne peut valoir que pour une seule édition.
  const best = new Map(); // idProduct → { key, gap, row }
  let printings = 0;
  for (const list of bySet.values()) {
    printings += list.length;
    // Moins de 3 cartes distinctes (promos, lots) : trop peu pour reconnaître l'extension Cardmarket
    // (une carte comme Blue-Eyes existe dans plus de 150 extensions) : pas de prix plutôt qu'un faux.
    if (new Set(list.map((e) => normName(e.name))).size < 3) continue;
    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const match = matchByPrice({
      index,
      cards: list,
      keyOfCard: (e) => normName(e.name),
      refOfCard: (e) => (e.tcgUsd ? e.tcgUsd * fx : null),
      refOfProduct: (p) => cardmarketRef(cm.prices.get(p.idProduct)),
      minRatio: 0.4,
    });
    for (const [e, p] of match) {
      const g = cm.prices.get(p.idProduct);
      const ref = cardmarketRef(g);
      if (!ref) continue;
      const gap = e.tcgUsd ? Math.abs(Math.log(ref / (e.tcgUsd * fx))) : 1;
      const prev = best.get(p.idProduct);
      if (!prev || gap < prev.gap) best.set(p.idProduct, { key: `${e.code}|${e.rarity}`, gap, row: [p.idProduct, ref, num(g.trend), num(g.low), num(g.avg30)] });
    }
  }
  const out = {};
  for (const { key, row } of best.values()) out[key] = row;
  await writeJSON(`${outDir}/yugioh/cardmarket.json`, out);

  // Archétypes (onglet « Archétypes » de l'appli) : nom, carte phare pour l'icône (la plus réimprimée de
  // l'archétype, de préférence un monstre) et nombre de cartes. Sortie : [[nom, id carte, nombre], …]
  const archetypes = new Map();
  for (const c of ygo.data) {
    if (!c.archetype) continue;
    if (!archetypes.has(c.archetype)) archetypes.set(c.archetype, []);
    archetypes.get(c.archetype).push(c);
  }
  const fame = (c) => (c.card_sets?.length || 0) + (/monster/i.test(c.type) ? 1000 : 0);
  const archList = [...archetypes].map(([name, cards]) => [name, cards.reduce((a, b) => (fame(b) > fame(a) ? b : a)).id, cards.length])
    .sort((a, b) => a[0].localeCompare(b[0]));
  await writeJSON(`${outDir}/yugioh/archetypes.json`, archList);
  console.log(`  yugioh : ${archList.length} archétypes`);
  console.log(`  yugioh : ${Object.keys(out).length}/${printings} éditions avec un prix Cardmarket`);

  // Prix TCGplayer par impression ET par tirage (1re édition, Unlimited, Limited), que YGOPRODeck ne distingue pas.
  // Sortie : pipeline/out/yugioh/tcgplayer.json = { "LOB-EN001|Ultra Rare": [productId, [[tirage, marché, plus bas], …]] }
  const categoryId = await tcgcsvCategoryId('yugioh');
  const tcg = {};
  for (const g of await tcgcsvGroups(categoryId)) {
    for (const p of await tcgcsvGroupProducts(categoryId, g.groupId)) {
      const rarity = p.extendedData?.find((e) => e.name === 'Rarity')?.value;
      const prices = p.prices.filter((x) => x.marketPrice || x.lowPrice);
      if (!p.number || !rarity || !prices.length) continue;
      tcg[`${p.number}|${rarity}`] = [p.productId, prices.map((x) => [x.subTypeName, x.marketPrice ?? null, x.lowPrice ?? null])];
    }
    await sleep(40);
  }
  await writeJSON(`${outDir}/yugioh/tcgplayer.json`, tcg);
  console.log(`  yugioh : ${Object.keys(tcg).length} impressions avec prix TCGplayer par tirage`);
}
