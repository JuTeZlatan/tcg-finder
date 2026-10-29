// Tâches discrètes de l'appli ouverte (rien à l'écran) :
// - liste de souhaits : vérification des prix à l'ouverture (au plus toutes les 6 h) et tâche de fond activée ;
// - toucher une notification d'alerte de prix ouvre la fiche de la carte.
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSettings } from '../lib/settings';
import { checkWishlistPrices } from '../lib/wishlist';
import { setPriceTask } from '../lib/backgroundTasks';

export default function Watchers() {
  const { settings, loaded, update } = useSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const count = Object.keys(settings.wishlist || {}).length;

  useEffect(() => {
    if (!loaded) return undefined;
    setPriceTask(count > 0);
    if (!count) return undefined;
    let cancelled = false;
    checkWishlistPrices(settingsRef.current.wishlist).then((next) => {
      if (cancelled || !next) return;
      // Ne garde que les cartes encore dans la liste (elle a pu changer pendant la vérification).
      const current = settingsRef.current.wishlist || {};
      const merged = Object.fromEntries(Object.entries(current).map(([k, w]) => [k, next[k] ? { ...w, ...pickPrice(next[k]) } : w]));
      update({ wishlist: merged }, { fromSync: true }); // simple mise à jour des prix : ne compte pas comme une modification
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, count, update]);

  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = response?.notification.request.content.data;
    if (data?.cardId && data.tcg) {
      router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: data.tcg, cardId: data.cardId, setId: data.setId || '', lang: data.lang || '' } });
    } else if (data?.url) router.push(data.url);
  }, [response]);

  return null;
}

const pickPrice = ({ price, priceAt, alertedPrice }) => ({ price, priceAt, alertedPrice });
