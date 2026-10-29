// Contrôle quotidien de complétude, lancé après la collecte (pipeline/build.mjs) :
// 1. complète chaque carte à qui il manque une image, un nom ou un numéro avec la même carte (même identifiant)
//    dans une autre langue du même jeu ;
// 2. publie un rapport des manques restants (report.json) et l'écrit dans le résumé GitHub Actions,
//    avec l'évolution par rapport à la veille.
// Les images TCGplayer absentes sont déjà remplacées à l'écriture de chaque jeu (lib.mjs, repairImages) et les images
// Pokémon dans pipeline/pokemon.mjs (images.json).
import { readFile, appendFile } from 'node:fs/promises';
import { fileId, previousJSON, writeJSON } from './lib.mjs';

const GAMES = ['onepiece', 'lorcana', 'riftbound', 'dbsfw', 'dbsmasters'];
const LANG_ORDER = ['en', 'fr', 'ja', 'zh'];
const FIELDS = ['image', 'name', 'number'];

const readJSON = async (path) => JSON.parse(await readFile(path, 'utf8'));
const has = (c, f) => (f === 'image' ? !!(c.image || c.thumb) : c[f] != null && c[f] !== '');

async function loadGame(outDir, game) {
  const langs = {};
  for (const lang of LANG_ORDER) {
    const base = `${outDir}/${game}/${lang}`;
    const sets = await readJSON(`${base}/sets.json`).catch(() => null);
    if (!sets) continue;
    const files = new Map();
    for (const s of sets) files.set(s.id, await readJSON(`${base}/sets/${fileId(s.id)}.json`).catch(() => []));
    langs[lang] = { base, sets, files };
  }
  return langs;
}

export async function audit(outDir) {
  console.log('Contrôle de complétude…');
  const report = { generatedAt: new Date().toISOString(), games: {} };
  for (const game of GAMES) {
    const langs = await loadGame(outDir, game);
    if (!Object.keys(langs).length) continue;
    // Toutes les versions connues de chaque carte, par langue.
    const byId = {};
    for (const [lang, { files }] of Object.entries(langs)) {
      byId[lang] = new Map();
      for (const cards of files.values()) for (const c of cards) byId[lang].set(c.id, c);
    }
    report.games[game] = {};
    for (const [lang, { base, sets, files }] of Object.entries(langs)) {
      const filled = Object.fromEntries(FIELDS.map((f) => [f, 0]));
      const missing = Object.fromEntries(FIELDS.map((f) => [f, 0]));
      const worst = [];
      let total = 0;
      for (const s of sets) {
        const cards = files.get(s.id);
        let changed = false;
        let noImage = 0;
        for (const c of cards) {
          total++;
          for (const f of FIELDS) {
            if (has(c, f)) continue;
            const other = LANG_ORDER.filter((l) => l !== lang && byId[l]).map((l) => byId[l].get(c.id)).find((o) => o && has(o, f));
            if (other) {
              if (f === 'image') {
                c.image = other.image;
                c.thumb = other.thumb;
              } else c[f] = other[f];
              filled[f]++;
              changed = true;
            } else {
              missing[f]++;
              if (f === 'image') noImage++;
            }
          }
        }
        if (changed) await writeJSON(`${base}/sets/${fileId(s.id)}.json`, cards);
        if (noImage) worst.push([s.id, noImage]);
      }
      // Recherche : mêmes compléments (ligne [id, nom, extension, numéro, image, nom anglais]).
      if (Object.values(filled).some(Boolean)) {
        const search = await readJSON(`${base}/search.json`).catch(() => null);
        if (search) {
          const current = new Map([...files.values()].flat().map((c) => [c.id, c]));
          for (const row of search) {
            const c = current.get(row[0]);
            if (!c) continue;
            row[1] = row[1] || c.name || '';
            row[3] = row[3] || c.number || '';
            row[4] = row[4] || c.image || c.thumb || '';
          }
          await writeJSON(`${base}/search.json`, search);
        }
      }
      report.games[game][lang] = { cards: total, filled, missing, setsWithoutImages: worst.sort((a, b) => b[1] - a[1]).slice(0, 10) };
      const f = Object.entries(filled).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ');
      console.log(`  ${game}/${lang} : ${total} cartes${f ? `, complété depuis une autre langue : ${f}` : ''}, sans image ${missing.image}, sans nom ${missing.name}, sans numéro ${missing.number}`);
    }
  }
  // Pokémon : cartes encore sans image (calculé par pipeline/pokemon.mjs).
  const pk = await readJSON(`${outDir}/pokemon/images-missing.json`).catch(() => null);
  if (pk) report.games.pokemon = Object.fromEntries(Object.entries(pk).map(([l, n]) => [l, { missing: { image: n } }]));

  await writeJSON(`${outDir}/report.json`, report);
  await summary(report, await previousJSON('report.json'));
  return report;
}

// Résumé lisible dans l'onglet « Actions » de GitHub (ou dans la console en local).
async function summary(report, previous) {
  const lines = ['## Complétude des données', '', '| Jeu | Langue | Cartes | Sans image | Sans nom | Sans numéro | Veille (sans image) |', '|---|---|---|---|---|---|---|'];
  for (const [game, langs] of Object.entries(report.games)) {
    for (const [lang, r] of Object.entries(langs)) {
      const before = previous?.games?.[game]?.[lang]?.missing?.image;
      lines.push(`| ${game} | ${lang} | ${r.cards ?? '—'} | ${r.missing.image ?? 0} | ${r.missing.name ?? '—'} | ${r.missing.number ?? '—'} | ${before ?? '—'} |`);
    }
  }
  const text = `${lines.join('\n')}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
  else console.log(text);
}

// Lancement seul : node pipeline/audit.mjs [dossier]
if (process.argv[1]?.endsWith('audit.mjs')) {
  await audit(process.argv[2] || 'pipeline/out');
}
