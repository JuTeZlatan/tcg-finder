import { Directory, File, Paths } from 'expo-file-system';

const HEADERS = { Accept: 'application/json', 'User-Agent': 'TCGFinder/1.0' };
const TIMEOUT = 15000;
// Copie des réponses gardée sur le téléphone : réutilisée telle quelle pendant 12 h, puis affichée tout de suite
// pendant qu'une version fraîche est téléchargée en arrière-plan (pour la fois suivante).
const FRESH_FOR = 12 * 3600 * 1000;

// Clé de fichier courte et stable pour une adresse (empreinte djb2 + longueur).
const hashOf = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}-${s.length}`;
};
let dir = null;
const cacheFile = (url) => {
  try {
    if (!dir) {
      dir = new Directory(Paths.cache, 'http-cache');
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    }
    return new File(dir, `${hashOf(url)}.json`);
  } catch {
    return null;
  }
};
async function readCopy(url) {
  try {
    const f = cacheFile(url);
    if (!f?.exists) return null;
    const { at, data } = JSON.parse(await f.text());
    return { at, data };
  } catch {
    return null;
  }
}
function saveCopy(url, data) {
  try {
    cacheFile(url)?.write(JSON.stringify({ at: Date.now(), data }));
  } catch {
    // copie impossible : sans conséquence
  }
}

// Requête avec délai maximum : un réseau lent ne bloque jamais un écran indéfiniment.
export async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function download(url, allowMissing) {
  const res = await fetchWithTimeout(url, { headers: HEADERS });
  if (allowMissing && (res.status === 404 || res.status === 400)) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url.split('/')[2]})`);
  return res.json();
}

const refreshing = new Set();
// `fresh: true` : toujours le réseau (copie seulement en secours), pour les rares cas où l'à-jour prime.
export async function getJSON(url, { allowMissing = false, fresh = false } = {}) {
  const copy = fresh ? null : await readCopy(url);
  if (copy) {
    if (Date.now() - copy.at > FRESH_FOR && !refreshing.has(url)) {
      refreshing.add(url);
      download(url, allowMissing).then((data) => saveCopy(url, data)).catch(() => {}).finally(() => refreshing.delete(url));
    }
    return copy.data;
  }
  try {
    const data = await download(url, allowMissing);
    saveCopy(url, data);
    return data;
  } catch (e) {
    const old = fresh ? await readCopy(url) : null;
    if (old) return old.data;
    throw e;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mémorise le résultat d'une fonction asynchrone (par arguments) pour éviter les appels répétés.
export function memo(fn) {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (!cache.has(key)) {
      cache.set(key, fn(...args).catch((e) => { cache.delete(key); throw e; }));
    }
    return cache.get(key);
  };
}

export const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Retire les lignes vides d'une liste [cléDeTraduction, valeur].
export const clean = (rows) =>
  rows.filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length));
