# TCG Finder

Appli mobile (Expo / React Native) : choisis ton TCG, parcours ses extensions, trouve ta carte et
découvre sa valeur. Le prix affiché est une **moyenne Cardmarket + TCGplayer**, convertie en euros
au taux du jour. Le sélecteur « Cartes en » choisit la version des cartes : **français, anglais, japonais, chinois**
(selon ce qui existe pour chaque jeu ; sinon anglais). Chaque fiche a des boutons eBay (annonces, ventes réussies) et Vinted.

| Jeu | Langues | Cartes / images | Prix |
|---|---|---|---|
| Pokémon | FR EN JA ZH | TCGdex en direct (photo TCGplayer si l'image manque ; extensions TCG Pocket exclues) | Cardmarket (TCGdex) + TCGplayer (collecté, catégories internationale et « Pokemon Japan ») |
| Magic | FR EN JA ZH | Scryfall en direct (fiche dans la langue si l'impression existe) | Cardmarket + TCGplayer (Scryfall, version anglaise) |
| Yu-Gi-Oh! | FR EN | YGOPRODeck en direct (texte FR, images EN) | Cardmarket par édition (collecté) + TCGplayer par édition |
| One Piece | FR EN JA | Sites officiels Bandai (FR à partir d'OP-09) | Cardmarket (fichiers publics) + TCGplayer (TCGCSV) |
| Lorcana | FR EN | LorcanaJSON (images officielles) | Cardmarket (fichiers publics) + TCGplayer (TCGCSV) |
| Riftbound | FR EN ZH | Galerie officielle Riot | Cardmarket (fichiers publics) + TCGplayer (Riftcodex + TCGCSV) |
| Dragon Ball Fusion World | EN | Catalogue TCGplayer (TCGCSV) | TCGplayer + Cardmarket (par code) |
| Dragon Ball Masters | EN | Catalogue TCGplayer (TCGCSV) | TCGplayer + Cardmarket (par nom) |
| Autres (cartes hors catalogue) | — | saisies à la main, photo prise avec le téléphone | prix saisi à la main |

Visuel à côté de chaque extension : logo TCGdex (Pokémon), symbole Scryfall (Magic), image YGOPRODeck (Yu-Gi-Oh!).
Pour les jeux sans logo publié (One Piece, Lorcana, Riftbound, Dragon Ball, et Pokémon japonais / chinois),
image du booster de l'extension chez TCGplayer. Sur l'accueil, un jeu sans cartes dans la langue choisie est grisé.

Versions d'une carte (normale, foil, reverse, holo, 1re édition / Unlimited, etched…) : choix sur la fiche et au scan,
proposé seulement quand un site cote la carte en plusieurs versions (`src/lib/finishes.js`). Le prix moyen et la valeur
en collection suivent la version choisie ; chaque version est un exemplaire distinct de la collection.

Master set : dans « Ma collection », une extension se suit en « Cartes » (une par numéro) ou en « Master set »
(chaque version de chaque carte : normale, reverse, foil, 1re édition, motifs, tampons…), avec les versions
manquantes ; `getVersions(setId, lang)` dans chaque connecteur, `src/lib/masterSet.js`.

Chaque jeu a deux onglets : « Extensions » et ses personnages — Pokémon (Pokédex, PokeAPI, tri A→Z ou n°),
Archétypes (Yu-Gi-Oh!), Planeswalkers (Magic, Scryfall), Personnages (One Piece, Lorcana, Dragon Ball), Champions
(Riftbound). Grille de 3 icônes ; un personnage ouvre toutes ses cartes, de la plus récente à la plus ancienne
(`getCharacters` / `getCharacterCards` dans chaque connecteur ; listes collectées : pokemon/species.json,
yugioh/archetypes.json, magic/planeswalkers.json).

Menu (bouton en bas à gauche) : panneau latéral avec avatar et pseudo, raccourcis (collection, scanner, carte hors
catalogue, mise à jour des prix) et réglages (langue des cartes, vue Simplifié / Master set par défaut) — `src/components/SideMenu.jsx`,
`src/lib/settings.js`. Icônes des jeux : `assets/games/` (icônes des sites officiels, symbole planeswalker pour Magic).

Scanner : onglet « Scanner », appareil photo uniquement ; lecture du code imprimé (ML Kit, sur le téléphone),
sinon du nom. Carte non reconnue → « L'ajouter à la main (dans « Autres ») ».

## Ma collection

Onglet « Ma collection » : ajout d'une carte avec le bouton + (grilles de recherche et d'extension) ou depuis
sa fiche (quantité, prix d'achat). Tableau de bord : valeur totale, nombre de cartes, évolution de la valeur,
répartition par jeu, cartes les plus chères ; par jeu puis par extension : complétion (cartes possédées /
taille de l'extension), valeur, cartes manquantes ; liste complète avec recherche, filtres et tris.
La collection est enregistrée sur le téléphone (`src/lib/collection.js`) ; les prix sont mis à jour
automatiquement une fois par jour à l'ouverture de l'onglet.

## Prix moyen

Moyenne Cardmarket + TCGplayer en euros. Le prix Cardmarket de référence est robuste (médiane tendance /
moyennes, prix foil pour les cartes uniquement foil). Pour One Piece et Riftbound, les cartes sont associées
aux produits Cardmarket / TCGplayer par code puis par proximité de prix entre versions ; un écart de plus
de ×4 est rejeté. L'appli signale quand les sites restent très éloignés (> ×2,5).
Extension sortie il y a moins de 40 jours : prix encore instables, marge d'erreur ×2,5 plus large (association et alerte).

Variantes absentes des catalogues officiels (signées, SP, avant-premières, Anniversary, promos de tournoi, Metal…) :
tout produit TCGplayer avec un prix qu'aucune carte ne référence est ajouté comme carte (One Piece, Riftbound, Lorcana),
avec le texte de la carte de base et un prix Cardmarket associé par proximité de prix. Pokémon : les versions vendues
à part (tampons, motif Master Ball, Shadowless, decks…) apparaissent dans « Autres versions » sur la fiche de la carte.

## Lancer l'appli sur ton téléphone

1. Installe **Expo Go** sur ton téléphone (App Store / Play Store).
2. Sur le PC, dans ce dossier :
   ```bash
   npm install
   npm run data          # collecte One Piece / Riftbound / Lorcana (≈ 3 min)
   npm run data:serve    # sert ces données sur le Wi-Fi (laisser tourner)
   npm start             # dans un 2e terminal
   ```
3. Scanne le QR code avec l'appareil photo (iPhone) ou Expo Go (Android).
   Le téléphone et le PC doivent être sur le même Wi-Fi ; l'IP du PC est dans `.env`.

## Compiler l'APK Android (sur ce PC)

Les données One Piece / Riftbound / Lorcana sont intégrées à l'APK (`npm run data:bundle`) :
l'appli marche partout sans serveur, avec les prix du jour de la compilation.

Le chemin `Desktop\App TCG` est trop long pour la compilation C++ sous Windows : on compile depuis
une copie dans `C:\tcgb`, avec CMake 3.31.6 (SDK Android) qui gère les chemins longs.

```powershell
npm run data; npm run data:bundle
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1         # rapide (~1 min)
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Full   # après ajout d'un module natif (~15 min)
```

Le script copie le code dans `C:\tcgb`, compile pour arm64 (téléphones) et x86_64 (émulateur) et dépose
`TCG-Finder.apk` à la racine du projet (signée avec la clé de debug : installable directement, mais une
vraie clé est nécessaire pour le Play Store).

## Données quotidiennes (One Piece, Riftbound, Lorcana)

`pipeline/` contient le script de collecte : il télécharge les catalogues FR/EN, les fichiers de prix
Cardmarket et les prix TCGplayer, associe les cartes, et écrit des JSON légers dans `pipeline/out/`.

En production, `.github/workflows/data.yml` le lance chaque jour et publie le résultat sur GitHub Pages
(gratuit). Une fois le dépôt publié sur GitHub et Pages activé, remplace dans `.env` :
`EXPO_PUBLIC_DATA_URL=https://<ton-compte>.github.io/<ton-depot>`

## Ajouter un jeu

Créer un connecteur dans `src/api/` (même interface que les autres : `getSets`, `getCards`,
`searchCards`, `getCard`) ou un collecteur dans `pipeline/`, puis l'ajouter à `src/api/index.js`.

## Contrôles de cohérence des prix

- Un produit TCGplayer relié à plusieurs cartes ne garde son prix que sur la plus concordante (`dedupeTcgplayer`).
- Statistique Cardmarket aberrante (à plus de ×10 des autres) écartée du prix de référence.
- Yu-Gi-Oh! : pas de prix Cardmarket par édition pour les extensions de moins de 3 cartes, un produit par édition.
- Pokémon : produit Cardmarket ré-associé par la collecte (`pokemon/cardmarket.json`) quand TCGdex relie plusieurs
  versions au même produit ; référence Unlimited plutôt que 1re édition ; pas de « reverse » pour les cartes qui n'en ont pas.
- Écarts restants connus : communes anciennes plus chères aux États-Unis, promos de tournoi Lorcana reliées à des produits
  différents par LorcanaJSON (signalées par l'alerte « prix très différents »).

## Limites connues

- Pas encore de ventes eBay réussies : il n'y a pas d'accès gratuit et autorisé
  (piste : API payante PriceCharting).
- Les prix Cardmarket des fichiers publics ne distinguent pas la langue de la carte.
- Riftbound en français : noms traduits par nos soins (`pipeline/i18n/riftbound-fr.json`, champions non traduits),
  nom anglais officiel affiché à côté (politique Riot). L'API officielle Riot n'a que l'anglais pendant sa bêta.
  Pas encore de source pour les images FR. Yu-Gi-Oh! : pas d'images FR.
- Pour One Piece et Riftbound, les versions alternatives sont associées aux produits Cardmarket
  dans l'ordre (normale, puis parallèle…). Les prix TCGplayer concordent, mais c'est une association approchée.
