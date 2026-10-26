// Magic : planeswalkers (onglet « Planeswalkers » de l'appli) — Jace, Chandra, Liliana… d'après Scryfall.
// Pour chacun : illustration de l'impression la plus récente (icône) et nombre d'impressions.
// Sortie : pipeline/out/magic/planeswalkers.json = [[nom, illustration, nombre], …]
import { getJSON, sleep, writeJSON } from './lib.mjs';

const SCRYFALL = 'https://api.scryfall.com';

export async function build(outDir) {
  console.log('Magic (planeswalkers)…');
  const types = (await getJSON(`${SCRYFALL}/catalog/planeswalker-types`)).data;
  const out = [];
  for (const type of types) {
    const q = encodeURIComponent(`t:planeswalker t:"${type}" game:paper`);
    const res = await getJSON(`${SCRYFALL}/cards/search?q=${q}&unique=prints&order=released&dir=desc`, { allowMissing: true }).catch(() => null);
    await sleep(110); // Scryfall demande environ 10 requêtes/s au plus
    const first = res?.data?.[0];
    if (!first) continue;
    const art = first.image_uris?.art_crop ?? first.card_faces?.[0]?.image_uris?.art_crop;
    out.push([type, art || null, res.total_cards]);
  }
  out.sort((a, b) => a[0].localeCompare(b[0]));
  await writeJSON(`${outDir}/magic/planeswalkers.json`, out);
  console.log(`  magic : ${out.length} planeswalkers`);
}
