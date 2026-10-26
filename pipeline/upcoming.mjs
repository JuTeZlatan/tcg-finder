// Prochaines sorties de chaque jeu (section « Prochaines sorties » de l'accueil) : extensions annoncées par
// TCGplayer (qui les liste souvent des mois avant, pour les précommandes) et par Scryfall pour Magic.
// Sortie : pipeline/out/upcoming.json = [{ tcg, name, date }] des 6 prochains mois, de la plus proche à la plus lointaine.
import { getJSON, tcgcsvGroups, writeJSON } from './lib.mjs';

const CATEGORIES = { pokemon: 3, yugioh: 2, onepiece: 68, lorcana: 71, riftbound: 89, dbsfw: 80, dbsmasters: 27 };
const HORIZON_DAYS = 183;

export async function build(outDir) {
  console.log('Prochaines sorties…');
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + HORIZON_DAYS * 86400000).toISOString().slice(0, 10);
  const inRange = (date) => date > today && date <= until;
  const out = [];
  for (const [tcg, categoryId] of Object.entries(CATEGORIES)) {
    for (const g of await tcgcsvGroups(categoryId)) {
      const date = (g.publishedOn || '').slice(0, 10);
      if (inRange(date)) out.push({ tcg, name: g.name, date });
    }
  }
  // Magic : Scryfall (plus complet que TCGplayer), sans les extensions numériques, jetons et lots d'une carte.
  for (const s of (await getJSON('https://api.scryfall.com/sets')).data) {
    if (inRange(s.released_at) && !s.digital && s.set_type !== 'token' && s.card_count > 5) out.push({ tcg: 'magic', name: s.name, date: s.released_at });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.tcg.localeCompare(b.tcg));
  await writeJSON(`${outDir}/upcoming.json`, out);
  console.log(`  ${out.length} sorties annoncées d'ici ${HORIZON_DAYS} jours`);
}
