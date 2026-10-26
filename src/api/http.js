const HEADERS = { Accept: 'application/json', 'User-Agent': 'TCGFinder/1.0' };

export async function getJSON(url, { allowMissing = false } = {}) {
  const res = await fetch(url, { headers: HEADERS });
  if (allowMissing && (res.status === 404 || res.status === 400)) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url.split('/')[2]})`);
  return res.json();
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
