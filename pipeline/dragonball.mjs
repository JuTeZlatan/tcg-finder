// Dragon Ball Super Card Game (anglais) : Fusion World (2024+) et Masters (2017-2024), deux jeux distincts.
// Catalogue et prix TCGplayer via TCGCSV, prix Cardmarket via ses fichiers publics (jeu 13 : « Dragon Ball Super »).
import { normName } from './lib.mjs';
import { buildTcgcsvGame } from './tcgcsvGame.mjs';

const CARDMARKET_GAME = 13;
const cmUrl = (name) => `https://www.cardmarket.com/fr/DragonBallSuper/Products/Search?searchString=${encodeURIComponent(name)}`;

// « Son Goku // Son Goku (FB11-001) [Fusion World] » → « FB11-001 »
const fwCode = (s) => s.match(/\(([A-Z]{2,4}\d{0,2}-\d{2,3})\)/)?.[1];
// Masters : par nom, sans les mentions entre parenthèses / crochets ni le code TCGplayer.
const mastersName = (s) => normName(s.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').replace(/\s+-\s+[A-Z0-9_]+-[A-Z0-9]+$/i, ''));

export async function build(outDir) {
  await buildTcgcsvGame(outDir, {
    id: 'dbsfw',
    label: 'Dragon Ball Super Fusion World',
    categoryId: 80,
    cardmarketGame: CARDMARKET_GAME,
    cmKey: (p) => (/\[Fusion World\]/i.test(p.name) ? fwCode(p.name) : null),
    cardKey: (p) => p.number.toUpperCase(),
    cmUrl: (name, number) => cmUrl(number),
  });
  await buildTcgcsvGame(outDir, {
    id: 'dbsmasters',
    label: 'Dragon Ball Super Masters',
    categoryId: 27,
    cardmarketGame: CARDMARKET_GAME,
    cmKey: (p) => (/\[Fusion World\]/i.test(p.name) ? null : mastersName(p.name)),
    cardKey: (p) => mastersName(p.name),
    cmUrl,
  });
}
