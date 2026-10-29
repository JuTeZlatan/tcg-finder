// Historique des prix d'une carte (collecté chaque jour, voir pipeline/lib.mjs updateHistory) :
// { days: ['2026-10-29', …], points: [[cardmarket €, tcgplayer $], …] } → valeurs en euros selon la source choisie.
import { getPreferredSource } from './prices';

const fileId = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');
export const historyFile = (path, setId) => `history/${path}/${fileId(setId)}.json`;

// [{ date, value }] en euros (moyenne des sources retenues, comme le prix affiché), jours sans prix écartés.
export function historyValues(history, usdToEur, source = getPreferredSource()) {
  if (!history?.points) return [];
  return history.days.map((date, i) => {
    const [cm, tcp] = history.points[i] || [];
    const values = [
      source !== 'tcgplayer' && cm != null ? cm : null,
      source !== 'cardmarket' && tcp != null ? tcp * usdToEur : null,
    ].filter((v) => v != null);
    return { date, value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
  }).filter((p) => p.value != null);
}

// Variation sur `days` jours : { from, to, diff, pct } par rapport au point le plus proche avant cette date.
export function changeOver(values, days) {
  if (values.length < 2) return null;
  const last = values[values.length - 1];
  const limit = Date.parse(last.date) - days * 86400000;
  const before = [...values].reverse().find((p) => Date.parse(p.date) <= limit);
  if (!before) return null;
  const diff = last.value - before.value;
  return { from: before.value, to: last.value, diff, pct: before.value ? (diff / before.value) * 100 : null };
}
