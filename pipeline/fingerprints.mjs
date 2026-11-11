// Empreintes visuelles des cartes pour le scanner (src/lib/imageMatch.js) : calculées ici une fois pour toutes au lieu
// d'être téléchargées et calculées sur le téléphone pendant le scan. Même calcul que le module natif card-vision
// (Vision.kt › Fingerprint) : image sans 5 % de bords, réduite à 12 × 16, luminosité et deux couleurs normalisées.
//
// Publication : fp/<jeu>/<langue>/<extension>.json = { s: 25, c: { adresse de l'image: empreinte } }, empreinte =
// 576 valeurs × 25 en octets signés (base64). L'appli charge le fichier de l'extension d'une carte trouvée et compare
// tout de suite toutes ses versions. Images non encore calculées : l'appli les calcule elle-même, comme avant.
//
// Cache d'un jour à l'autre (dossier FP_CACHE, conservé par le workflow) : seules les nouvelles cartes sont calculées,
// des extensions les plus récentes aux plus anciennes, dans la limite de FP_BUDGET_MIN minutes par passage — le
// premier remplissage (plusieurs centaines de milliers d'images) se fait donc sur quelques jours.
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { getJSON, fileId, sleep, writeJSON, PUBLISHED_URL } from './lib.mjs';

const W = 12;
const H = 16;
const INSET = 0.05;
const SCALE = 25; // valeur normalisée × 25 → octet signé (±5 écarts-types)
const CONCURRENCY = 16;
const RETRY_FAILED_DAYS = 7; // image introuvable : nouvel essai une semaine plus tard
const UA = 'TCGFinder-data/1.0 (+https://github.com)';

// ---------- Calcul (identique à Vision.kt) ----------
function normalize(v) {
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.max(4, Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length));
  return v.map((x) => (x - mean) / sd);
}
export async function fingerprintOf(buffer) {
  const img = sharp(buffer, { failOn: 'none' }).flatten({ background: '#000000' });
  const { width, height } = await img.metadata();
  const ix = Math.floor(width * INSET);
  const iy = Math.floor(height * INSET);
  // Réduction en deux temps (comme sur le téléphone) : chaque case est une vraie moyenne.
  const mid = await img.extract({ left: ix, top: iy, width: Math.max(1, width - 2 * ix), height: Math.max(1, height - 2 * iy) })
    .resize(W * 4, H * 4, { fit: 'fill', kernel: 'linear' }).removeAlpha().raw().toBuffer();
  const px = await sharp(mid, { raw: { width: W * 4, height: H * 4, channels: 3 } }).resize(W, H, { fit: 'fill', kernel: 'linear' }).raw().toBuffer();
  const y = [];
  const cb = [];
  const cr = [];
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 3];
    const g = px[i * 3 + 1];
    const b = px[i * 3 + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    y.push(l);
    cb.push(b - l);
    cr.push(r - l);
  }
  const all = [...normalize(y), ...normalize(cb), ...normalize(cr)];
  return Buffer.from(Int8Array.from(all.map((v) => Math.max(-127, Math.min(127, Math.round(v * SCALE)))))).toString('base64');
}

// ---------- Cache ----------
const cacheDir = () => process.env.FP_CACHE || 'pipeline/.fpcache';
const shardOf = (url) => createHash('sha1').update(url).digest('hex').slice(0, 2);
async function loadCache() {
  const cache = new Map(); // adresse → empreinte (base64) ou « -AAAA-MM-JJ » (introuvable ce jour-là)
  const dir = cacheDir();
  if (!existsSync(dir)) return cache;
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue;
    for (const [k, v] of Object.entries(JSON.parse(await readFile(`${dir}/${f}`, 'utf8')))) cache.set(k, v);
  }
  return cache;
}
async function saveCache(cache) {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true });
  const shards = new Map();
  for (const [k, v] of cache) {
    const s = shardOf(k);
    if (!shards.has(s)) shards.set(s, {});
    shards.get(s)[k] = v;
  }
  for (const [s, data] of shards) await writeFile(`${dir}/${s}.json`, JSON.stringify(data));
}

// ---------- Cartes de chaque jeu : { tcg, lang, setId, date, url (clé, celle qu'utilise l'appli), dl (à télécharger) } ----------
const STATIC = { onepiece: ['fr', 'en', 'ja', 'zh'], lorcana: ['fr', 'en', 'de', 'it'], riftbound: ['en', 'zh'], dbsfw: ['en', 'ja'], dbsmasters: ['en'], swu: ['fr', 'en', 'de', 'it', 'es'], cyberpunk: ['en'], naruto: ['fr', 'en'] };
async function localOrPublished(outDir, path) {
  try {
    return JSON.parse(await readFile(`${outDir}/${path}`, 'utf8'));
  } catch {
    return getJSON(`${PUBLISHED_URL}/${path}`).catch(() => null);
  }
}
async function staticCards(outDir) {
  const out = [];
  for (const [tcg, langs] of Object.entries(STATIC)) {
    for (const lang of langs) {
      const [sets, rows] = await Promise.all([localOrPublished(outDir, `${tcg}/${lang}/sets.json`), localOrPublished(outDir, `${tcg}/${lang}/search.json`)]);
      const dates = new Map((sets || []).map((s) => [String(s.id), s.date || s.releaseDate || '']));
      // Lignes de recherche : [id, nom, extension, numéro, image] — l'image est celle que le scan compare.
      for (const [, , setId, , image] of rows || []) if (image) out.push({ tcg, lang, setId: String(setId), date: dates.get(String(setId)) || '', url: image, dl: image });
    }
  }
  return out;
}
const TCGDEX = 'https://api.tcgdex.net/v2';
const POKEMON_LANGS = { en: 'en', fr: 'fr', de: 'de', it: 'it', es: 'es', pt: 'pt', ja: 'ja', zh: 'zh-tw' };
async function pokemonCards() {
  const out = [];
  for (const [lang, api] of Object.entries(POKEMON_LANGS)) {
    for (const s of (await getJSON(`${TCGDEX}/${api}/sets`).catch(() => [])) || []) {
      const full = await getJSON(`${TCGDEX}/${api}/sets/${encodeURIComponent(s.id)}`).catch(() => null);
      for (const c of full?.cards || []) {
        // L'appli affiche « <image>/low.webp » (src/api/pokemon.js › img).
        if (c.image) out.push({ tcg: 'pokemon', lang, setId: full.id, date: full.releaseDate || '', url: `${c.image}/low.webp`, dl: `${c.image}/low.webp` });
      }
      await sleep(30);
    }
  }
  return out;
}
async function magicCards() {
  // Toutes les impressions (Scryfall, fichier « default_cards » mis à jour chaque jour).
  // Fichier JSON Lines compressé (une carte par ligne, plus de 2 Go une fois décompressé) : lu ligne par ligne au fil
  // du téléchargement, sans jamais le garder entier en mémoire.
  const bulk = await getJSON('https://api.scryfall.com/bulk-data/default-cards');
  const out = [];
  const add = (c) => {
    if (c.digital || c.lang !== 'en') return;
    const uris = c.image_uris || c.card_faces?.[0]?.image_uris;
    // Clé : l'image « normal » que compare l'appli ; téléchargement : la « small », bien plus légère (même empreinte).
    if (uris?.normal) out.push({ tcg: 'magic', lang: 'en', setId: c.set, date: c.released_at || '', url: uris.normal, dl: uris.small || uris.normal });
  };
  const res = await fetch(bulk.jsonl_download_uri, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const lines = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) add(JSON.parse(line));
  return out;
}
async function yugiohCards() {
  const all = await getJSON('https://db.ygoprodeck.com/api/v7/cardinfo.php');
  const sets = await getJSON('https://db.ygoprodeck.com/api/v7/cardsets.php').catch(() => []);
  const dates = new Map((sets || []).map((s) => [s.set_name, s.tcg_date || '']));
  const out = [];
  for (const c of all?.data || []) {
    const url = `https://images.ygoprodeck.com/images/cards_small/${c.id}.jpg`;
    for (const s of c.card_sets || []) out.push({ tcg: 'yugioh', lang: 'en', setId: s.set_name, date: dates.get(s.set_name) || '', url, dl: url });
  }
  return out;
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function build(outDir) {
  console.log('Empreintes visuelles des cartes (scanner)…');
  const budget = Number(process.env.FP_BUDGET_MIN || 40) * 60000; // temps de calcul (listes non comprises)
  const cache = await loadCache();
  console.log(`  empreintes : ${cache.size} en cache`);
  const lists = [];
  for (const [label, fn] of [['jeux publiés', () => staticCards(outDir)], ['Pokémon', pokemonCards], ['Magic', magicCards], ['Yu-Gi-Oh!', yugiohCards]]) {
    try {
      const l = await fn();
      console.log(`  empreintes · ${label} : ${l.length} cartes`);
      lists.push(l);
    } catch (e) {
      console.log(`  empreintes · ${label} : liste indisponible (${e.message})`);
    }
  }
  const cards = lists.flat();

  // À calculer : images jamais vues, ou introuvables il y a plus d'une semaine ; les plus récentes d'abord.
  const today = new Date().toISOString().slice(0, 10);
  const retryBefore = new Date(Date.now() - RETRY_FAILED_DAYS * 86400000).toISOString().slice(0, 10);
  const todo = new Map();
  for (const c of [...cards].sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
    const v = cache.get(c.url);
    if (todo.has(c.url) || (v && !(v.startsWith('-') && v.slice(1) < retryBefore))) continue;
    todo.set(c.url, c.dl);
  }
  const queue = [...todo];
  const started = Date.now();
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length && Date.now() - started < budget) {
      const [url, dl] = queue.shift();
      try {
        cache.set(url, await fingerprintOf(await download(dl)));
        done++;
      } catch {
        cache.set(url, `-${today}`);
        failed++;
      }
      if ((done + failed) % 2000 === 0) console.log(`  empreintes : ${done + failed}/${todo.size}…`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await saveCache(cache);
  console.log(`  empreintes : ${done} calculées aujourd'hui, ${failed} images introuvables, ${queue.length} restantes (passages suivants)`);

  // Un fichier par jeu, langue et extension, avec les empreintes connues.
  const files = new Map();
  for (const c of cards) {
    const v = cache.get(c.url);
    if (!v || v.startsWith('-')) continue;
    const path = `fp/${c.tcg}/${c.lang}/${fileId(c.setId)}.json`;
    if (!files.has(path)) files.set(path, {});
    files.get(path)[c.url] = v;
  }
  for (const [path, c] of files) await writeJSON(`${outDir}/${path}`, { s: SCALE, c });
  const total = [...files.values()].reduce((n, c) => n + Object.keys(c).length, 0);
  console.log(`  empreintes : ${files.size} fichiers d'extensions publiés (${total} cartes), sur ${new Set(cards.map((c) => c.url)).size} images`);
}
