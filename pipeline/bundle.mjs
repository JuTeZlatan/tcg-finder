// Regroupe pipeline/out en un fichier par jeu et par langue, intégré à l'appli (assets/data/*.tcgdata),
// pour qu'elle fonctionne sans serveur. Les prix sont ceux du jour de la génération.
// Toute nouvelle entrée doit aussi être déclarée dans src/api/bundledData.js.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileId } from './lib.mjs';

const OUT = 'pipeline/out';
const DEST = 'assets/data';
// Jeux collectés et leurs langues de cartes.
const GAMES = {
  onepiece: ['fr', 'en', 'ja'],
  riftbound: ['fr', 'en', 'zh'],
  lorcana: ['fr', 'en'],
  dbsfw: ['en'],
  dbsmasters: ['en'],
};
// Compléments de prix pour les jeux interrogés en direct : [fichier collecté, nom intégré].
const EXTRAS = [
  ['pokemon/tcgplayer.json', 'pokemon-tcgplayer'],
  ['pokemon/tcgplayer-ja.json', 'pokemon-tcgplayer-ja'],
  ['pokemon/setdates.json', 'pokemon-setdates'],
  ['pokemon/tcgplayer-versions.json', 'pokemon-tcgplayer-versions'],
  ['pokemon/setlogos.json', 'pokemon-setlogos'],
  ['pokemon/cardmarket.json', 'pokemon-cardmarket'],
  ['yugioh/cardmarket.json', 'yugioh-cardmarket'],
  ['yugioh/tcgplayer.json', 'yugioh-tcgplayer'],
  // Personnages (onglet à côté des extensions) : espèces Pokémon, archétypes Yu-Gi-Oh!, planeswalkers Magic.
  ['pokemon/species.json', 'pokemon-species'],
  ['yugioh/archetypes.json', 'yugioh-archetypes'],
  ['magic/planeswalkers.json', 'magic-planeswalkers'],
  // Prochaines sorties de tous les jeux (accueil).
  ['upcoming.json', 'upcoming'],
];

const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));
const meta = await readJSON(`${OUT}/meta.json`);
await mkdir(DEST, { recursive: true });

for (const [tcg, langs] of Object.entries(GAMES)) {
  for (const lang of langs) {
    const sets = await readJSON(`${OUT}/${tcg}/${lang}/sets.json`);
    const cards = {};
    for (const s of sets) cards[s.id] = await readJSON(`${OUT}/${tcg}/${lang}/sets/${fileId(s.id)}.json`);
    const body = JSON.stringify({ generatedAt: meta.generatedAt, sets, cards });
    await writeFile(`${DEST}/${tcg}-${lang}.tcgdata`, body);
    console.log(`${tcg}-${lang}.tcgdata : ${(body.length / 1e6).toFixed(1)} Mo`);
  }
}

for (const [src, name] of EXTRAS) {
  const body = await readFile(`${OUT}/${src}`, 'utf8');
  await writeFile(`${DEST}/${name}.tcgdata`, body);
  console.log(`${name}.tcgdata : ${(body.length / 1e6).toFixed(1)} Mo`);
}
