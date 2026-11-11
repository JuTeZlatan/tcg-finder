// Script de collecte quotidien : node pipeline/build.mjs [--only=onepiece,lorcana,riftbound,pokemon,yugioh,dragonball,magic,swu,cyberpunk,naruto,upcoming,fingerprints] [--out=dossier]
// Produit des fichiers JSON statiques lus par l'appli (publiés sur GitHub Pages par .github/workflows/data.yml).
import { writeJSON, keepPrevious } from './lib.mjs';
import * as onepiece from './onepiece.mjs';
import * as riftbound from './riftbound.mjs';
import * as lorcana from './lorcana.mjs';
import * as pokemon from './pokemon.mjs';
import * as yugioh from './yugioh.mjs';
import * as dragonball from './dragonball.mjs';
import * as magic from './magic.mjs';
import * as swu from './swu.mjs';
import * as cyberpunk from './cyberpunk.mjs';
import * as naruto from './naruto.mjs';
import * as upcoming from './upcoming.mjs';
import { audit } from './audit.mjs';
import * as fingerprints from './fingerprints.mjs';

const BUILDERS = { onepiece, riftbound, lorcana, pokemon, yugioh, dragonball, magic, swu, cyberpunk, naruto, upcoming };
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const outDir = arg('out') || 'pipeline/out';
const only = arg('only')?.split(',') || [...Object.keys(BUILDERS), 'fingerprints'];

// Jeux entièrement publiés en fichiers (extensions, cartes, recherche) : en cas d'échec, la version de la veille est
// republiée et la collecte des autres jeux continue (une source en panne ne bloque plus la mise à jour de tout le site).
const STATIC_GAMES = {
  onepiece: ['onepiece'], riftbound: ['riftbound'], lorcana: ['lorcana'], dragonball: ['dbsfw', 'dbsmasters'],
  swu: ['swu'], cyberpunk: ['cyberpunk'], naruto: ['naruto'],
};
const LANGS = ['en', 'fr', 'de', 'it', 'es', 'ja', 'zh', 'ko'];

const failures = [];
const kept = [];
for (const id of only.filter((x) => BUILDERS[x])) {
  try {
    await BUILDERS[id].build(outDir);
  } catch (e) {
    console.error(`✗ ${id} : ${e.stack || e.message}`);
    if (STATIC_GAMES[id]) {
      let any = false;
      for (const tcg of STATIC_GAMES[id]) {
        for (const lang of LANGS) any = (await keepPrevious(outDir, tcg, lang).catch(() => false)) || any;
      }
      if (any) {
        console.log(`::warning::${id} : source indisponible aujourd'hui, version de la veille republiée`);
        kept.push(id);
        continue;
      }
    }
    failures.push(id);
  }
}
// Contrôle de complétude : comble les manques avec les autres langues et publie le rapport du jour.
try {
  await audit(outDir);
} catch (e) {
  console.error(`✗ contrôle de complétude : ${e.stack || e.message}`);
}
// Empreintes visuelles des cartes pour le scanner : après la complétude (cartes ajoutées comprises). Un échec
// n'empêche pas la publication : l'appli calcule alors elle-même les empreintes manquantes.
if (only.includes('fingerprints')) {
  try {
    await fingerprints.build(outDir);
  } catch (e) {
    console.error(`✗ empreintes : ${e.stack || e.message}`);
  }
}
await writeJSON(`${outDir}/meta.json`, { generatedAt: new Date().toISOString(), tcgs: only.filter((id) => !failures.includes(id)), kept });
if (failures.length) process.exit(1);
