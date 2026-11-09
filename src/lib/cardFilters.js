// Tris et filtres des cartes d'une extension (grille de src/components/CardGrid.jsx).
// Chaque carte de la liste porte, quand le jeu les fournit, ses prix (`prices`, mêmes blocs que la fiche) et ses
// caractéristiques (`facets` : rareté, type, couleur) ; la grille y ajoute le prix moyen et ce que l'on possède.
// Raretés rangées d'après les cartes elles-mêmes : prix médian de chaque rareté, de la plus courante à la plus chère —
// même règle pour tous les jeux, sans liste à tenir à jour (« Commune » avant « Rare », « SR » avant « SEC »…).

export const SORTS = ['number', 'priceDesc', 'priceAsc', 'name', 'rarity'];
export const SHOWS = ['all', 'owned', 'missing', 'wished'];
// Tranches de prix, en euros : [clé, minimum inclus, maximum exclu].
export const PRICE_BANDS = [['lt1', 0, 1], ['1to10', 1, 10], ['10to50', 10, 50], ['gte50', 50, Infinity]];
export const FACETS = ['rarity', 'type', 'color'];

export const EMPTY_FILTERS = { sort: 'number', show: 'all', bands: [], rarity: [], type: [], color: [] };

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

// Rang de chaque rareté (0 = la moins chère) ; raretés sans aucun prix connu : après les autres.
export function rarityRanks(rows) {
  const byRarity = new Map();
  for (const r of rows) {
    const k = r.facets?.rarity;
    if (!k) continue;
    if (!byRarity.has(k)) byRarity.set(k, []);
    if (r.price != null) byRarity.get(k).push(r.price);
  }
  const ranked = [...byRarity].map(([k, prices]) => [k, prices.length ? median(prices) : Infinity]).sort((a, b) => a[1] - b[1]);
  return new Map(ranked.map(([k], i) => [k, i]));
}

// Valeurs proposées pour une caractéristique, avec leur nombre de cartes (raretés dans l'ordre des prix,
// sinon les plus fréquentes d'abord). Rien à proposer sous deux valeurs différentes.
export function facetValues(rows, facet, ranks) {
  const counts = new Map();
  for (const r of rows) {
    const v = r.facets?.[facet];
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  if (counts.size < 2) return [];
  const list = [...counts].map(([value, count]) => ({ value, count }));
  return facet === 'rarity' && ranks
    ? list.sort((a, b) => (ranks.get(a.value) ?? 99) - (ranks.get(b.value) ?? 99))
    : list.sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

export const activeCount = (f) => (f.show !== 'all' ? 1 : 0) + f.bands.length + f.rarity.length + f.type.length + f.color.length;

// rows : [{ card, price (€ ou null), owned (exemplaires), wished, facets }], déjà dans l'ordre des numéros.
export function applyFilters(rows, f, text, ranks) {
  const q = text.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (q && !r.card.name.toLowerCase().includes(q) && !String(r.card.number ?? '').toLowerCase().includes(q)) return false;
    if (f.show === 'owned' && !r.owned) return false;
    if (f.show === 'missing' && r.owned) return false;
    if (f.show === 'wished' && !r.wished) return false;
    if (f.bands.length && !(r.price != null && f.bands.some((k) => {
      const [, min, max] = PRICE_BANDS.find(([key]) => key === k);
      return r.price >= min && r.price < max;
    }))) return false;
    for (const facet of FACETS) if (f[facet].length && !f[facet].includes(r.facets?.[facet])) return false;
    return true;
  });
  // Cartes sans prix toujours en fin de liste quand on trie par prix.
  const byPrice = (dir) => (a, b) => (a.price == null) - (b.price == null) || dir * ((a.price ?? 0) - (b.price ?? 0));
  if (f.sort === 'priceDesc') out.sort(byPrice(-1));
  else if (f.sort === 'priceAsc') out.sort(byPrice(1));
  else if (f.sort === 'name') out.sort((a, b) => a.card.name.localeCompare(b.card.name));
  else if (f.sort === 'rarity') {
    out.sort((a, b) => (ranks.get(b.facets?.rarity) ?? -1) - (ranks.get(a.facets?.rarity) ?? -1) || (b.price ?? -1) - (a.price ?? -1));
  }
  return out;
}

// Total des cartes affichées (valeur de ce qui manque, de ce que l'on possède…) : prix moyen × 1.
export const totalOf = (rows) => rows.reduce((s, r) => s + (r.price || 0), 0);
