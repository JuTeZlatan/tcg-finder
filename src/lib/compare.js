// Comparateurs de textes créés une seule fois. Sur le téléphone, `a.localeCompare(b, 'fr')` reconstruit les règles de
// tri de la langue à chaque appel : trier les 1 027 Pokémon prenait plusieurs secondes au changement de langue.
const text = new Intl.Collator('fr');
const numeric = new Intl.Collator(undefined, { numeric: true });

// Ordre alphabétique (accents compris : « Électhor » avec les E).
export const compareText = (a, b) => text.compare(a ?? '', b ?? '');
// Numéros de cartes (« 2 » avant « 10 », « TG05 » après « TG04 »).
export const compareNumber = (a, b) => numeric.compare(String(a ?? ''), String(b ?? ''));
