// Lecture des données intégrées à l'appli (assets/data/*.tcgdata, générées par `npm run data:bundle`).
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { memo } from './http';

const FILES = {
  // Doit correspondre aux fichiers produits par pipeline/bundle.mjs.
  'onepiece-fr': require('../../assets/data/onepiece-fr.tcgdata'),
  'onepiece-en': require('../../assets/data/onepiece-en.tcgdata'),
  'onepiece-ja': require('../../assets/data/onepiece-ja.tcgdata'),
  'riftbound-fr': require('../../assets/data/riftbound-fr.tcgdata'),
  'riftbound-en': require('../../assets/data/riftbound-en.tcgdata'),
  'riftbound-zh': require('../../assets/data/riftbound-zh.tcgdata'),
  'lorcana-fr': require('../../assets/data/lorcana-fr.tcgdata'),
  'lorcana-en': require('../../assets/data/lorcana-en.tcgdata'),
  'dbsfw-en': require('../../assets/data/dbsfw-en.tcgdata'),
  'dbsmasters-en': require('../../assets/data/dbsmasters-en.tcgdata'),
  'pokemon-tcgplayer': require('../../assets/data/pokemon-tcgplayer.tcgdata'),
  'pokemon-tcgplayer-ja': require('../../assets/data/pokemon-tcgplayer-ja.tcgdata'),
  'pokemon-setdates': require('../../assets/data/pokemon-setdates.tcgdata'),
  'pokemon-tcgplayer-versions': require('../../assets/data/pokemon-tcgplayer-versions.tcgdata'),
  'pokemon-setlogos': require('../../assets/data/pokemon-setlogos.tcgdata'),
  'pokemon-cardmarket': require('../../assets/data/pokemon-cardmarket.tcgdata'),
  'yugioh-cardmarket': require('../../assets/data/yugioh-cardmarket.tcgdata'),
  'yugioh-tcgplayer': require('../../assets/data/yugioh-tcgplayer.tcgdata'),
  'pokemon-species': require('../../assets/data/pokemon-species.tcgdata'),
  'yugioh-archetypes': require('../../assets/data/yugioh-archetypes.tcgdata'),
  'magic-planeswalkers': require('../../assets/data/magic-planeswalkers.tcgdata'),
  upcoming: require('../../assets/data/upcoming.tcgdata'),
};

export const loadBundledFile = memo(async (key) => {
  const [asset] = await Asset.loadAsync(FILES[key]);
  const text = await new File(asset.localUri).text();
  return JSON.parse(text);
});

// { generatedAt, sets: [...], cards: { [setId]: [...] } }
export const loadBundled = (tcgId, lang) => loadBundledFile(`${tcgId}-${lang}`);
