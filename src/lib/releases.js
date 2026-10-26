// Sorties d'extensions (onglet « Sorties ») : données collectées chaque jour (pipeline/upcoming.mjs),
// sorties suivies par l'utilisateur, et lien vers l'extension quand ses cartes sont déjà dans l'appli.
import { memo } from '../api/http';
import { loadBundledFile } from '../api/bundledData';
import { loadData } from '../api/dataSource';
import { getTcg, dataLang } from '../api';

export const DAY = 86400000;
export const SOON_DAYS = 14;

// [{ tcg, name, date, code, image, imageTint, key }]
export const loadReleases = memo(async () => {
  let list = [];
  try {
    list = await loadData('upcoming.json', () => loadBundledFile('upcoming'));
  } catch {
    // pas de données : liste vide
  }
  return list.map((r) => ({ ...r, key: `${r.tcg}|${r.code || r.name}|${r.date}` }));
});

// Jours avant la sortie (0 = aujourd'hui, négatif = déjà sortie). Calcul en dates locales.
export function daysUntil(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - today) / DAY);
}

export function countdown(days) {
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Demain';
  if (days > 1) return `Dans ${days} jours`;
  if (days === -1) return 'Sortie hier';
  return `Sortie il y a ${-days} jours`;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2));

// Extension de l'appli qui correspond à une sortie (même code, ou nom proche et date voisine), ou null.
export async function findSetForRelease(release, cardLang) {
  const tcg = getTcg(release.tcg);
  if (!tcg) return null;
  const lang = dataLang(tcg, cardLang);
  const sets = await tcg.getSets(lang).catch(() => []);
  const code = norm(release.code).replace(/ /g, '');
  const byCode = code && sets.find((s) => [s.id, `tcg-${release.code}`].some((id) => norm(id).replace(/ /g, '') === code)
    || norm(s.id) === norm(`tcg ${release.code}`));
  if (byCode) return { tcg: tcg.id, setId: byCode.id, name: byCode.name };
  const target = words(release.name);
  const near = (s) => !s.date || Math.abs(Date.parse(s.date) - Date.parse(release.date)) <= 21 * DAY;
  let best = null;
  for (const s of sets) {
    if (!near(s)) continue;
    const w = words(s.name);
    const common = [...target].filter((x) => w.has(x)).length;
    const score = common / Math.max(1, Math.min(target.size, w.size));
    if (score >= 0.6 && (!best || score > best.score)) best = { score, s };
  }
  return best ? { tcg: tcg.id, setId: best.s.id, name: best.s.name } : null;
}

// Rubrique Cardmarket de chaque jeu.
const CARDMARKET_GAME = {
  pokemon: 'Pokemon', magic: 'Magic', yugioh: 'YuGiOh', onepiece: 'OnePiece', lorcana: 'Lorcana', riftbound: 'Riftbound',
  dbsfw: 'DragonBallSuper', dbsmasters: 'DragonBallSuper',
};

// Recherches de précommande / d'achat d'une extension (son nom, sans le préfixe de code « ME06: »).
export function releaseLinks(release) {
  const q = encodeURIComponent(release.name.replace(/^[A-Z0-9]+:\s*/, ''));
  return [
    { key: 'ebay', label: 'eBay', url: `https://www.ebay.fr/sch/i.html?_nkw=${q}` },
    { key: 'cardmarket', label: 'Cardmarket', url: `https://www.cardmarket.com/fr/${CARDMARKET_GAME[release.tcg] || 'Pokemon'}/Products/Search?searchString=${q}` },
    { key: 'vinted', label: 'Vinted', url: `https://www.vinted.fr/catalog?search_text=${q}` },
  ];
}
