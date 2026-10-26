import { router } from 'expo-router';

// Ouvre une carte de la collection : fiche du catalogue dans la langue de l'exemplaire (pas celle choisie dans
// l'appli), ou fiche de modification pour une carte personnelle.
export function openItem(item) {
  if (item.tcg === 'custom') {
    router.push({ pathname: '/collection/custom', params: { key: item.key } });
  } else {
    router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: item.tcg, cardId: item.cardId, setId: item.setId ?? '', finish: item.finish ?? '', lang: item.lang ?? '' } });
  }
}
