// Script de collecte quotidien : node pipeline/build.mjs [--only=onepiece,lorcana,riftbound,pokemon,yugioh,dragonball,magic,swu,cyberpunk,naruto,upcoming,fingerprints] [--out=dossier]
// Produit des fichiers JSON statiques lus par l'appli (publiés sur GitHub Pages par .github/workflows/data.yml).
import { writeJSON, keepPrevious, restorePrevious, writeManifest } from './lib.mjs';
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

// Fichiers de chaque collecte (dossiers des jeux et de leurs historiques de prix). En cas d'échec d'une source,
// la version de la veille de ces fichiers est republiée et la collecte des autres jeux continue : une source en panne
// (TCGdex, OPTCG API…) ne bloque plus la mise à jour de tout le site.
const GAMES_OF = { dragonball: ['dbsfw', 'dbsmasters'] };
const prefixesOf = (id) => (id === 'upcoming' ? ['upcoming.json'] : (GAMES_OF[id] || [id]).flatMap((g) => [`${g}/`, `history/${g}/`]));
// Ancienne reprise (sans files.json, seulement les extensions des jeux entièrement publiés en fichiers).
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
    let any = false;
    try {
      const n = await restorePrevious(outDir, prefixesOf(id));
      if (n) console.log(`  ${id} : ${n} fichiers de la veille republiés`);
      any = n > 0;
    } catch (err) {
      console.error(`✗ ${id} : reprise de la veille incomplète (${err.message})`);
    }
    if (!any && STATIC_GAMES[id]) {
      for (const tcg of STATIC_GAMES[id]) {
        for (const lang of LANGS) any = (await keepPrevious(outDir, tcg, lang).catch(() => false)) || any;
      }
    }
    if (any) {
      console.log(`::warning::${id} : source indisponible aujourd'hui, version de la veille republiée`);
      kept.push(id);
      continue;
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
console.log(`liste des fichiers publiés : ${await writeManifest(outDir)}`);
if (failures.length) process.exit(1);
