// Clé courte et stable d'une adresse d'image (empreinte djb2 + longueur) : index des icônes intégrées
// (src/generated/icons.js, produit par scripts/make-icons.mjs). Même calcul dans l'appli et au moment de la compilation.
export function iconKey(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}${url.length.toString(36)}`;
}
