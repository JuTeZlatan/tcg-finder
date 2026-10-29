import { t } from './i18n';
// Liens de recherche eBay / Vinted pour une carte. On ouvre simplement le site (pas de collecte automatique) :
// les pages publiques d'eBay permettent même d'afficher les ventes réussies.
// La recherche = nom de la carte + son numéro, rien d'autre (c'est ce qui donne les meilleurs résultats),
// sans les mentions ajoutées par les sites de prix (« (OP05 Anniversary) », « (Prize Wall) »…).

// « Ariel - On Human Legs », « Kai'Sa - Daughter of the Void (Signature) » → « Ariel On Human Legs », « Kai'Sa Daughter of the Void »
function searchName(name) {
  return String(name || '')
    .replace(/\s*[([].*?[)\]]/g, '') // mentions entre parenthèses ou crochets
    .replace(/\s+[-–—:]\s+/g, ' ') // « Nom - Titre »
    .replace(/[,;!?"«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Numéro imprimé sur la carte : OP09-119, LOB-FR001, OGN-299, FB11-004, 4/102, 163…
function numberOf(tcgId, card, lang) {
  const detail = (key) => card.details?.find(([k]) => k === key)?.[1];
  if (tcgId === 'yugioh') {
    // Codes anglais chez YGOPRODeck (MP24-EN001) : version française imprimée MP24-FR001.
    const code = String(detail('codes') || '').split(',')[0].trim();
    return lang === 'fr' ? code.replace(/-EN(\d)/, '-FR$1') : code;
  }
  if (tcgId === 'riftbound') {
    // « OGN-299*/298 » → « OGN-299 » ; numéro sans code (« 199/219 », cartes ajoutées depuis TCGplayer) → « OPP-199 ».
    const n = String(card.number || detail('number') || '').split('/')[0].replace('*', '');
    return /^[A-Z]/i.test(n) || !card.setId ? n : `${String(card.setId).replace(/^tcg-/, '')}-${n}`;
  }
  if (tcgId === 'pokemon') {
    // « 4 / 102 » → « 4/102 » (avec les zéros imprimés : « 004/102 » pour les extensions récentes)
    const [n, total] = String(detail('number') || '').split('/').map((s) => s.trim());
    return n && total ? `${n}/${total.padStart(n.length, '0')}` : n;
  }
  return String(card.number || detail('number') || '').split(' ')[0] || null;
}

// `lang` : langue des cartes choisie (le nom de la carte est déjà dans cette langue).
export function marketQuery(tcgId, card, lang) {
  return [searchName(card.name), numberOf(tcgId, card, lang)].filter(Boolean).join(' ');
}

export function marketLinks(tcgId, card, lang) {
  const q = encodeURIComponent(marketQuery(tcgId, card, lang));
  return [
    { key: 'ebay', label: t('Annonces eBay'), icon: 'pricetag-outline', url: `https://www.ebay.fr/sch/i.html?_nkw=${q}` },
    { key: 'ebay-sold', label: t('Ventes réussies eBay'), icon: 'checkmark-done-outline', url: `https://www.ebay.fr/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1` },
    { key: 'vinted', label: t('Annonces Vinted'), icon: 'storefront-outline', url: `https://www.vinted.fr/catalog?search_text=${q}` },
  ];
}

// Exemplaire gradé (« PSA 9 », « PCA 8.5 ») : ventes réussies eBay et annonces Vinted pour estimer sa cote
// (aucune base de prix gradés ouverte : PriceCharting et PSA sont réservés aux abonnés).
export function gradedLinks(tcgId, card, lang, company, grade) {
  const q = encodeURIComponent(`${marketQuery(tcgId, card, lang)} ${company} ${grade}`);
  return [
    { key: 'ebay-sold', label: t('Ventes eBay {grade}', { grade: `${company} ${grade}` }), icon: 'checkmark-done-outline', url: `https://www.ebay.fr/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1` },
    { key: 'vinted', label: t('Vinted {grade}', { grade: `${company} ${grade}` }), icon: 'storefront-outline', url: `https://www.vinted.fr/catalog?search_text=${q}` },
  ];
}
