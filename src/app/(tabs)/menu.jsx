import { Redirect } from 'expo-router';

// Onglet « Menu » : il n'affiche pas d'écran, il ouvre le menu latéral (voir src/app/(tabs)/_layout.jsx).
// Si on y arrive quand même (lien, retour), on repart sur l'Explorer plutôt qu'un écran vide.
export default function MenuTab() {
  return <Redirect href="/(tabs)/(explore)" />;
}
