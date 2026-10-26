// Prix de référence Cardmarket robuste (même règle que le script de collecte, pipeline/lib.mjs) :
// médiane de tendance / moyennes (une « tendance » peut rester bloquée à un plancher quand la carte se vend peu),
// relevée au prix de l'annonce la moins chère s'il est plus haut (dans la limite du raisonnable),
// et lecture des champs foil (« -holo » ou « -foil ») pour les cartes qui n'existent qu'en foil.
const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) && n > 0 ? n : null;
};

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

const foilSuffix = (g) => ('trend-foil' in g || 'avg-foil' in g ? '-foil' : '-holo');

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
  const hasFoil = ['avg', 'avg7', 'avg30', 'trend'].some((k) => num(guide[k + fs]) != null);
  const useFoil = hasFoil && (foil || guide.avg == null);
  return useFoil ? read(fs) ?? read('') : read('') ?? read(fs);
}
