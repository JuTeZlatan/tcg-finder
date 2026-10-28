// Vérifie un dictionnaire : clés inconnues (faute de frappe) et textes non traduits (hors noms propres identiques).
import fs from 'fs';
import { pathToFileURL } from 'url';
const [root, keysFile, ...langs] = process.argv.slice(2);
const keys = JSON.parse(fs.readFileSync(keysFile, 'utf8'));
const SAME = new Set(['ATK', 'DEF', 'Bonus', 'Cardmarket', 'TCGplayer', 'TCG Finder', 'Pokémon', 'Pokédex', 'Planeswalkers', 'Master set', 'OK', 'Tags', 'Format', 'Type', 'Types', 'Type(s)', 'Rare', 'Version', 'Description', 'Holo', 'holo', 'Foil', 'foil', 'Reverse', 'reverse', 'Unlimited', 'unlimited', 'Unlimited holo', 'unlimited holo', 'Holofoil', 'holofoil', 'Cold foil', 'cold foil', 'etched', 'italic', 'Tickets', 'Photo', 'Menu', 'promo W', 'Disney Lorcana TCG', 'Dragon Ball Super Card Game Fusion World', 'Dragon Ball Super Card Game Masters', 'League of Legends TCG', 'Magic: The Gathering', 'One Piece Card Game', 'Pokémon Trading Card Game', 'Yu-Gi-Oh! Trading Card Game', 'Euro (€)', 'Dollar ($)', 'Code(s)', 'max {amount}', 'PV']);
for (const l of langs) {
  const src = fs.readFileSync(`${root}/src/translations/${l}.js`, 'utf8').replace('export default', 'module.exports =');
  const tmp = `${process.env.TEMP || '/tmp'}/i18n-${l}.cjs`;
  fs.writeFileSync(tmp, src);
  const { default: dict } = await import(pathToFileURL(tmp));
  const unknown = Object.keys(dict).filter((k) => !keys.includes(k));
  const missing = keys.filter((k) => !(k in dict) && !SAME.has(k));
  const badVars = Object.entries(dict).filter(([k, v]) => (k.match(/\{\w+\}/g) || []).sort().join() !== (v.match(/\{\w+\}/g) || []).sort().join()).map(([k]) => k);
  console.log(`${l} : ${Object.keys(dict).length} traductions, ${unknown.length} clés inconnues, ${missing.length} manquantes, ${badVars.length} variables incohérentes`);
  for (const k of unknown) console.log('  inconnue :', JSON.stringify(k));
  for (const k of missing) console.log('  manquante :', JSON.stringify(k));
  for (const k of badVars) console.log('  variables :', JSON.stringify(k));
}
