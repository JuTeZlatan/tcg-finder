// Chaque TCG expose la même interface :
//   getSets(lang), getCards(setId, lang), searchCards(query, lang), getCard(cardId, setId, lang)
// - Pokémon, Magic, Yu-Gi-Oh! : API publiques interrogées en direct (plus quelques prix collectés chaque jour).
// - One Piece, Riftbound, Lorcana, Dragon Ball Super : fichiers produits chaque jour par le script de collecte (pipeline/).
// `languages` liste les versions de cartes disponibles ; sinon on retombe sur l'anglais.
// Onglet « personnages » (à côté des extensions) : charactersLabel, getCharacters(lang), getCharacterCards(id, lang).
import pokemon from './pokemon';
import magic from './magic';
import yugioh from './yugioh';
import { createStaticTcg } from './staticTcg';
import { LANG_NAMES } from '../lib/cardLang';

// Personnage d'une carte des jeux collectés (null : action, lieu, objet… qui ne représentent pas un personnage).
const typeOf = (c) => String(c.details?.find(([k]) => k === 'type' || k === 'Card Type')?.[1] || '');
// Retire les mentions entre parenthèses, même imbriquées (« Goku Black (Gold Stamped (01)) » → « Goku Black »).
const withoutTags = (name) => String(name).replace(/\s*\(.*$/, '').trim();
const ONE_PIECE_CHARACTER = /^(leader|personnage|character|リーダー|キャラクター)$/i;
const LORCANA_CHARACTER = /^(personnage|character)/i;
const DBS_CHARACTER = /^(z-)?(leader|battle|unison)$/i;
// « SS4 Son Goku, Cross Dimensional… » → « Son Goku » ; « Son Gohan : Future » → « Son Gohan »
const dbsName = (name) => withoutTags(name).split(/\s*(?:[,:]|\/\/)\s*/)[0].replace(/^(SS\d|SSB|SSG|SSR|SS|Super Saiyan( God)?( Blue)?( \d)?)\s+/i, '').trim();

const onepiece = createStaticTcg({
  id: 'onepiece',
  name: 'One Piece',
  tagline: 'One Piece Card Game',
  color: '#D62828',
  languages: ['fr', 'en', 'ja'],
  source: { name: 'Bandai, Cardmarket, TCGplayer' },
  characters: { label: 'Personnages', of: (c) => (ONE_PIECE_CHARACTER.test(typeOf(c)) ? withoutTags(c.name) : null) },
  note: {
    fr: 'Les cartes françaises existent à partir d’OP-09.',
    ja: 'Prix des versions japonaises : ceux des cartes internationales de même code (les extensions sorties seulement au Japon n’ont pas encore de prix).',
  },
});
const riftbound = createStaticTcg({
  id: 'riftbound',
  name: 'Riftbound',
  tagline: 'League of Legends TCG',
  color: '#0AC8B9',
  languages: ['fr', 'en', 'zh'],
  source: { name: 'Riot Games, Riftcodex, Cardmarket, TCGplayer' },
  // Champions : cartes « Nom - Titre » (noms anglais, aussi pour regrouper les cartes chinoises).
  characters: { label: 'Champions', keyLang: 'en', of: (c) => (c.name.includes(' - ') ? c.name.split(' - ')[0].trim() : null) },
  note: {
    fr: 'Noms traduits par TCG Finder (non officiels, sauf les champions) en attendant la version française de Riot ; images en anglais.',
    zh: 'Galerie officielle en chinois simplifié. Prix : ceux des cartes internationales de même numéro.',
  },
});
const lorcana = createStaticTcg({
  id: 'lorcana',
  name: 'Lorcana',
  tagline: 'Disney Lorcana TCG',
  color: '#3D6FD9',
  languages: ['fr', 'en'],
  source: { name: 'LorcanaJSON, Cardmarket, TCGplayer' },
  characters: { label: 'Personnages', of: (c) => (LORCANA_CHARACTER.test(typeOf(c)) ? withoutTags(c.name.split(' - ')[0]) : null) },
});
const dbsfw = createStaticTcg({
  id: 'dbsfw',
  name: 'Dragon Ball Fusion World',
  tagline: 'Dragon Ball Super Card Game Fusion World',
  color: '#F28C28',
  languages: ['en'],
  source: { name: 'TCGplayer, Cardmarket' },
  characters: { label: 'Personnages', resolveSuffix: true, of: (c) => (DBS_CHARACTER.test(typeOf(c)) ? dbsName(c.name) || null : null) },
});
const dbsmasters = createStaticTcg({
  id: 'dbsmasters',
  name: 'Dragon Ball Masters',
  tagline: 'Dragon Ball Super Card Game Masters',
  color: '#E0B000',
  languages: ['en'],
  source: { name: 'TCGplayer, Cardmarket' },
  characters: { label: 'Personnages', resolveSuffix: true, of: (c) => (DBS_CHARACTER.test(typeOf(c)) ? dbsName(c.name) || null : null) },
});

yugioh.note = { fr: 'Textes en français ; les images restent en anglais (pas de source FR).' };
magic.note = {
  fr: 'Nom, texte et image en français sur la fiche quand l’impression française existe.',
  ja: 'Nom, texte et image en japonais sur la fiche quand l’impression existe. Prix : ceux de la version anglaise.',
  zh: 'Nom, texte et image en chinois sur la fiche quand l’impression existe. Prix : ceux de la version anglaise.',
};

export const TCGS = [pokemon, magic, yugioh, onepiece, lorcana, riftbound, dbsfw, dbsmasters];
// « Autres » : cartes hors catalogue saisies à la main, présentes seulement dans la collection.
export const CUSTOM_TCG = { id: 'custom', name: 'Autres', tagline: 'Cartes saisies à la main', color: '#9B8AFB', languages: ['en'] };
export const getTcg = (id) => (id === 'custom' ? CUSTOM_TCG : TCGS.find((t) => t.id === id));
export const dataLang = (tcg, lang) => (tcg.languages.includes(lang) ? lang : 'en');

// Message affiché sous le sélecteur de langue pour un jeu donné.
export function langNote(tcg, lang) {
  if (!tcg.languages.includes(lang)) {
    return `Pas de version ${LANG_NAMES[lang]?.toLowerCase() ?? lang} disponible pour ce jeu : cartes affichées en anglais.`;
  }
  return tcg.note?.[lang] ?? null;
}
