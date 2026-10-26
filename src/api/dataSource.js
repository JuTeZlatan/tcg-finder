// Données produites par le script de collecte (pipeline/) : publiées chaque jour en ligne (DATA_URL, GitHub Pages)
// et intégrées à l'appli au moment de la compilation (assets/data).
// Ordre : données du jour en ligne (gardées sur le téléphone) → dernière copie gardée (hors ligne) → données intégrées.
// Ainsi une extension sortie aujourd'hui apparaît sans nouvelle version de l'appli.
import { Directory, File, Paths } from 'expo-file-system';
import { getJSON } from './http';
import { DATA_URL } from '../config';

const cacheDir = () => {
  const dir = new Directory(Paths.document, 'data-cache');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};
const cacheFile = (path) => new File(cacheDir(), path.replace(/[^A-Za-z0-9._-]/g, '_'));

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
    return f.exists ? JSON.parse(await f.text()) : null;
  } catch {
    return null;
  }
}

// `path` : fichier publié (ex. « onepiece/fr/sets.json ») ; `bundled()` : la même donnée intégrée à l'appli.
export async function loadData(path, bundled) {
  if (DATA_URL) {
    try {
      const data = await getJSON(`${DATA_URL}/${path}`);
      saveCopy(path, data);
      return data;
    } catch {
      const copy = await readCopy(path);
      if (copy) return copy;
    }
  }
  return bundled();
}
