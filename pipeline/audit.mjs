// Contrôle quotidien de complétude, lancé après la collecte (pipeline/build.mjs) :
// 1. complète chaque carte à qui il manque une image, un nom ou un numéro avec la même carte (même identifiant)
//    dans une autre langue du même jeu ;
// 2. vérifie que chaque extension est complète dans chaque langue : aucun numéro ne doit manquer entre 1 et le total
//    imprimé (« 001/221 ») ou la fin de la suite de numéros (OP09-001 → OP09-119) ; un numéro absent d'une langue est
//    repris de la même extension dans une autre langue (l'anglais d'abord) ;
// 3. publie un rapport des manques restants (report.json) et l'écrit dans le résumé GitHub Actions,
//    avec l'évolution par rapport à la veille.
// Les images TCGplayer absentes sont déjà remplacées à l'écriture de chaque jeu (lib.mjs, repairImages) et les images
// Pokémon dans pipeline/pokemon.mjs (images.json).
import { readFile, appendFile } from 'node:fs/promises';
import { fileId, previousJSON, writeJSON } from './lib.mjs';

const GAMES = ['onepiece', 'lorcana', 'riftbound', 'dbsfw', 'dbsmasters', 'swu', 'cyberpunk', 'naruto'];
const LANG_ORDER = ['en', 'fr', 'de', 'it', 'es', 'ja', 'zh', 'ko'];
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

// ---------- Complétude des extensions ----------
// Extensions « fourre-tout » (promos, juges, tournois, lots) : numérotation libre, pas de contrôle.
// Groupes « tcg-… » : versions ajoutées depuis TCGplayer (pas une extension complète). Marqueurs, jetons : à part.
const LOOSE_SET = /promo|judge|organized|tournament|championship|prize|bundle|gift|convention|exclusive|weekly|store|event|pre-?release|box topper|special|collection|celebration|marker|token|^tcg-|_EM$/i;

// « SFD-001/221 » → { prefix: 'SFD', n: 1, total: 221 } ; « OP09-119 » → { prefix: 'OP09', n: 119 } ; « 12 » → { n: 12 }.
// Variantes (« 223* », « 012a », versions alternatives) : numéro de base, marquées variant.
function parseCardNumber(number) {
  // « 19/264 // T01 » (bases avec jeton) : le numéro avant « // ».
  const m = String(number || '').split('//')[0].trim().match(/^(?:(.*?)[-\s])?([A-Z]{0,3})(\d{1,4})([a-z*]*)\s*(?:\/\s*(\d{1,4}))?$/i);
  if (!m) return null;
  const n = parseInt(m[3], 10);
  return n ? { prefix: (m[1] || m[2] || '').toUpperCase(), n, total: m[5] ? parseInt(m[5], 10) : null, variant: !!m[4] } : null;
}
const isVariantCard = (c) => /_p\d|_r\d|\(.*\)|^tcg/i.test(`${c.id} ${c.name}`);

// Numéros attendus d'une extension : 1 → total imprimé le plus fréquent, sinon 1 → fin de la suite principale
// (le plus grand numéro tel qu'au moins 80 % des numéros en dessous existent : les cartes secrètes au-delà sont ignorées).
function expectedNumbers(cards) {
  const parsed = cards.map((c) => parseCardNumber(c.number)).filter(Boolean);
  if (parsed.length < 10) return null;
  const prefixCount = new Map();
  for (const x of parsed) prefixCount.set(x.prefix, (prefixCount.get(x.prefix) || 0) + 1);
  const main = [...prefixCount].sort((a, b) => b[1] - a[1])[0][0];
  const mine = parsed.filter((x) => x.prefix === main);
  const totals = new Map();
  for (const x of mine) if (x.total) totals.set(x.total, (totals.get(x.total) || 0) + 1);
  // Total imprimé retenu seulement s'il est celui de la plupart des cartes (une extension de rééditions mélange les totaux).
  const [total, totalCount = 0] = [...totals].sort((a, b) => b[1] - a[1])[0] || [];
  const useTotal = total && totalCount >= mine.length * 0.3 ? total : null;
  const present = new Set(mine.map((x) => x.n));
  let max = useTotal || 0;
  if (!max) {
    const sorted = [...present].sort((a, b) => a - b);
    for (const n of sorted) if (sorted.filter((k) => k <= n).length >= n * 0.8) max = n;
  }
  if (!max || max > 600) return null;
  return { prefix: main, max, present };
}

// Comble les numéros manquants d'une extension avec la même carte (même extension, même numéro de base) dans une
// autre langue. Renvoie { added, missing: [numéros introuvables] }.
function completeSet(setId, cards, otherLangs) {
  // Numérotation attendue lue sur la version la plus complète de l'extension, toutes langues confondues (une langue qui
  // n'a encore que 2 cartes publiées doit être comblée par les autres).
  const reference = [cards, ...otherLangs.map((o) => o.get(setId) || [])].sort((a, b) => b.length - a.length)[0];
  const ref = expectedNumbers(reference);
  if (!ref) return { added: 0, missing: [] };
  const own = expectedNumbers(cards);
  const exp = { ...ref, present: own?.prefix === ref.prefix ? own.present : new Set(cards.map((c) => parseCardNumber(c.number)).filter((x) => x && x.prefix === ref.prefix).map((x) => x.n)) };
  const missing = [];
  let added = 0;
  for (let n = 1; n <= exp.max; n++) {
    if (exp.present.has(n)) continue;
    let found = null;
    for (const other of otherLangs) {
      const list = other.get(setId) || [];
      const same = list.filter((c) => {
        const x = parseCardNumber(c.number);
        return x && x.n === n && x.prefix === exp.prefix;
      });
      found = same.find((c) => !isVariantCard(c)) || same[0];
      if (found) {
        cards.push({ ...found, fromLang: other.lang });
        added++;
        break;
      }
    }
    if (!found) missing.push(n);
  }
  return { added, missing };
}

// Numéros présents dans une autre langue de la même extension mais absents de celle-ci (au-delà du total imprimé aussi :
// cartes enchantées, iconiques…) : repris de cette langue. One Piece excepté : chaque site officiel régional (EN, FR,
// JA, ZH) définit lui-même le contenu de ses extensions (rééditions, versions régionales).
const REGIONAL_CONTENTS = new Set(['onepiece']);
function completeNumbersAcrossLanguages(setId, cards, otherLangs) {
  const key = (c) => {
    const x = parseCardNumber(c.number);
    return x ? `${x.prefix}|${x.n}` : null;
  };
  const have = new Set(cards.map(key).filter(Boolean));
  let added = 0;
  for (const other of otherLangs) {
    const list = other.get(setId) || [];
    const byKey = new Map();
    for (const c of list) {
      const k = key(c);
      if (k && !have.has(k) && (!byKey.has(k) || (isVariantCard(byKey.get(k)) && !isVariantCard(c)))) byKey.set(k, c);
    }
    for (const [k, c] of byKey) {
      cards.push({ ...c, fromLang: other.lang });
      have.add(k);
      added++;
    }
  }
  return added;
}

// Jeux dont chaque version (édition, rareté, illustration) existe dans toutes les langues publiées, avec le même
// identifiant (Naruto : référence produit) : une langue reçoit aussi les versions qui lui manquent.
const SAME_VERSIONS = new Set(['naruto']);
function completeVersions(setId, cards, otherLangs) {
  const known = new Set(cards.map((c) => c.id));
  let added = 0;
  for (const other of otherLangs) {
    for (const c of other.get(setId) || []) {
      if (known.has(c.id)) continue;
      cards.push({ ...c, fromLang: other.lang });
      known.add(c.id);
      added++;
    }
  }
  return added;
}

export async function audit(outDir) {
  console.log('Contrôle de complétude…');
  const report = { generatedAt: new Date().toISOString(), games: {} };
  for (const game of GAMES) {
    const langs = await loadGame(outDir, game);
    if (!Object.keys(langs).length) continue;
    // Toutes les versions connues de chaque carte, par langue (construit après la complétude des extensions).
    const byId = {};
    report.games[game] = {};
    // Extensions complètes dans chaque langue (avant les compléments d'image / de nom).
    const completeness = {};
    for (const [lang, { base, sets, files }] of Object.entries(langs)) {
      const others = LANG_ORDER.filter((l) => l !== lang && langs[l]).map((l) => Object.assign(langs[l].files, { lang: l }));
      let added = 0;
      const incomplete = [];
      for (const s of sets) {
        const cards = files.get(s.id);
        const loose = LOOSE_SET.test(s.name || '') || LOOSE_SET.test(String(s.id));
        const r = loose ? { added: 0, missing: [] } : completeSet(s.id, cards, others);
        if (!REGIONAL_CONTENTS.has(game)) r.added += completeNumbersAcrossLanguages(s.id, cards, others);
        if (SAME_VERSIONS.has(game)) r.added += completeVersions(s.id, cards, others);
        if (r.added) {
          added += r.added;
          await writeJSON(`${base}/sets/${fileId(s.id)}.json`, cards);
          s.count = cards.length;
        }
        if (r.missing.length) incomplete.push([s.id, r.missing.length, r.missing.slice(0, 12)]);
      }
      if (added) {
        await writeJSON(`${base}/sets.json`, sets);
        const search = await readJSON(`${base}/search.json`).catch(() => null);
        if (search) {
          const known = new Set(search.map((row) => row[0]));
          for (const [setId, cards] of files) {
            for (const c of cards) if (!known.has(c.id)) search.push([c.id, c.name, setId, c.number ?? '', c.image ?? '', c.nameEn ?? '']);
          }
          await writeJSON(`${base}/search.json`, search);
        }
      }
      // Nouvelle extension (absente de la version publiée la veille) encore incomplète : pas publiée, mise en attente
      // jusqu'à ce qu'elle soit complète. Les extensions déjà publiées restent, leurs manques sont signalés.
      const previousIds = new Set(((await previousJSON(`${game}/${lang}/sets.json`)) || []).map((x) => String(x.id)));
      const withheld = previousIds.size
        ? incomplete.map(([id]) => id).filter((id) => !previousIds.has(String(id)))
        : [];
      if (withheld.length) {
        const hide = new Set(withheld.map(String));
        const kept = sets.filter((x) => !hide.has(String(x.id)));
        sets.length = 0;
        sets.push(...kept);
        await writeJSON(`${base}/sets.json`, sets);
        const search = await readJSON(`${base}/search.json`).catch(() => null);
        if (search) await writeJSON(`${base}/search.json`, search.filter((row) => !hide.has(String(row[2]))));
        for (const id of hide) files.delete(id);
        console.log(`  ${game}/${lang} : nouvelle(s) extension(s) incomplète(s) mise(s) en attente : ${withheld.join(', ')}`);
      }
      completeness[lang] = { added, incomplete, withheld };
      if (added || incomplete.length) {
        console.log(`  ${game}/${lang} : ${added} cartes manquantes reprises d'une autre langue, ${incomplete.length} extension(s) encore incomplète(s)${incomplete.length ? ` : ${incomplete.map(([id, n, list]) => `${id} (${n} : ${list.join(', ')}${n > list.length ? '…' : ''})`).join(' ; ')}` : ''}`);
      }
    }
    for (const [lang, { files }] of Object.entries(langs)) {
      byId[lang] = new Map();
      for (const cards of files.values()) for (const c of cards) byId[lang].set(c.id, c);
    }
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
      report.games[game][lang] = {
        cards: total, filled, missing, setsWithoutImages: worst.sort((a, b) => b[1] - a[1]).slice(0, 10),
        setsCompleted: completeness[lang]?.added || 0, incompleteSets: completeness[lang]?.incomplete || [],
        withheldSets: completeness[lang]?.withheld || [],
      };
      const f = Object.entries(filled).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ');
      console.log(`  ${game}/${lang} : ${total} cartes${f ? `, complété depuis une autre langue : ${f}` : ''}, sans image ${missing.image}, sans nom ${missing.name}, sans numéro ${missing.number}`);
    }
  }
  // Pokémon : cartes encore sans image (calculé par pipeline/pokemon.mjs).
  const pk = await readJSON(`${outDir}/pokemon/images-missing.json`).catch(() => null);
  const pkDone = await readJSON(`${outDir}/pokemon/completeness.json`).catch(() => ({}));
  if (pk || Object.keys(pkDone).length) {
    const langs = new Set([...Object.keys(pk || {}), ...Object.keys(pkDone)]);
    report.games.pokemon = Object.fromEntries([...langs].map((l) => [l, {
      missing: { image: pk?.[l] ?? 0 }, setsCompleted: pkDone[l]?.added ?? 0, incompleteSets: pkDone[l]?.incomplete ?? [],
    }]));
  }

  // Yu-Gi-Oh! : extensions avec moins de cartes que le nombre annoncé (calculé par pipeline/yugioh.mjs).
  const ygoDone = await readJSON(`${outDir}/yugioh/completeness.json`).catch(() => null);
  if (ygoDone) {
    report.games.yugioh = Object.fromEntries(Object.entries(ygoDone).map(([l, r]) => [l, {
      missing: {}, setsCompleted: r.added, incompleteSets: r.incomplete,
    }]));
  }
  await writeJSON(`${outDir}/report.json`, report);
  await summary(report, await previousJSON('report.json'));
  return report;
}

// Résumé lisible dans l'onglet « Actions » de GitHub (ou dans la console en local).
async function summary(report, previous) {
  const lines = ['## Complétude des données', '', '| Jeu | Langue | Cartes | Extensions incomplètes | Cartes reprises d\'une autre langue | Sans image | Sans nom | Sans numéro | Veille (sans image) |', '|---|---|---|---|---|---|---|---|---|'];
  const details = [];
  for (const [game, langs] of Object.entries(report.games)) {
    for (const [lang, r] of Object.entries(langs)) {
      const before = previous?.games?.[game]?.[lang]?.missing?.image;
      lines.push(`| ${game} | ${lang} | ${r.cards ?? '—'} | ${r.incompleteSets?.length ?? '—'} | ${r.setsCompleted ?? '—'} | ${r.missing.image ?? 0} | ${r.missing.name ?? '—'} | ${r.missing.number ?? '—'} | ${before ?? '—'} |`);
      for (const [id, n, list] of r.incompleteSets || []) {
        const waiting = (r.withheldSets || []).includes(id) ? ' (nouvelle extension, en attente : pas publiée)' : '';
        details.push(`- ${game}/${lang} ${id} : ${n} numéro(s) introuvable(s) — ${list.join(', ')}${n > list.length ? '…' : ''}${waiting}`);
      }
    }
  }
  if (details.length) {
    lines.push('', '### Extensions incomplètes (numéros introuvables dans toutes les sources)', ...details.slice(0, 80));
    if (details.length > 80) lines.push(`- … et ${details.length - 80} autres (détail complet dans report.json)`);
  }
  else lines.push('', 'Toutes les extensions contrôlées sont complètes.');
  const text = `${lines.join('\n')}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
  else console.log(text);
}

// Lancement seul : node pipeline/audit.mjs [dossier]
if (process.argv[1]?.endsWith('audit.mjs')) {
  await audit(process.argv[2] || 'pipeline/out');
}
