// Icône de chaque jeu (icônes des sites officiels ; symbole planeswalker pour Magic), intégrées à l'appli.
// À afficher avec cachePolicy="memory" : une image intégrée est désignée par un numéro de ressource qui change quand on
// ajoute des images ; le cache disque d'expo-image garderait l'ancienne image sous ce numéro après une mise à jour.
export const GAME_ICONS = {
  pokemon: require('../../assets/games/pokemon.png'),
  magic: require('../../assets/games/magic.png'),
  yugioh: require('../../assets/games/yugioh.png'),
  onepiece: require('../../assets/games/onepiece.png'),
  lorcana: require('../../assets/games/lorcana.png'),
  riftbound: require('../../assets/games/riftbound.png'),
  dbsfw: require('../../assets/games/dbsfw.png'),
  dbsmasters: require('../../assets/games/dbsmasters.png'),
  swu: require('../../assets/games/swu.png'),
  cyberpunk: require('../../assets/games/cyberpunk.png'),
  naruto: require('../../assets/games/naruto.png'),
};

// Logo officiel (écriture du nom) de chaque jeu, seul sur sa tuile de l'accueil « Explorer » : sites officiels
// (Pokémon : logo officiel du JCC sur Wikimedia Commons), marges transparentes rognées.
export const GAME_WORDMARKS = {
  pokemon: require('../../assets/games/wordmarks/pokemon.png'),
  magic: require('../../assets/games/wordmarks/magic.png'),
  yugioh: require('../../assets/games/wordmarks/yugioh.png'),
  onepiece: require('../../assets/games/wordmarks/onepiece.png'),
  lorcana: require('../../assets/games/wordmarks/lorcana.png'),
  riftbound: require('../../assets/games/wordmarks/riftbound.png'),
  dbsfw: require('../../assets/games/wordmarks/dbsfw.png'),
  dbsmasters: require('../../assets/games/wordmarks/dbsmasters.png'),
  swu: require('../../assets/games/wordmarks/swu.png'),
  cyberpunk: require('../../assets/games/wordmarks/cyberpunk.webp'),
  naruto: require('../../assets/games/wordmarks/naruto.png'),
};
// Logo noir sur fond clair (One Piece) : affiché en blanc sur les tuiles sombres.
export const WORDMARK_TINT = { onepiece: '#FFFFFF' };
