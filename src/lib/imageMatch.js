// Comparaison visuelle de la carte filmée avec les images officielles des cartes candidates : départage les versions
// d'une même carte (illustration alternative, même code et même nom) et confirme (ou contredit) le code lu.
// L'empreinte (module natif card-vision) est une petite grille de couleurs normalisée ; deux empreintes se comparent
// par corrélation. Les empreintes des images officielles sont calculées une fois puis gardées sur le téléphone.
import { Directory, File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { available, fingerprint } from '../../modules/card-vision';

export const imageMatchAvailable = available;

const STORE = 'imageFingerprints';
const MAX_STORED = 3000;
let stored = null; // { url: empreinte }
const pending = new Map();

async function loadStore() {
  if (!stored) {
    try {
      stored = JSON.parse((await AsyncStorage.getItem(STORE)) || '{}');
    } catch {
      stored = {};
    }
  }
  return stored;
}
let saveTimer = null;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const keys = Object.keys(stored);
    if (keys.length > MAX_STORED) for (const k of keys.slice(0, keys.length - MAX_STORED)) delete stored[k];
    AsyncStorage.setItem(STORE, JSON.stringify(stored)).catch(() => {});
  }, 2000);
}

// Empreinte arrondie (2 décimales) : 3 × 192 nombres, ~2 ko par carte une fois enregistrée.
const compact = (fp) => fp.map((v) => Math.round(v * 100) / 100);

// Empreinte de l'image officielle d'une carte (null si l'image est introuvable).
export function refFingerprint(url) {
  if (!available || !url) return Promise.resolve(null);
  if (!pending.has(url)) {
    pending.set(url, (async () => {
      const db = await loadStore();
      if (db[url]) return db[url];
      const dir = new Directory(Paths.cache, 'card-refs');
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const file = await File.downloadFileAsync(url, new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.img`), { idempotent: true });
      try {
        const fp = compact(await fingerprint(file.uri));
        db[url] = fp;
        saveStore();
        return fp;
      } finally {
        try {
          file.delete();
        } catch {
          // déjà supprimée
        }
      }
    })().catch(() => {
      pending.delete(url); // réessayée la fois suivante
      return null;
    }));
  }
  return pending.get(url);
}

// Ressemblance de deux empreintes : corrélation (−1 → 1), la luminosité compte plus que les deux couleurs.
const WEIGHTS = [1, 0.6, 0.6];
export function similarity(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  const n = a.length / 3;
  let sum = 0;
  let weight = 0;
  for (let c = 0; c < 3; c++) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = c * n; i < (c + 1) * n; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na && nb) {
      sum += WEIGHTS[c] * (dot / Math.sqrt(na * nb));
      weight += WEIGHTS[c];
    }
  }
  return weight ? sum / weight : null;
}
