// Dos de carte affiché quand on retourne une carte en 3D (src/components/CardViewer3D.jsx).
// Images intégrées à l'appli (assets/backs, affichage instantané et hors ligne), une par dos réel de chaque jeu :
// - Pokémon : dos international (fr, en, de, it, es) ; dos japonais (ja, et zh : cartes de Taïwan) ; cartes
//   japonaises sorties avant Pokémon Card★VS (19/07/2001) : ancien dos « Pocket Monsters Card Game » (旧裏).
// - One Piece : bleu (deck), rouge (Leaders), blanc (cartes DON!!).
// - Riftbound : bleu (deck principal), blanc (Runes), noir (Légendes et Champs de bataille).
// - Magic, Yu-Gi-Oh!, Lorcana, Dragon Ball Fusion World, Star Wars Unlimited, Cyberpunk, Naruto : un dos par jeu.
// Cartes recto-verso : leur vraie seconde face (`card.back`, ou adresse officielle pour les Leaders Dragon Ball).
const BACKS = {
  pokemon: require('../../assets/backs/pokemon.webp'),
  'pokemon-jp': require('../../assets/backs/pokemon-jp.webp'),
  'pokemon-jp-old': require('../../assets/backs/pokemon-jp-old.webp'),
  magic: require('../../assets/backs/magic.webp'),
  yugioh: require('../../assets/backs/yugioh.webp'),
  onepiece: require('../../assets/backs/onepiece.webp'),
  'onepiece-leader': require('../../assets/backs/onepiece-leader.webp'),
  'onepiece-don': require('../../assets/backs/onepiece-don.webp'),
  lorcana: require('../../assets/backs/lorcana.webp'),
  riftbound: require('../../assets/backs/riftbound.webp'),
  'riftbound-rune': require('../../assets/backs/riftbound-rune.webp'),
  'riftbound-black': require('../../assets/backs/riftbound-black.webp'),
  dbsfw: require('../../assets/backs/dbsfw.webp'),
  swu: require('../../assets/backs/swu.webp'),
  cyberpunk: require('../../assets/backs/cyberpunk.webp'),
  naruto: require('../../assets/backs/naruto.webp'),
};

const typeOf = (card) => String(card?.details?.find(([k]) => /^(type|card type)$/i.test(k))?.[1] || '');
// Numéro officiel Bandai (« FB01-001 », « BT32-001 ») d'une carte Dragon Ball.
const bandaiNumber = (card) => String(card?.number || '').match(/^[A-Z]+\d*[A-Z]?-\d+/i)?.[0]?.toUpperCase() || null;
// Version de base (sans mention « (Alternate Art) », « (SLR) »…) : seule à avoir les images officielles de base.
const isBase = (card) => !/\(/.test(String(card?.name || ''));

// Dos d'une carte : { source, face, fallback, front }. `source` : image intégrée ou adresse ; `face: true` quand c'est
// une vraie seconde face (Leader, carte double face) ; `fallback` : dos du jeu si elle ne se charge pas ; `front` :
// recto à afficher à la place de l'image de la carte (Leaders Dragon Ball, dont l'image habituelle est le verso).
export function backOf(tcgId, card, { lang, setDate } = {}) {
  if (card?.back) return { source: card.back, face: true };
  const type = typeOf(card);
  switch (tcgId) {
    case 'pokemon':
      // Japonais et chinois (Taïwan) : dos japonais ; toutes les autres langues : dos international.
      if (lang === 'ja' && setDate && setDate < '2001-07-19') return { source: BACKS['pokemon-jp-old'] };
      return { source: BACKS[lang === 'ja' || lang === 'zh' ? 'pokemon-jp' : 'pokemon'] };
    case 'onepiece':
      if (/leader/i.test(type)) return { source: BACKS['onepiece-leader'] };
      if (/don!!/i.test(`${type} ${card?.name || ''}`)) return { source: BACKS['onepiece-don'] };
      return { source: BACKS.onepiece };
    case 'riftbound':
      if (/rune/i.test(type)) return { source: BACKS['riftbound-rune'] };
      if (/legend|battlefield/i.test(type)) return { source: BACKS['riftbound-black'] };
      return { source: BACKS.riftbound };
    case 'dbsfw': {
      // Leaders : l'image de TCGplayer montre la face « éveillée » ; recto et verso officiels de Bandai.
      const n = bandaiNumber(card);
      const dir = `https://www.dbs-cardgame.com/fw/images/cards/card/${lang === 'ja' ? 'jp' : 'en'}/${n}`;
      if (/leader/i.test(type) && n && isBase(card)) return { front: `${dir}_f.webp`, source: `${dir}_b.webp`, face: true, fallback: BACKS.dbsfw };
      return { source: BACKS.dbsfw };
    }
    case 'dbsmasters': {
      const n = bandaiNumber(card);
      // Leaders : même chose (image TCGplayer = face éveillée).
      if (/leader/i.test(type) && n && isBase(card)) return { front: `https://www.dbs-cardgame.com/images/cardlist/cardimg/${n}.png`, source: `https://www.dbs-cardgame.com/images/cardlist/cardimg/${n}_b.png`, face: true, fallback: BACKS.dbsmasters || null };
      return { source: BACKS.dbsmasters || null };
    }
    default:
      return { source: BACKS[tcgId] || null };
  }
}
