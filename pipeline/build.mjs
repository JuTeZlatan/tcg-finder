// Script de collecte quotidien : node pipeline/build.mjs [--only=onepiece,lorcana,riftbound,pokemon,yugioh,dragonball,magic,upcoming] [--out=dossier]
// Produit des fichiers JSON statiques lus par l'appli (publiés sur GitHub Pages par .github/workflows/data.yml).
import { writeJSON } from './lib.mjs';
import * as onepiece from './onepiece.mjs';
import * as riftbound from './riftbound.mjs';
import * as lorcana from './lorcana.mjs';
import * as pokemon from './pokemon.mjs';
import * as yugioh from './yugioh.mjs';
import * as dragonball from './dragonball.mjs';
import * as magic from './magic.mjs';
import * as upcoming from './upcoming.mjs';

const BUILDERS = { onepiece, riftbound, lorcana, pokemon, yugioh, dragonball, magic, upcoming };
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const outDir = arg('out') || 'pipeline/out';
const only = arg('only')?.split(',') || Object.keys(BUILDERS);

const failures = [];
for (const id of only) {
  try {
    await BUILDERS[id].build(outDir);
  } catch (e) {
    console.error(`✗ ${id} : ${e.stack || e.message}`);
    failures.push(id);
  }
}
await writeJSON(`${outDir}/meta.json`, { generatedAt: new Date().toISOString(), tcgs: only.filter((id) => !failures.includes(id)) });
if (failures.length) process.exit(1);
