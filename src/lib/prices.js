// Prix moyen d'une carte : moyenne des prix de référence de chaque source (Cardmarket, TCGplayer…), en euros.
import { getJSON, memo } from '../api/http';
import { pricesForFinish } from './finishes';

// Taux de change du jour (BCE via Frankfurter). En cas d'échec, taux approximatif.
export const getUsdToEur = memo(async () => {
  try {
    const res = await getJSON('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR');
    return res?.rates?.EUR ?? 0.9;
  } catch {
    return 0.9;
  }
});

export function toEur(value, currency, usdToEur) {
  if (currency === 'EUR') return value;
  if (currency === 'USD') return value * usdToEur;
  return null; // ex. tickets MTGO : pas une monnaie
}

// Extension sortie il y a moins de 40 jours : peu de ventes, les prix varient encore beaucoup d'un site à l'autre.
export const RECENT_DAYS = 40;
export const isRecentSet = (date) => !!date && Date.now() - Date.parse(date) < RECENT_DAYS * 86400000;

// Site(s) de prix choisi(s) dans le menu : 'both' (moyenne Cardmarket + TCGplayer), 'cardmarket' ou 'tcgplayer'.
// Réglage global (src/lib/settings.js le tient à jour) : toute l'appli calcule ses prix avec la même source.
export const PRICE_SOURCES = { both: 'Les deux', cardmarket: 'Cardmarket', tcgplayer: 'TCGplayer' };
const SOURCE_NAMES = { cardmarket: 'Cardmarket', tcgplayer: 'TCGplayer' };
let preferredSource = 'both';
export const setPreferredSource = (source) => {
  preferredSource = PRICE_SOURCES[source] ? source : 'both';
};
export const getPreferredSource = () => preferredSource;
// Blocs de prix à afficher / utiliser selon la source choisie (les autres blocs, ex. eBay, restent affichés).
export const isShownSource = (p, source = preferredSource) =>
  source === 'both' || !Object.values(SOURCE_NAMES).includes(p.source) || p.source === SOURCE_NAMES[source];

// `recent` : marge d'erreur élargie (écart toléré ×6 au lieu de ×2,5 avant de signaler des prix divergents).
// `finish` : version de la carte (foil, reverse…) ; par défaut la version de référence de chaque site.
// `source` : site(s) retenu(s), par défaut le réglage du menu.
export function averagePrice(prices, usdToEur, { recent = false, finish = null, source = preferredSource } = {}) {
  const refs = pricesForFinish(prices, finish)
    .filter((p) => isShownSource(p, source))
    .filter((p) => p.ref?.value)
    .map((p) => ({ source: p.source ?? p.sourceKey, eur: toEur(p.ref.value, p.ref.currency, usdToEur) }))
    .filter((r) => r.eur != null);
  if (!refs.length) return null;
  const avg = refs.reduce((s, r) => s + r.eur, 0) / refs.length;
  const values = refs.map((r) => r.eur);
  // Sites très éloignés (plus de ×2,5) : souvent une version différente (alternative, réédition) ou un marché peu actif.
  const spread = Math.max(...values) / Math.min(...values);
  return { value: avg, sources: refs.map((r) => r.source), divergent: refs.length > 1 && spread > (recent ? 6 : 2.5) && Math.max(...values) >= 1, recent };
}

const formatters = {};
export function formatPrice(value, currency) {
  if (currency === 'TIX') return `${value.toFixed(2)} tix`;
  formatters[currency] ??= new Intl.NumberFormat('fr-FR', { style: 'currency', currency });
  return formatters[currency].format(value);
}
