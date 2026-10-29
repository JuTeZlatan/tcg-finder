// Outils communs au script de collecte (Node 20+, aucune dépendance).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const UA = 'TCGFinder-data/1.0 (+https://github.com)';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, { retries = 3, accept = 'application/json' } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt >= retries) throw new Error(`${url} : ${e.message}`);
      await sleep(1000 * attempt);
    }
  }
}

export async function getJSON(url, opts) {
  const res = await request(url, opts);
  return res ? res.json() : null;
}

export async function getText(url, opts) {
  const res = await request(url, { accept: 'text/html', ...opts });
  return res ? res.text() : null;
}

// Données publiées la veille (GitHub Pages) : permet de ne refaire chaque jour que ce qui manque encore.
export const PUBLISHED_URL = process.env.PUBLISHED_URL || 'https://jutezlatan.github.io/tcg-finder';
export const previousJSON = (path) => getJSON(`${PUBLISHED_URL}/${path}`).catch(() => null);

export async function writeJSON(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

export const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

export const clean = (rows) => rows.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== '-');

// Nom de fichier sûr pour un identifiant d'extension.
export const fileId = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');

// Comparaison de noms tolérante (casse, accents, ponctuation).
export const normName = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Similarité de deux textes (coefficient de Dice sur les paires de lettres), de 0 à 1.
export function similarity(a, b) {
  const pairs = (s) => {
    const f = normName(s).replace(/ /g, '');
    const m = new Map();
    for (let i = 0; i < f.length - 1; i++) m.set(f.slice(i, i + 2), (m.get(f.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const pa = pairs(a);
  const pb = pairs(b);
  let inter = 0;
  let total = 0;
  for (const n of pa.values()) total += n;
  for (const [p, n] of pb) {
    total += n;
    inter += Math.min(n, pa.get(p) || 0);
  }
  return total ? (2 * inter) / total : 0;
}

const ENTITIES ={ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? m;
    })
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// ---------- Cardmarket : fichiers publics quotidiens (catalogue + guide des prix) ----------
const CM = 'https://downloads.s3.cardmarket.com/productCatalog';

export async function loadCardmarket(gameId) {
  const [catalog, guide] = await Promise.all([
    getJSON(`${CM}/productList/products_singles_${gameId}.json`),
    getJSON(`${CM}/priceGuide/price_guide_${gameId}.json`),
  ]);
  const prices = new Map(guide.priceGuides.map((p) => [p.idProduct, p]));
  return { products: catalog.products, prices };
}

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

// Prix de référence Cardmarket robuste : médiane de tendance / moyennes (une « tendance » peut rester bloquée
// à un plancher quand la carte se vend peu), relevée au prix de l'annonce la moins chère s'il est plus haut
// (dans la limite du raisonnable). `foil` : la carte n'existe qu'en foil → on lit les champs « -holo ».
// Selon le jeu, Cardmarket nomme les champs foil « -foil » (One Piece, Lorcana, Riftbound) ou « -holo » (Pokémon).
const foilSuffix = (guide) => ('trend-foil' in guide || 'avg-foil' in guide ? '-foil' : '-holo');

// Lire les prix foil seulement si Cardmarket en a : soit la carte n'existe qu'en foil (demandé par l'appelant),
// soit aucune vente « normale » n'est enregistrée alors que des ventes foil existent.
function useFoil(guide, foil) {
  const fs = foilSuffix(guide);
  const hasFoil = ['avg', 'avg7', 'avg30', 'trend'].some((k) => num(guide[k + fs]) != null);
  return hasFoil && (foil || guide.avg == null);
}

export function cardmarketRef(guide, { foil = false } = {}) {
  if (!guide) return null;
  const fs = foilSuffix(guide);
  const read = (suffix) => {
    const all = ['trend', 'avg', 'avg7', 'avg30'].map((k) => num(guide[k + suffix])).filter(Boolean);
    if (!all.length) return null;
    // Carte qui se vend peu : une statistique peut être aberrante (tendance à 0,02 € quand les ventes sont à 150 €).
    // On écarte celles à plus de ×10 de la médiane des autres.
    const stats = all.filter((v, i) => {
      const others = all.filter((_, j) => j !== i);
      if (others.length < 2) return true;
      const m = median(others);
      return v <= m * 10 && v >= m / 10;
    });
    let ref = median(stats.length ? stats : all);
    const low = num(guide['low' + suffix]);
    if (low && low > ref && low < ref * 10) ref = low;
    return Math.round(ref * 100) / 100;
  };
  return useFoil(guide, foil) ? read(fs) ?? read('') : read('') ?? read(fs);
}

export function cardmarketBlock(guide, url, { foil = false } = {}) {
  if (!guide) return null;
  const fs = foilSuffix(guide);
  const items = [
    ['trend'], ['avg'], ['low'], ['avg7'], ['avg30'], ['trend', 'foil', `trend${fs}`], ['avg', 'foil', `avg${fs}`], ['low', 'foil', `low${fs}`],
  ]
    .map(([label, variant, key]) => ({ label, variant, value: num(guide[key || label]), currency: 'EUR' }))
    .filter((i) => i.value)
    // Carte foil uniquement : les champs « normaux » ne reflètent aucune vente (souvent bloqués à 0,15 €).
    .filter((i) => i.variant || !useFoil(guide, foil));
  if (!items.length) return null;
  const ref = cardmarketRef(guide, { foil });
  return { source: 'Cardmarket', items, ref: ref && { value: ref, currency: 'EUR' }, url };
}

// Taux USD → EUR du jour (BCE via Frankfurter).
let usdToEur = null;
export async function getUsdToEur() {
  if (usdToEur) return usdToEur;
  const res = await getJSON('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR').catch(() => null);
  usdToEur = res?.rates?.EUR ?? 0.9;
  return usdToEur;
}

// Meilleure association n cartes ↔ k produits (chaque produit au plus une fois, une carte peut rester sans produit).
// Les groupes sont petits (versions d'une même carte) : recherche exhaustive avec élagage.
function bestAssignment(n, k, cost) {
  let best = Infinity;
  let bestA = null;
  const used = new Array(k).fill(false);
  const a = new Array(n).fill(-1);
  (function rec(i, acc) {
    if (acc >= best) return;
    if (i === n) { best = acc; bestA = [...a]; return; }
    for (let j = 0; j < k; j++) {
      if (used[j]) continue;
      used[j] = true; a[i] = j;
      rec(i + 1, acc + cost(i, j));
      used[j] = false;
    }
    a[i] = -1;
    rec(i + 1, acc + cost(i, -1));
  })(0, 0);
  return bestA;
}

const logGap = (a, b) => Math.abs(Math.log(a / b));

// Extension sortie il y a moins de 40 jours : peu de ventes, prix très différents d'un site à l'autre.
// On accepte alors un écart de prix 2,5 fois plus grand avant de rejeter une association.
export const RECENT_DAYS = 40;
export const RECENT_TOLERANCE = 2.5;
export const isRecent = (date) => !!date && Date.now() - Date.parse(date) < RECENT_DAYS * 86400000;

// Associe des cartes à des produits d'un autre catalogue quand il n'existe pas d'identifiant commun.
// - Les produits sont regroupés par « extension » (groupOf) ; on essaie chaque extension qui partage
//   assez de clés (code ou nom) avec les cartes, et on garde celle dont les prix concordent le mieux.
// - À clé égale (versions alternatives d'une carte), les versions ont des prix très différents :
//   on choisit l'association qui rapproche le plus les prix (refOfCard ↔ refOfProduct, en euros),
//   et à défaut de prix, l'ordre (n-ième carte ↔ n-ième produit) ou `prior(card, product)`.
// - Une association dont les prix diffèrent de plus de `maxRatio` est rejetée (mieux vaut pas de prix qu'un faux),
//   sauf marge élargie quand `tolerant(card, product)` (extension récente : prix encore instables).
// Index « extension → clé → produits », à construire une fois quand on associe beaucoup d'extensions.
export function buildProductIndex(products, keyOfProduct, groupOf) {
  const byGroup = new Map();
  const groupsByKey = new Map();
  for (const p of products) {
    const key = keyOfProduct(p);
    if (!key) continue;
    const g = groupOf(p);
    if (!byGroup.has(g)) byGroup.set(g, new Map());
    const m = byGroup.get(g);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(p);
    if (!groupsByKey.has(key)) groupsByKey.set(key, new Set());
    groupsByKey.get(key).add(g);
  }
  return { byGroup, groupsByKey };
}

export function matchByPrice({ products, index, cards, keyOfProduct, keyOfCard, groupOf, refOfCard, refOfProduct, prior, minRatio = 0, maxRatio = 4, tolerant }) {
  const { byGroup, groupsByKey } = index || buildProductIndex(products, keyOfProduct, groupOf);
  const keys = new Set(cards.map(keyOfCard));
  // Seules les extensions qui partagent au moins une clé sont évaluées.
  const touched = new Set();
  for (const k of keys) for (const g of groupsByKey.get(k) || []) touched.add(g);
  const scores = [...touched].map((g) => {
    const m = byGroup.get(g);
    return [g, [...keys].filter((k) => m.has(k)).length];
  });
  const bestScore = Math.max(0, ...scores.map(([, s]) => s));
  if (bestScore < Math.min(3, keys.size) || bestScore < keys.size * minRatio) return new Map();
  const candidates = scores.filter(([, s]) => s >= bestScore * 0.5).map(([g]) => g);

  const cardRefs = new Map(cards.map((c) => [c, refOfCard(c)]));
  let best = { quality: -1, result: new Map() };
  for (const g of candidates) {
    const m = byGroup.get(g);
    const result = new Map();
    const groups = new Map();
    for (const c of cards) {
      const k = keyOfCard(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    for (const [k, group] of groups) {
      const prods = (m.get(k) || []).slice().sort((a, b) => (a.idProduct ?? a.productId) - (b.idProduct ?? b.productId));
      if (!prods.length) continue;
      const prodRefs = prods.map(refOfProduct);
      const cost = (i, j) => {
        if (j < 0) return 1.5;
        const r = cardRefs.get(group[i]);
        if (r && prodRefs[j]) return logGap(r, prodRefs[j]);
        return (prior ? prior(group[i], prods[j]) : 0.7) + 0.05 * Math.abs(i - j);
      };
      const assign = group.length <= 7 && prods.length <= 9
        ? bestAssignment(group.length, prods.length, cost)
        : group.map((_, i) => (i < prods.length ? i : -1));
      assign.forEach((j, i) => { if (j >= 0) result.set(group[i], prods[j]); });
    }
    let quality = 0;
    for (const [c, p] of result) {
      const r = cardRefs.get(c);
      const pr = refOfProduct(p);
      if (r && pr && logGap(r, pr) < Math.log(2.5)) quality++;
    }
    quality += result.size / 1000; // départage : plus de cartes associées
    if (quality > best.quality) best = { quality, result };
  }
  for (const [c, p] of best.result) {
    const r = cardRefs.get(c);
    const pr = refOfProduct(p);
    if (r && pr && logGap(r, pr) > Math.log(maxRatio * (tolerant?.(c, p) ? RECENT_TOLERANCE : 1))) best.result.delete(c);
  }
  return best.result;
}

// ---------- TCGplayer via TCGCSV (miroir quotidien gratuit des prix TCGplayer) ----------
const TCGCSV = 'https://tcgcsv.com/tcgplayer';

export async function tcgcsvCategoryId(nameIncludes) {
  const { results } = await getJSON(`${TCGCSV}/categories`);
  return results.find((c) => c.name.toLowerCase().includes(nameIncludes.toLowerCase()))?.categoryId;
}

// productId → [{ subTypeName, marketPrice, lowPrice… }]
export async function tcgcsvPrices(categoryId, groupIds) {
  if (!groupIds) groupIds = (await getJSON(`${TCGCSV}/${categoryId}/groups`)).results.map((g) => g.groupId);
  const map = new Map();
  for (const g of groupIds) {
    const res = await getJSON(`${TCGCSV}/${categoryId}/${g}/prices`);
    for (const p of res?.results || []) {
      if (!map.has(p.productId)) map.set(p.productId, []);
      map.get(p.productId).push(p);
    }
    await sleep(100);
  }
  return map;
}

export async function tcgcsvGroups(categoryId) {
  return (await getJSON(`${TCGCSV}/${categoryId}/groups`)).results;
}

// Produits d'une extension TCGplayer avec leur numéro de carte, leur image et leurs prix.
export async function tcgcsvGroupProducts(categoryId, groupId) {
  const [products, prices] = await Promise.all([
    getJSON(`${TCGCSV}/${categoryId}/${groupId}/products`),
    getJSON(`${TCGCSV}/${categoryId}/${groupId}/prices`),
  ]);
  const byId = new Map();
  for (const p of prices?.results || []) {
    if (!byId.has(p.productId)) byId.set(p.productId, []);
    byId.get(p.productId).push(p);
  }
  return (products?.results || []).map((p) => ({
    productId: p.productId,
    groupId,
    name: p.name,
    number: p.extendedData?.find((e) => e.name === 'Number')?.value,
    image: p.imageUrl ? p.imageUrl.replace(/_\d+w\.jpg$/, '_in_1000x1000.jpg') : null,
    thumb: p.imageUrl ? p.imageUrl.replace(/_\d+w\.jpg$/, '_400w.jpg') : null,
    url: p.url,
    extendedData: p.extendedData, // caractéristiques (rareté, effet, coût…) affichées sur la fiche
    prices: byId.get(p.productId) || [],
  }));
}

// La carte n'existe qu'en finition foil (pas de prix « Normal ») : à comparer au prix foil de Cardmarket.
export const isFoilOnly = (entries) => !!entries?.length && !entries.some((p) => p.subTypeName === 'Normal');

export const tcgplayerRef = (entries) => {
  const main = entries?.find((p) => p.subTypeName === 'Normal' && num(p.marketPrice)) ?? entries?.find((p) => num(p.marketPrice));
  return main ? num(main.marketPrice) : null;
};

export function tcgplayerBlock(entries, url) {
  if (!entries?.length) return null;
  const items = [];
  for (const p of entries) {
    const variant = p.subTypeName?.toLowerCase();
    if (num(p.marketPrice)) items.push({ label: 'market', variant, value: num(p.marketPrice), currency: 'USD' });
    if (num(p.lowPrice)) items.push({ label: 'low', variant, value: num(p.lowPrice), currency: 'USD' });
  }
  if (!items.length) return null;
  const ref = tcgplayerRef(entries);
  return { source: 'TCGplayer', items, ref: ref && { value: ref, currency: 'USD' }, url };
}

// ---------- Variantes connues seulement de TCGplayer ----------
// Les catalogues officiels ne listent pas tout ce qui se vend : avant-premières, promos de tournoi, SP, cartes
// numérotées, signées… Chaque produit TCGplayer avec un prix qu'aucune carte ne référence devient une carte :
// `makeCard(product, group)` la construit (souvent à partir de la carte de base de même numéro), puis elle rejoint
// l'extension reliée à son groupe TCGplayer (`set.tcgGroupId`), ou une nouvelle extension à son nom.
// Renvoie les cartes ajoutées par extension, pour leur associer ensuite un prix Cardmarket.
export function addTcgplayerVariants({ sets, products, groups, makeCard, setIdPrefix = 'tcg-' }) {
  const linked = new Set();
  for (const s of sets) {
    for (const c of s.cards) {
      for (const m of JSON.stringify([c.links, c.prices]).matchAll(/tcgplayer\.com\/product\/(\d+)/g)) linked.add(Number(m[1]));
    }
  }
  const bySetGroup = new Map(sets.filter((s) => s.tcgGroupId).map((s) => [s.tcgGroupId, s]));
  const added = new Map(); // set → [{ card, product }]
  for (const p of products) {
    if (!p.number || linked.has(p.productId) || !tcgplayerRef(p.prices)) continue;
    const g = groups.get(p.groupId);
    const card = makeCard(p, g);
    if (!card) continue;
    let set = bySetGroup.get(p.groupId);
    if (!set) {
      const date = g?.publishedOn?.slice(0, 10) || '';
      const code = g?.abbreviation || String(p.groupId);
      set = { id: setIdPrefix + code, name: g?.name || code, subtitle: date ? `${code} · ${date}` : code, date, cards: [], tcgGroupId: p.groupId };
      sets.push(set);
      bySetGroup.set(p.groupId, set);
    }
    set.cards.push(card);
    linked.add(p.productId);
    if (!added.has(set)) added.set(set, []);
    added.get(set).push({ card, product: p });
  }
  sets.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return added;
}

// Visuel d'extension pour les jeux sans logo publié (One Piece, Lorcana, Riftbound, Dragon Ball) : image du booster
// (sinon de la boîte, sinon du premier produit scellé) du groupe TCGplayer relié à l'extension (`set.tcgGroupId`).
const sealedCache = new Map();
export async function groupImage(categoryId, groupId) {
  if (!sealedCache.has(groupId)) {
    const sealed = (await tcgcsvGroupProducts(categoryId, groupId).catch(() => [])).filter((p) => !p.number && p.thumb);
    const pick = (re) => sealed.find((p) => re.test(p.name) && !/case|bundle|sleeved|blister/i.test(p.name));
    const p = pick(/booster pack/i) || pick(/booster (box|display)/i) || pick(/booster|deck/i) || sealed[0];
    sealedCache.set(groupId, p ? p.thumb.replace(/_400w\.jpg$/, '_200w.jpg') : null);
  }
  return sealedCache.get(groupId);
}

export async function addSetImages(sets, categoryId) {
  for (const set of sets) {
    if (!set.logo && set.tcgGroupId) set.logo = (await groupImage(categoryId, set.tcgGroupId)) || undefined;
  }
}

// Mention entre parenthèses d'un produit TCGplayer (« Rebecca (Championship 2024) » → « (Championship 2024) »).
export const productTag = (name) => name.match(/\s*(\(.*\))\s*$/)?.[1];

// ---------- Écriture d'un jeu : sets.json, sets/<id>.json, search.json ----------
// Un produit TCGplayer ne correspond qu'à une carte. Les sources le relient parfois aussi à une promo de même nom
// (LorcanaJSON : promo « Stitch - Rock Star » reliée au produit de la carte de base) : le prix est alors gardé pour
// la carte dont le prix Cardmarket concorde le mieux (à défaut la carte de base, sinon la première), retiré des autres.
function dedupeTcgplayer(sets) {
  const byProduct = new Map();
  for (const s of sets) {
    for (const c of s.cards) {
      const tp = c.prices.find((p) => p.source === 'TCGplayer');
      const id = tp?.url?.match(/product\/(\d+)/)?.[1];
      if (!id) continue;
      if (!byProduct.has(id)) byProduct.set(id, []);
      byProduct.get(id).push({ c, tp });
    }
  }
  let removed = 0;
  for (const list of byProduct.values()) {
    if (list.length < 2) continue;
    const gap = ({ c, tp }) => {
      const cm = c.prices.find((p) => p.source === 'Cardmarket')?.ref?.value;
      return cm && tp.ref?.value ? Math.abs(Math.log(cm / tp.ref.value)) : 5 + (/^tcg|_/.test(c.id) ? 1 : 0);
    };
    const keep = list.reduce((a, b) => (gap(b) < gap(a) ? b : a));
    for (const x of list) {
      if (x === keep) continue;
      x.c.prices = x.c.prices.filter((p) => p !== x.tp);
      x.c.links = (x.c.links || []).filter((l) => l.url !== x.tp.url);
      removed++;
    }
  }
  return removed;
}

// ---------- Images manquantes (contrôle quotidien) ----------
// Une photo TCGplayer peut ne pas exister (produit pas encore photographié : réponse 403). Chaque jour, les photos
// TCGplayer des cartes sont vérifiées (celles déjà validées les jours précédents sont gardées sans nouvel essai) ;
// une photo absente est remplacée par l'image officielle du même numéro, sinon par celle de la même carte dans
// une autre extension, sinon retirée (l'appli affiche alors « pas d'image » au lieu d'une image cassée).
const OFFICIAL_IMAGE = {
  onepiece: (num, lang) => `https://${{ en: 'en', fr: 'fr' }[lang] || 'www'}.onepiece-cardgame.com/images/cardlist/card/${num}.png`,
  dbsmasters: (num) => `https://www.dbs-cardgame.com/images/cardlist/cardimg/${num}.png`,
  dbsfw: (num) => `https://www.dbs-cardgame.com/fw/images/cards/card/en/${num}.webp`,
};
const tcgplayerProduct = (url) => Number(String(url || '').match(/tcgplayer-cdn\.tcgplayer\.com\/product\/(\d+)_/)?.[1]) || null;
const urlChecks = new Map(); // url → Promise<true | false | null> (null : erreur réseau, on ne conclut rien)
function imageExists(url) {
  if (!urlChecks.has(url)) {
    urlChecks.set(url, (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (TCG Finder data collector)' } });
          if (res.status === 429 || res.status >= 500) { await sleep(1000); continue; }
          return res.ok && /^image\//.test(res.headers.get('content-type') || 'image/');
        } catch {
          await sleep(500);
        }
      }
      return null;
    })());
  }
  return urlChecks.get(url);
}
async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}
const goodProducts = new Map(); // tcgId → Set des produits TCGplayer dont la photo existe (publié chaque jour)

export async function repairImages(tcgId, lang, sets) {
  if (!goodProducts.has(tcgId)) goodProducts.set(tcgId, new Set((await previousJSON(`${tcgId}/imagecheck.json`))?.good || []));
  const good = goodProducts.get(tcgId);
  const cards = sets.flatMap((s) => s.cards);
  const toCheck = [...new Set(cards.map((c) => tcgplayerProduct(c.thumb || c.image)).filter((id) => id && !good.has(id)))];
  const bad = new Set();
  await pool(toCheck, 24, async (id) => {
    const ok = await imageExists(`https://tcgplayer-cdn.tcgplayer.com/product/${id}_400w.jpg`);
    if (ok) good.add(id);
    else if (ok === false) bad.add(id);
  });
  const broken = cards.filter((c) => bad.has(tcgplayerProduct(c.thumb || c.image)));
  if (!broken.length) return { checked: toCheck.length, fixed: 0, removed: 0 };
  // Même numéro ailleurs (réédition, version de base) avec une image valable : numéro exact, puis sans préfixe
  // d'extension ni astérisque (« 051/221 » = « SFD-051/221 », « 168* » = « RAD-168 »), puis sans lettre de variante,
  // enfin même nom exact (runes, jetons réimprimés).
  const numberKeys = (n) => {
    const exact = String(n || '').trim();
    const loose = exact.replace(/^[A-Z]{2,4}-(?=\d)/i, '').replace(/\*/g, '').toUpperCase();
    return [exact, `~${loose}`, `~~${loose.replace(/^(\d+)[A-Z]+/, '$1')}`];
  };
  const byNumber = new Map();
  for (const c of cards) {
    if (!c.number || bad.has(tcgplayerProduct(c.thumb || c.image)) || !(c.image || c.thumb)) continue;
    for (const k of [...numberKeys(c.number), `name:${c.name}`]) if (!byNumber.has(k)) byNumber.set(k, c);
  }
  let fixed = 0;
  let removed = 0;
  await pool(broken, 8, async (c) => {
    const num = String(c.number || '').split('/')[0].trim();
    const official = OFFICIAL_IMAGE[tcgId] && /^[A-Z0-9]+-[A-Z0-9]+$/i.test(num) ? OFFICIAL_IMAGE[tcgId](num, lang) : null;
    const other = [...numberKeys(c.number), `name:${c.name}`].map((k) => byNumber.get(k)).find(Boolean);
    const url = (official && (await imageExists(official)) && official) || (other && (other.image || other.thumb));
    if (url) {
      c.image = url;
      c.thumb = other && url === (other.image || other.thumb) ? other.thumb || url : url;
      fixed++;
    } else {
      delete c.image;
      delete c.thumb;
      removed++;
    }
  });
  return { checked: toCheck.length, fixed, removed };
}

export async function writeTcg(outDir, tcgId, lang, sets) {
  const dup = dedupeTcgplayer(sets);
  if (dup) console.log(`  ${tcgId}/${lang} : ${dup} prix TCGplayer en double retirés (produit relié à plusieurs cartes)`);
  const img = await repairImages(tcgId, lang, sets);
  if (img.fixed || img.removed) console.log(`  ${tcgId}/${lang} : ${img.checked} photos TCGplayer vérifiées, ${img.fixed} images remplacées, ${img.removed} sans image`);
  await writeJSON(`${outDir}/${tcgId}/imagecheck.json`, { good: [...goodProducts.get(tcgId)].sort((a, b) => a - b) });
  const base = `${outDir}/${tcgId}/${lang}`;
  const search = [];
  for (const set of sets) {
    await writeJSON(`${base}/sets/${fileId(set.id)}.json`, set.cards);
    for (const c of set.cards) search.push([c.id, c.name, set.id, c.number ?? '', c.image ?? '', c.nameEn ?? '']);
  }
  await writeJSON(
    `${base}/sets.json`,
    sets.map(({ cards, tcgGroupId, ...s }) => ({ ...s, count: cards.length })),
  );
  await writeJSON(`${base}/search.json`, search);
  const priced = sets.reduce((n, s) => n + s.cards.filter((c) => c.prices.length).length, 0);
  const total = sets.reduce((n, s) => n + s.cards.length, 0);
  console.log(`  ${tcgId}/${lang} : ${sets.length} extensions, ${total} cartes, ${priced} avec prix`);
}
