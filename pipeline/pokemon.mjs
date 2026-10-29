// Pokémon : prix TCGplayer (via TCGCSV) pour chaque carte TCGdex, que TCGdex ne fournit plus pour la plupart des extensions.
// Les extensions sont reliées par les numéros de cartes qu'elles partagent (« 004/084 ») et la ressemblance des noms
// ou codes d'extension, puis les cartes par leur numéro.
// Sorties (clé = id TCGdex) : pipeline/out/pokemon/tcgplayer.json (international, catégorie 3)
//                             pipeline/out/pokemon/tcgplayer-ja.json (japonais, catégorie 85 « Pokemon Japan »)
// Format : { [id]: [productId, [[finition, marché, plus bas], …]] }
import {
  getJSON, getText, sleep, writeJSON, similarity, normName, tcgcsvGroups, tcgcsvGroupProducts, productTag, groupImage,
  loadCardmarket, cardmarketRef, buildProductIndex, matchByPrice, getUsdToEur, previousJSON, updateHistory, fileId,
} from './lib.mjs';
import { officialImages } from './pokemonOfficial.mjs';

const TCGDEX = 'https://api.tcgdex.net/v2';

// « 004 », « TG05 », « SV001 » : on compare les numéros sans les zéros de tête.
const normNum = (s) => String(s).toUpperCase().replace(/^([A-Z]*)0*(\d)/, '$1$2');
const normCode = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/([a-z])0+(\d)/g, '$1$2');

async function internationalSets() {
  const res = await fetch(`${TCGDEX}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ sets { id name serie { id } cardCount { official } cards { id localId name image } } }' }),
  });
  // Sans les extensions de Pokémon TCG Pocket (jeu mobile, cartes numériques sans prix).
  return (await res.json()).data.sets.filter((s) => s.serie?.id !== 'tcgp');
}

async function japaneseSets() {
  const list = (await getJSON(`${TCGDEX}/ja/sets`)) || [];
  const out = [];
  for (const s of list) {
    const full = await getJSON(`${TCGDEX}/ja/sets/${encodeURIComponent(s.id)}`).catch(() => null);
    if (full?.cards?.length) out.push({ id: full.id, name: full.name, releaseDate: full.releaseDate, cardCount: full.cardCount, cards: full.cards });
    await sleep(40);
  }
  return out;
}

async function catalog(categoryId) {
  const groups = await tcgcsvGroups(categoryId);
  const byGroup = new Map();
  for (const g of groups) {
    const byNumber = new Map();
    for (const p of await tcgcsvGroupProducts(categoryId, g.groupId)) {
      if (!p.number) continue;
      const [n, total] = p.number.split('/');
      const key = normNum(n);
      if (!byNumber.has(key)) byNumber.set(key, []);
      byNumber.get(key).push({ ...p, total });
    }
    byGroup.set(g.groupId, { group: g, byNumber });
    await sleep(60);
  }
  return byGroup;
}

// Pour chaque extension TCGdex : extension TCGplayer qui contient le plus de ses numéros avec le même total,
// départagée par la ressemblance des noms (« Darkness Ablaze » ↔ « SWSH03: Darkness Ablaze ») ou des codes (« SV7 »).
// Total imprimé comparé sans préfixe ni zéros : « SV94 » (Shiny Vault) ↔ 94. Promos : pas de total chez TCGplayer.
const sameTotal = (p, official) => !official || !p.total || normNum(String(p.total).replace(/^[A-Z]+/i, '')) === normNum(official);

function matchSets(sets, byGroup, { compareNames }) {
  const out = {};
  const groupOfSet = {}; // id TCGdex → groupe TCGplayer (pour le visuel de l'extension)
  let matchedSets = 0;
  let matchedCards = 0;
  let totalCards = 0;
  for (const set of sets) {
    const cards = set.cards || [];
    totalCards += cards.length;
    if (!cards.length) continue;
    let best = null;
    for (const { group, byNumber } of byGroup.values()) {
      let hits = 0;
      for (const c of cards) {
        const list = byNumber.get(normNum(c.localId));
        if (list?.some((p) => sameTotal(p, set.cardCount?.official))) hits++;
      }
      if (!hits) continue;
      const sameCode = normCode(group.abbreviation) === normCode(set.id) ? 0.5 : 0;
      const rawSim = similarity(set.name, group.name.replace(/^[^:]*:\s*/, ''));
      const nameSim = compareNames ? 0.3 * rawSim : 0;
      // Numéros sans total chez TCGplayer (« 15 ») : ils correspondent à toutes les extensions ; il faut alors
      // que le code ou le nom concorde (sinon « Majestic Dawn » se retrouvait reliée à « Supreme Victors »).
      const withTotal = cards.some((c) => byNumber.get(normNum(c.localId))?.some((p) => p.total));
      const bothPromos = /promo/i.test(set.name) && /promo/i.test(group.name);
      if (compareNames && !withTotal && set.cardCount?.official && !sameCode && !bothPromos && rawSim < 0.5) continue;
      const score = hits / cards.length + sameCode + nameSim;
      if (!best || score > best.score) best = { score, hits, byNumber, group };
    }
    // Rééditions numérotées autrement chez TCGdex (« Celebrations Classic Collection » : CC001 chez TCGdex,
    // 2/102 chez TCGplayer) : extension de même nom, puis cartes par nom. Sans cela, ces rééditions passaient
    // pour des versions des cartes d'origine, ou l'extension était reliée par ses numéros à un autre groupe.
    const byName = compareNames && matchByName(set, cards, byGroup);
    const nameWins = byName && byName.pairs.length >= cards.length * 0.8 && byName.groupId !== best?.group.groupId;
    if (!best || best.hits < Math.min(5, cards.length * 0.5) || nameWins) {
      if (byName) {
        matchedSets++;
        groupOfSet[set.id] = byName.groupId;
        for (const [c, p] of byName.pairs) {
          out[c.id] = [p.productId, p.prices.map((x) => [x.subTypeName, x.marketPrice ?? null, x.lowPrice ?? null])];
          matchedCards++;
        }
      }
      continue;
    }
    matchedSets++;
    groupOfSet[set.id] = best.group.groupId;
    // Sous-ensembles vendus à part chez TCGplayer : « Crown Zenith: Galarian Gallery », « Hidden Fates: Shiny Vault »…
    const subGroups = [...byGroup.values()].filter(({ group }) => group !== best.group && group.name.startsWith(`${best.group.name}:`));
    for (const c of cards) {
      const list = [best, ...subGroups].map((g) => g.byNumber.get(normNum(c.localId)) || []).find((l) => l.length) || [];
      // Plusieurs produits au même numéro : celui dont le nom ressemble le plus (cartes internationales seulement).
      const p = list.length > 1 && compareNames
        ? list.slice().sort((a, b) => similarity(c.name, b.name) - similarity(c.name, a.name))[0]
        : list[0];
      if (!p || !p.prices.length) continue;
      out[c.id] = [p.productId, p.prices.map((x) => [x.subTypeName, x.marketPrice ?? null, x.lowPrice ?? null])];
      matchedCards++;
    }
  }
  return { out, groupOfSet, matchedSets, matchedCards, totalCards };
}

// Extension TCGplayer au nom quasi identique (« Celebrations: Classic Collection »), cartes associées par leur nom.
function matchByName(set, cards, byGroup) {
  const plain = (s) => s.replace(/[:\s]+/g, ' ').trim();
  const g = [...byGroup.values()]
    .map((x) => ({ x, sim: similarity(plain(set.name), plain(x.group.name.replace(/^(SWSH|SV|SM|XY|ME|BW):\s*/, ''))) }))
    .filter(({ sim }) => sim >= 0.75)
    .sort((a, b) => b.sim - a.sim)[0]?.x;
  if (!g) return null;
  const products = [...g.byNumber.values()].flat().filter((p) => p.prices.length);
  const used = new Set();
  const pairs = [];
  for (const c of cards) {
    const best = products
      .filter((p) => !used.has(p.productId))
      .map((p) => ({ p, sim: similarity(c.name, p.name.replace(/\s*\(.*$/, '').replace(/\s+-\s+.*$/, '')) }))
      .sort((a, b) => b.sim - a.sim)[0];
    if (best && best.sim >= 0.8) {
      used.add(best.p.productId);
      pairs.push([c, best.p]);
    }
  }
  return pairs.length >= Math.min(3, cards.length) ? { groupId: g.group.groupId, pairs } : null;
}

// Produit Cardmarket de chaque carte internationale. TCGdex relie parfois plusieurs versions au même produit
// (Lysandre XY2-90 et son Full Art XY2-104 → le Lysandre normal à 0,44 €). On associe nous-mêmes, comme pour
// One Piece : même nom (sans les attaques « [..] » que Cardmarket ajoute), extension la plus concordante,
// puis version au prix le plus proche du prix TCGplayer. L'appli préfère ce produit à celui de TCGdex.
// Sortie : { [id TCGdex]: [idProduct, { trend, avg, low, avg7, avg30, trend-holo, … }] }
const CM_FIELDS = ['trend', 'avg', 'low', 'avg7', 'avg30', 'trend-holo', 'avg-holo', 'low-holo', 'avg7-holo', 'avg30-holo'];
function matchCardmarket(sets, tcgOut, cm, fx) {
  const index = buildProductIndex(cm.products, (p) => normName(p.name.replace(/\s*\[.*\]\s*$/, '')), (p) => p.idExpansion);
  const usd = (id) => {
    const entries = tcgOut[id]?.[1] || [];
    // Version normale, sinon tirage courant (Unlimited) : celle que Cardmarket cote sans distinction d'édition.
    const main = ['Normal', 'Unlimited', 'Unlimited Holofoil'].map((v) => entries.find(([s, m]) => s === v && m)).find(Boolean);
    return (main || entries.find(([, m]) => m))?.[1] || null;
  };
  const out = {};
  for (const set of sets) {
    const cards = (set.cards || []).filter((c) => usd(c.id));
    if (cards.length < 3) continue;
    const match = matchByPrice({
      index,
      cards,
      keyOfCard: (c) => normName(c.name),
      refOfCard: (c) => usd(c.id) * fx,
      refOfProduct: (p) => cardmarketRef(cm.prices.get(p.idProduct)),
      minRatio: 0.4,
      maxRatio: 3,
    });
    for (const [c, p] of match) {
      const g = cm.prices.get(p.idProduct);
      out[c.id] = [p.idProduct, Object.fromEntries(CM_FIELDS.map((k) => [k, g[k] ?? null]).filter(([, v]) => v))];
    }
  }
  return out;
}

// Versions d'une carte vendues comme produits séparés : tampons (avant-première, League, Prize Pack), motif Master Ball,
// Shadowless, cartes de decks ou blisters… Reliées à la carte TCGdex de même numéro, même total et nom proche.
// Sortie : { [id TCGdex]: [[productId, mention, [[finition, marché, plus bas], …]], …] }
function matchVersions(sets, byGroup, linked) {
  const cardsByKey = new Map();
  for (const set of sets) {
    for (const c of set.cards || []) {
      const key = `${normNum(c.localId)}|${normNum(set.cardCount?.official ?? '')}`;
      if (!cardsByKey.has(key)) cardsByKey.set(key, []);
      cardsByKey.get(key).push(c);
    }
  }
  const out = {};
  let n = 0;
  for (const { group, byNumber } of byGroup.values()) {
    for (const list of byNumber.values()) {
      for (const p of list) {
        if (linked.has(p.productId) || !p.prices.some((x) => x.marketPrice) || !p.total) continue;
        const [num] = p.number.split('/');
        const candidates = cardsByKey.get(`${normNum(num)}|${normNum(String(p.total).replace(/^[A-Z]+/i, ''))}`) || [];
        // « Junk Arm - 87/102 (League Promo) » → « Junk Arm »
        const name = p.name.replace(/\s*\(.*$/, '').replace(/\s+-\s+.*$/, '');
        const best = candidates.map((c) => ({ c, sim: similarity(name, c.name) })).sort((a, b) => b.sim - a.sim)[0];
        if (!best || best.sim < 0.6) continue;
        const tag = productTag(p.name)?.replace(/^\(|\)$/g, '');
        (out[best.c.id] ||= []).push([p.productId, tag ? `${tag} · ${group.name}` : group.name, p.prices.map((x) => [x.subTypeName, x.marketPrice ?? null, x.lowPrice ?? null])]);
        n++;
      }
    }
  }
  return { out, n };
}

// Images de remplacement des cartes sans image TCGdex ni photo TCGplayer : la même carte dans une autre langue
// (même identifiant TCGdex ; le chinois reprend les codes japonais). Ordre de préférence par langue de cartes.
// Sortie : { fr: { 'sv08-001': 'https://assets.tcgdex.net/en/sv/sv08/001' }, … } (l'appli ajoute la qualité).
const FALLBACK_LANGS = { en: ['fr'], fr: ['en'], ja: ['zh'], zh: ['ja', 'en'] };
async function imageFallbacks({ intlSets, jaSets, zhCards, intl, ja }) {
  const frCards = [];
  const shown = new Set(intlSets.map((s) => s.id)); // sans les extensions TCG Pocket, absentes de l'appli
  for (const s of ((await getJSON(`${TCGDEX}/fr/sets`)) || []).filter((x) => shown.has(x.id))) {
    const full = await getJSON(`${TCGDEX}/fr/sets/${encodeURIComponent(s.id)}`).catch(() => null);
    frCards.push(...(full?.cards || []));
    await sleep(40);
  }
  const cardsOf = { en: intlSets.flatMap((s) => s.cards), fr: frCards, ja: jaSets.flatMap((s) => s.cards), zh: zhCards };
  const imageOf = Object.fromEntries(Object.entries(cardsOf).map(([l, cards]) => [l, new Map(cards.filter((c) => c.image).map((c) => [c.id, c.image]))]));
  const tcgplayer = { en: intl, fr: intl, ja, zh: ja }; // photos TCGplayer déjà utilisées par l'appli
  const out = {};
  const missing = {};
  for (const [lang, cards] of Object.entries(cardsOf)) {
    out[lang] = {};
    missing[lang] = new Set();
    for (const c of cards) {
      if (c.image || tcgplayer[lang][c.id]) continue;
      const other = FALLBACK_LANGS[lang].map((l) => imageOf[l].get(c.id)).find(Boolean);
      if (other) out[lang][c.id] = other;
      else missing[lang].add(c.id);
    }
  }
  // Japonais et chinois : images des sites officiels (correspondances de la veille réutilisées).
  const previous = (await previousJSON('pokemon/images.json')) || {};
  const zhSets = [...Map.groupBy(zhCards, (c) => c.id.slice(0, c.id.lastIndexOf('-')))].map(([id, cards]) => ({ id, cards }));
  for (const [lang, sets] of [['ja', jaSets], ['zh', zhSets]]) {
    const found = await officialImages(lang, sets, missing[lang], previous[lang] || {});
    Object.assign(out[lang], found);
    for (const id of Object.keys(found)) missing[lang].delete(id);
  }
  return { images: out, missing };
}

// Historique des prix (history/pokemon/<intl|ja>/<extension>.json) : TCGplayer « marché » de la version de base
// (normale, sinon holo, sinon la première) et Cardmarket « tendance » (sinon moyenne).
const BASE_FINISHES = ['Normal', 'Holofoil', 'Unlimited', '1st Edition'];
function tcgplayerMarket(entry) {
  const rows = entry?.[1] || [];
  const row = BASE_FINISHES.map((f) => rows.find((r) => r[0] === f && r[1] != null)).find(Boolean) || rows.find((r) => r[1] != null);
  return row ? row[1] : null;
}
async function writeHistory(outDir, key, tcgplayer, cardmarket = {}) {
  const bySet = new Map();
  for (const id of new Set([...Object.keys(tcgplayer), ...Object.keys(cardmarket)])) {
    const set = id.slice(0, id.lastIndexOf('-'));
    const g = cardmarket[id]?.[1];
    if (!bySet.has(set)) bySet.set(set, {});
    bySet.get(set)[id] = [g ? g.trend ?? g.avg ?? null : null, tcgplayerMarket(tcgplayer[id])];
  }
  for (const [set, values] of bySet) await updateHistory(outDir, `pokemon/${key}/${fileId(set)}`, values);
}

export async function build(outDir) {
  console.log('Pokémon (prix TCGplayer international)…');
  const [intlSets, intlCatalog] = [await internationalSets(), await catalog(3)];
  const intl = matchSets(intlSets, intlCatalog, { compareNames: true });
  await writeJSON(`${outDir}/pokemon/tcgplayer.json`, intl.out);
  console.log(`  pokemon : ${intl.matchedSets} extensions reliées, ${intl.matchedCards}/${intl.totalCards} cartes avec prix TCGplayer`);
  const [cm, fx] = await Promise.all([loadCardmarket(6), getUsdToEur()]);
  const cmOut = matchCardmarket(intlSets, intl.out, cm, fx);
  await writeJSON(`${outDir}/pokemon/cardmarket.json`, cmOut);
  console.log(`  pokemon : ${Object.keys(cmOut).length} cartes reliées à leur produit Cardmarket`);
  await writeHistory(outDir, 'intl', intl.out, cmOut);
  const versions = matchVersions(intlSets, intlCatalog, new Set(Object.values(intl.out).map((v) => v[0])));
  await writeJSON(`${outDir}/pokemon/tcgplayer-versions.json`, versions.out);
  console.log(`  pokemon : ${versions.n} autres versions (tampons, motifs, Shadowless…) sur ${Object.keys(versions.out).length} cartes`);

  console.log('Pokémon (prix TCGplayer japonais)…');
  const jaSets = await japaneseSets();
  const ja = matchSets(jaSets, await catalog(85), { compareNames: false });
  await writeJSON(`${outDir}/pokemon/tcgplayer-ja.json`, ja.out);
  await writeHistory(outDir, 'ja', ja.out);
  console.log(`  pokemon ja : ${ja.matchedSets}/${jaSets.length} extensions reliées, ${ja.matchedCards}/${ja.totalCards} cartes avec prix TCGplayer`);

  // Dates de sortie des extensions japonaises et chinoises (pour les trier de la plus récente à la plus ancienne).
  const zhDates = {};
  const zhCards = [];
  for (const s of (await getJSON(`${TCGDEX}/zh-tw/sets`)) || []) {
    const full = await getJSON(`${TCGDEX}/zh-tw/sets/${encodeURIComponent(s.id)}`).catch(() => null);
    if (full?.releaseDate) zhDates[s.id] = full.releaseDate;
    zhCards.push(...(full?.cards || []));
    await sleep(40);
  }
  const jaDates = Object.fromEntries(jaSets.filter((s) => s.releaseDate).map((s) => [s.id, s.releaseDate]));
  await writeJSON(`${outDir}/pokemon/setdates.json`, { ja: jaDates, zh: zhDates });

  const { images: fallbacks, missing } = await imageFallbacks({ intlSets, jaSets, zhCards, intl: intl.out, ja: ja.out });
  await writeJSON(`${outDir}/pokemon/images.json`, fallbacks);
  console.log(`  pokemon : images de remplacement ${Object.entries(fallbacks).map(([l, m]) => `${l} ${Object.keys(m).length}`).join(', ')}`);
  console.log(`  pokemon : encore sans image ${Object.entries(missing).map(([l, m]) => `${l} ${m.size}`).join(', ')}`);
  await writeJSON(`${outDir}/pokemon/images-missing.json`, Object.fromEntries(Object.entries(missing).map(([l, m]) => [l, m.size])));

  // Visuel des extensions sans logo TCGdex (toutes les japonaises et chinoises, quelques internationales) :
  // image du booster du groupe TCGplayer relié. Le chinois reprend les codes japonais (S9a, SV1a…).
  const logos = { intl: {}, ja: {} };
  for (const [key, res, categoryId] of [['intl', intl, 3], ['ja', ja, 85]]) {
    for (const [setId, groupId] of Object.entries(res.groupOfSet)) {
      const image = await groupImage(categoryId, groupId);
      if (image) logos[key][setId] = image;
    }
  }
  await writeJSON(`${outDir}/pokemon/setlogos.json`, logos);

  // Espèces de Pokémon (onglet « Pokémon » de l'appli) : numéro du Pokédex national et nom dans chaque langue de
  // cartes, d'après les données ouvertes de PokeAPI. Langues PokeAPI : 5 fr, 9 en, 1 ja (kana), 4 chinois traditionnel.
  const csv = await getText('https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv');
  const LANG_IDS = { 5: 'fr', 9: 'en', 1: 'ja', 4: 'zh' };
  const species = new Map();
  for (const line of csv.split('\n').slice(1)) {
    const [id, langId, name] = line.split(',');
    const lang = LANG_IDS[langId];
    if (!lang || !name) continue;
    if (!species.has(id)) species.set(id, { id: Number(id) });
    species.get(id)[lang] = name;
  }
  const list = [...species.values()].filter((s) => s.en).sort((a, b) => a.id - b.id).map((s) => [s.id, s.fr || s.en, s.en, s.ja || s.en, s.zh || s.en]);
  await writeJSON(`${outDir}/pokemon/species.json`, list);
  console.log(`  pokemon : ${list.length} espèces (noms fr / en / ja / zh)`);
  console.log(`  pokemon : visuels de ${Object.keys(logos.intl).length} extensions internationales et ${Object.keys(logos.ja).length} japonaises`);
  console.log(`  pokemon : dates de ${Object.keys(jaDates).length} extensions japonaises et ${Object.keys(zhDates).length} chinoises`);
}
