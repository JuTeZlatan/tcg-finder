// Versions d'une carte : normale, foil, holo, reverse, 1re édition, motifs (Master Ball…), tampons…
// Chaque version est une carte distincte à collectionner : toutes celles qu'un site vend doivent pouvoir être ajoutées,
// même quand leur prix est peu fiable (signalé, jamais masqué).
// Déduites des lignes de prix des connecteurs : chaque prix porte sa variante (sans variante = version normale).
// Un bloc `versions: true` liste des versions vendues comme produits séparés (Pokémon : motifs, tampons, Shadowless…),
// avec un prix chacune ; il n'entre pas dans le prix des autres versions.

const ORDER = ['normal', 'holo', 'reverse', 'foil', 'cold foil', 'holofoil', 'etched', 'firstEdition', 'firstEditionHolo', 'unlimited', 'unlimitedHolo', 'limited'];

export const FINISH_NAMES = {
  normal: 'Normale', holo: 'Holo', reverse: 'Reverse', foil: 'Foil', etched: 'Etched (gravée)',
  firstEdition: '1re édition', firstEditionHolo: '1re édition holo', unlimited: 'Unlimited', unlimitedHolo: 'Unlimited holo',
  limited: 'Édition limitée', 'cold foil': 'Cold foil', holofoil: 'Holofoil',
};
export const finishName = (f) => FINISH_NAMES[f] ?? f;

// Prix qui ne correspondent pas à une version physique (tickets MTGO…).
const isPhysical = (item) => item.currency === 'EUR' || item.currency === 'USD';
const SALES = new Set(['market', 'price', 'trend', 'avg', 'avg1', 'avg7', 'avg30']);
const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

// Noms bruts des sites (sous-types TCGplayer) → versions communes : « Holofoil » / « Cold Foil » sont en général
// le foil de la carte (Lorcana, Dragon Ball…). Mais si un même site en cote deux qui tomberaient sur le même nom,
// ce sont deux cartes différentes : on garde alors leurs noms d'origine.
const ALIASES = { holofoil: 'foil', 'cold foil': 'foil', 'reverse holofoil': 'reverse', '1st edition': 'firstEdition' };
function finishMap(p) {
  const raws = [...new Set((p.items || []).filter(isPhysical).map((i) => i.variant || 'normal'))];
  const target = (r) => ALIASES[r] || r;
  const count = new Map();
  for (const r of raws) count.set(target(r), (count.get(target(r)) || 0) + 1);
  return new Map(raws.map((r) => [r, count.get(target(r)) > 1 ? r : target(r)]));
}
const finishesOfSource = (p) => new Set(finishMap(p).values());
const itemsOf = (p, finish) => {
  const m = finishMap(p);
  return (p.items || []).filter((i) => isPhysical(i) && m.get(i.variant || 'normal') === finish);
};
const mainSources = (prices) => (prices || []).filter((p) => !p.versions);
const versionItems = (prices) => (prices || []).filter((p) => p.versions).flatMap((p) => p.items || []);

// Versions proposées. Un site qui ne cote qu'une version la nomme parfois autrement (One Piece : « normale » chez
// l'un, « foil » chez l'autre pour la même carte) : à lui seul, il ne crée pas de choix.
export function finishesOf(prices) {
  const set = new Set();
  for (const p of mainSources(prices)) {
    const own = finishesOfSource(p);
    if (own.size > 1) for (const f of own) set.add(f);
  }
  const rank = (f) => (ORDER.includes(f) ? ORDER.indexOf(f) : ORDER.length);
  const list = [...set].sort((a, b) => rank(a) - rank(b));
  const extra = versionItems(prices).map((i) => i.variant);
  if (!extra.length) return list.length > 1 ? list : [];
  // Versions vendues à part : la carte « principale » d'abord, puis chacune d'elles.
  const main = list.length ? list : [[...finishesOfSource(mainSources(prices)[0] || {})][0] || 'normal'];
  return [...main, ...extra];
}

// Version de référence (celle des prix « principaux » de chaque site) : la normale si elle existe,
// sinon le tirage courant (Unlimited) plutôt que la 1re édition, sinon la première.
const DEFAULTS = ['normal', 'unlimited', 'unlimitedHolo'];
export const defaultFinish = (finishes) => DEFAULTS.find((f) => finishes.includes(f)) || finishes[0];

// Nom affiché d'une version (les versions vendues à part, ou les raretés Yu-Gi-Oh!, portent leur propre nom).
export const finishLabel = (prices, f) =>
  (prices || []).flatMap((p) => p.items || []).find((i) => i.variant === f && i.name)?.name || finishName(f);

// Version à enregistrer : rien pour la version de référence (identique aux cartes déjà en collection).
export const storedFinish = (prices, finish) => {
  const finishes = finishesOf(prices);
  return finishes.length > 1 && finish && finish !== defaultFinish(finishes) ? finish : null;
};

// Prix peu fiable pour cette version : aucun prix de marché ni deux statistiques de ventes sur aucun site, ou
// version spéciale cotée à moins de la moitié de la normale (ventes isolées, ex. foil à 0,02 €).
export function isThinPrice(prices, finish) {
  const def = defaultFinish(finishesOf(prices));
  // Version vendue à part : peu fiable si seule l'annonce la moins chère est connue (aucune vente récente).
  const version = versionItems(prices).find((i) => i.variant === finish);
  if (version) return version.label === 'low';
  if (!finish || finish === def) return false;
  const level = (f) => {
    let weight = 0;
    const values = [];
    for (const p of mainSources(prices)) {
      for (const i of itemsOf(p, f)) {
        if (!SALES.has(i.label)) continue;
        weight += i.label === 'market' || i.label === 'price' ? 2 : 1;
        values.push(i.currency === 'USD' ? i.value * 0.9 : i.value);
      }
    }
    return { weight, value: values.length ? median(values) : null };
  };
  const mine = level(finish);
  const ref = level(def);
  return mine.weight < 2 || (ref.value && mine.value != null && mine.value < ref.value * 0.5);
}

// Ordre de préférence des prix quand une version n'a ni prix de marché ni statistiques de ventes.
const PREF = ['market', 'trend', 'avg', 'price', 'avg30', 'avg7', 'low', 'lowestListing'];

// Lignes de prix ramenées à une version : chaque site garde son prix pour cette version (ou est écarté).
export function pricesForFinish(prices, finish) {
  const finishes = finishesOf(prices);
  const main = mainSources(prices);
  if (finishes.length < 2) return main;
  const version = versionItems(prices).find((i) => i.variant === finish);
  if (version) {
    const block = prices.find((p) => p.versions);
    return [{ ...block, ref: { value: version.value, currency: version.currency } }];
  }
  const def = defaultFinish(finishes);
  if (!finish || finish === def) {
    // Version de référence : un site qui ne cote qu'une autre version proposée (ex. seulement la foil) en est exclu.
    return main.filter((p) => {
      const own = finishesOfSource(p);
      return own.size !== 1 || own.has(def) || !finishes.includes([...own][0]);
    });
  }
  return main
    .map((p) => {
      // Site qui ne cote qu'une version : on ne sait pas laquelle au juste, il n'entre que dans le prix de référence.
      if (finishesOfSource(p).size < 2) return null;
      const items = itemsOf(p, finish);
      // Prix de marché s'il existe, sinon médiane des statistiques de ventes (une tendance isolée peut être aberrante),
      // sinon le premier prix disponible (ex. 1re édition sans vente récente : l'annonce la moins chère).
      const market = items.find((i) => i.label === 'market' || i.label === 'price');
      const sales = items.filter((i) => SALES.has(i.label));
      const value = market?.value ?? (sales.length ? median(sales.map((i) => i.value)) : null);
      const pick = value != null ? { value, currency: (market || sales[0]).currency }
        : PREF.map((l) => items.find((i) => i.label === l)).find(Boolean) || items[0];
      return pick ? { ...p, ref: { value: pick.value, currency: pick.currency } } : null;
    })
    .filter(Boolean);
}
