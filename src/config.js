// Adresse des fichiers produits par le script de collecte (pipeline/).
// Vide (par défaut) : l'appli utilise les données intégrées à la compilation (assets/data).
// Renseignée dans .env (EXPO_PUBLIC_DATA_URL=…) : données à jour chaque jour (GitHub Pages) ou serveur local de test.
export const DATA_URL = (process.env.EXPO_PUBLIC_DATA_URL || '').replace(/\/$/, '');
