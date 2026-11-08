// Données produites par le script de collecte (pipeline/) : publiées chaque jour en ligne (DATA_URL, GitHub Pages)
// et intégrées à l'appli au moment de la compilation (assets/data).
// Copie gardée sur le téléphone : servie telle quelle pendant 6 h ; plus ancienne, la version du jour est demandée
// (4 s au plus, la copie sert si le réseau est lent ou absent), pour ne jamais afficher une extension corrigée depuis.
// Sans copie : en ligne (délai maximum de 15 s), sinon les données intégrées.
import { Directory, File, Paths } from 'expo-file-system';
import { fetchWithTimeout } from './http';
import { DATA_URL } from '../config';

const cacheDir = () => {
  const dir = new Directory(Paths.document, 'data-cache');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};
const cacheFile = (path) => new File(cacheDir(), path.replace(/[^A-Za-z0-9._-]/g, '_'));

const FRESH_FOR = 6 * 3600 * 1000;
const refreshing = new Set();

function saveCopy(path, data) {
  try {
    cacheFile(path).write(JSON.stringify(data));
  } catch {
    // copie impossible (espace disque…) : sans conséquence, la prochaine ouverture réessaiera
  }
}

async function readCopy(path) {
  try {
    const f = cacheFile(path);
    return f.exists ? { data: JSON.parse(await f.text()), at: f.modificationTime ?? 0 } : null;
  } catch {
    return null;
  }
}

const STALE_TIMEOUT = 4000;

async function download(path, timeout) {
  const res = await fetchWithTimeout(`${DATA_URL}/${path}`, { headers: { Accept: 'application/json' } }, timeout);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  saveCopy(path, data);
  return data;
}

// `path` : fichier publié (ex. « onepiece/fr/sets.json ») ; `bundled()` : la même donnée intégrée à l'appli.
export async function loadData(path, bundled) {
  if (!DATA_URL) return bundled();
  const copy = await readCopy(path);
  if (copy) {
    if (Date.now() - copy.at <= FRESH_FOR || refreshing.has(path)) return copy.data;
    refreshing.add(path);
    try {
      return await download(path, STALE_TIMEOUT);
    } catch {
      return copy.data;
    } finally {
      refreshing.delete(path);
    }
  }
  try {
    return await download(path);
  } catch {
    return bundled();
  }
}
