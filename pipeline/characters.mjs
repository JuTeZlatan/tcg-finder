// Personnages préparés pour l'appli (pages « personnage / héros / champion » instantanées) : pour chaque jeu collecté
// en fichiers (One Piece, Lorcana, Riftbound, Dragon Ball, Star Wars, Cyberpunk, Naruto) et chaque langue,
//   {jeu}/{langue}/characters.json            : la liste des personnages (onglet « Personnages »)
//   {jeu}/{langue}/characters/{clé}.json      : { id, cards } — les cartes d'un personnage, de la plus récente à la plus ancienne
// Calculés par le code même de l'appli (src/api/staticTcg.js, exécuté dans Node) : exactement le même rangement que
// sur le téléphone, qui refait d'ailleurs le calcul lui-même si ces fichiers manquent.
// Après build.mjs (lit les extensions du jour dans le dossier publié) :
//   node --import ./scripts/node-app/register.mjs pipeline/characters.mjs site
import http from 'node:http';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { writeJSON, writeManifest } from './lib.mjs';

const outDir = process.argv[2] || 'pipeline/out';

// Le dossier du jour servi en local : l'appli lit ses données comme en ligne.
const server = http.createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\])+/, '');
    res.end(await readFile(join(outDir, path)));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// DATA_FROM (essais) : extensions lues sur un site déjà publié plutôt que dans le dossier du jour.
process.env.EXPO_PUBLIC_DATA_URL = process.env.DATA_FROM || `http://127.0.0.1:${server.address().port}`;

const { TCGS } = await import('../src/api/index.js');
const { characterFile } = await import('../src/api/staticTcg.js');

let failed = 0;
for (const tcg of TCGS.filter((x) => x.precomputedCharacters)) {
  for (const lang of tcg.languages) {
    const t = Date.now();
    try {
      // Fichiers de la veille retirés : seuls ceux des personnages du jour sont publiés.
      await rm(`${outDir}/${tcg.id}/${lang}/characters`, { recursive: true, force: true });
      await rm(`${outDir}/${tcg.id}/${lang}/characters.json`, { force: true });
      const list = await tcg.computeCharacters(lang);
      if (!list.length) continue;
      const byChar = await tcg.computeCharacterCards(lang);
      const seen = new Map();
      for (const c of list) {
        const file = characterFile(c.id);
        // Deux personnages sur le même nom de fichier (très improbable) : le second reste calculé par l'appli.
        if (seen.has(file)) {
          console.log(`  ${tcg.id}/${lang} : même fichier pour « ${seen.get(file)} » et « ${c.id} »`);
          continue;
        }
        seen.set(file, c.id);
        await writeJSON(`${outDir}/${tcg.id}/${lang}/${file}`, { id: c.id, cards: byChar.get(c.id) || [] });
      }
      await writeJSON(`${outDir}/${tcg.id}/${lang}/characters.json`, list);
      console.log(`  ${tcg.id}/${lang} : ${list.length} personnages (${((Date.now() - t) / 1000).toFixed(0)} s)`);
    } catch (e) {
      failed++;
      console.error(`✗ personnages ${tcg.id}/${lang} : ${e.stack || e.message}`);
    }
  }
}
server.close();

// Garde-fou : GitHub Pages limite un site à 1 Go. Au-delà de 950 Mo, les personnages préparés sont retirés
// (l'appli les calcule alors elle-même) plutôt que de risquer l'échec de la publication.
const LIMIT = 950 * 1048576;
async function sizeOf(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) n += e.isDirectory() ? await sizeOf(join(dir, e.name)) : (await stat(join(dir, e.name))).size;
  return n;
}
if (!process.env.DATA_FROM) {
  const total = await sizeOf(outDir);
  console.log(`taille du site : ${Math.round(total / 1048576)} Mo`);
  if (total > LIMIT) {
    for (const tcg of TCGS.filter((x) => x.precomputedCharacters)) {
      for (const lang of tcg.languages) {
        await rm(`${outDir}/${tcg.id}/${lang}/characters`, { recursive: true, force: true });
        await rm(`${outDir}/${tcg.id}/${lang}/characters.json`, { force: true });
      }
    }
    console.log(`::warning::site trop lourd (${Math.round(total / 1048576)} Mo) : personnages préparés retirés, calculés par l'appli`);
  }
}
// Liste des fichiers publiés mise à jour (reprise de la veille en cas de panne d'une source).
if (!process.env.DATA_FROM) console.log(`liste des fichiers publiés : ${await writeManifest(outDir)}`);
// Un échec ne bloque pas la publication : l'appli calcule alors elle-même les personnages manquants.
if (failed) console.log(`::warning::personnages : ${failed} jeu(x)/langue(s) non préparé(s), calculés par l'appli`);
