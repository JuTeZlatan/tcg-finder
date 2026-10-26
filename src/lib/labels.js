// Libellés de l'interface (en français). Les connecteurs renvoient des clés ; une clé inconnue s'affiche telle quelle
// (c'est le cas des libellés déjà traduits par la source, ex. la galerie officielle Riftbound).
const FIELD = {
  set: 'Extension', number: 'Numéro', category: 'Catégorie', rarity: 'Rareté', hp: 'PV', types: 'Type(s)',
  stage: 'Stade', evolveFrom: 'Évolue de', trainerType: 'Type de dresseur', weakness: 'Faiblesse',
  resistance: 'Résistance', retreat: 'Retraite', illustrator: 'Illustrateur', format: 'Format', type: 'Type',
  manaCost: 'Coût de mana', powerToughness: 'Force / Endurance', loyalty: 'Loyauté', releaseDate: 'Date de sortie',
  finishes: 'Finitions', legalFormats: 'Formats légaux', codes: 'Code(s)', monsterType: 'Type de monstre / carte',
  attribute: 'Attribut', level: 'Niveau', rank: 'Rang', pendulumScale: 'Échelle Pendule', link: 'Lien',
  atk: 'ATK', def: 'DEF', archetype: 'Archétype', editionCount: 'Nombre d’éditions', color: 'Couleur',
  cost: 'Coût', power: 'Puissance', counter: 'Contre', life: 'Vie', subTypes: 'Types', domain: 'Domaine',
  energy: 'Énergie', might: 'Force', tags: 'Tags', variants: 'Variantes', block: 'Bloc', ink: 'Encre',
  inkwell: 'Encrier', strength: 'Force', willpower: 'Volonté', lore: 'Éclats de lore',
};
// « low » est l'annonce en vente la moins chère en ce moment, pas une vente : elle peut dépasser le prix
// des ventes récentes (personne ne vend moins cher aujourd'hui). Les libellés le disent pour éviter la confusion.
const PRICE = {
  trend: 'Tendance des ventes', avg: 'Moyenne des ventes', low: 'Annonce la moins chère', avg7: 'Ventes 7 j',
  avg30: 'Ventes 30 j', market: 'Ventes récentes', price: 'Prix', tickets: 'Tickets', lowestListing: 'Annonce la moins chère',
};
const VARIANT = {
  normal: 'normale', holo: 'holo', reverse: 'reverse', firstEdition: '1re édition', firstEditionHolo: '1re édition holo',
  unlimited: 'unlimited', unlimitedHolo: 'unlimited holo', foil: 'foil', etched: 'etched', wPromo: 'promo W',
  limited: 'édition limitée', holofoil: 'holofoil', 'cold foil': 'cold foil',
};
const SOURCE = {
  lowestMarket: 'Prix le plus bas par boutique',
  lowestAnyEdition: 'Prix le plus bas, toutes éditions',
  thisEdition: 'Cette édition (TCGplayer)',
  byEdition: 'Par édition (TCGplayer)',
};
const TEXT = { effect: 'Effet', description: 'Description', text: 'Texte', flavor: 'Ambiance' };
const RARITY = { common: 'Commune', uncommon: 'Peu commune', rare: 'Rare', mythic: 'Mythique', special: 'Spéciale', bonus: 'Bonus' };

export const fieldLabel = (key) => FIELD[key] ?? key;
export const textTitle = (t) => t.title || TEXT[t.titleKey] || '';
export const sourceLabel = (p) => p.source ?? SOURCE[p.sourceKey] ?? p.sourceKey;
export const fieldValue = (key, value) => (key === 'rarity' && RARITY[value]) || value;

export function priceLabel(item) {
  if (item.text) return item.text;
  const label = PRICE[item.label] ?? item.label ?? '';
  const variant = item.name || (item.variant ? VARIANT[item.variant] ?? item.variant : null);
  return variant ? `${label} (${variant})` : label;
}
