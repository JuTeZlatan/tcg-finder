// Cyberpunk TCG (anglais) : catalogue et prix TCGplayer (via TCGCSV), prix Cardmarket (jeu 23).
// Les cartes françaises existent, mais aucune source publique ne donne leurs noms ni d'images durables (le site
// officiel ne montre que des images à liens temporaires) : l'appli affiche alors la version anglaise.
import { normName } from './lib.mjs';
import { buildTcgcsvGame } from './tcgcsvGame.mjs';

// « Adam Smasher - Ender of Legends (Epic) » → « adam smasher ender of legends »
const baseName = (s) => normName(String(s).replace(/\s*\([^)]*\)/g, ''));
const cmUrl = (name) => `https://www.cardmarket.com/fr/Cyberpunk/Products/Search?searchString=${encodeURIComponent(name.replace(/\s*\([^)]*\)/g, ''))}`;

export async function build(outDir) {
  await buildTcgcsvGame(outDir, {
    id: 'cyberpunk',
    label: 'Cyberpunk TCG',
    categoryId: 92,
    cardmarketGame: 23,
    cmKey: (p) => baseName(p.name),
    cardKey: (p) => baseName(p.name),
    cmUrl,
  });
}
