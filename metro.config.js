const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Données One Piece / Riftbound / Lorcana intégrées à l'appli (générées par `npm run data:bundle`).
config.resolver.assetExts.push('tcgdata');

module.exports = config;
