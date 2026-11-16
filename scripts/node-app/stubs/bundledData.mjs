// Données « intégrées » lues directement en ligne (DATA_URL) : mêmes fichiers que ceux que l'appli embarque.
const BASE = process.env.EXPO_PUBLIC_DATA_URL;
const FILE_PATHS = {
  'pokemon-species': 'pokemon/species.json', 'pokemon-setlogos': 'pokemon/setlogos.json', 'pokemon-setdates': 'pokemon/setdates.json',
  'yugioh-archetypes': 'yugioh/archetypes.json', 'magic-planeswalkers': 'magic/planeswalkers.json',
};
export async function loadBundledFile(key) {
  if (!FILE_PATHS[key]) throw new Error(`pas de fichier ${key}`);
  const res = await fetch(`${BASE}/${FILE_PATHS[key]}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function loadBundled() { throw new Error('données intégrées indisponibles dans Node'); }
