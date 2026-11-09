// Tâches discrètes de l'appli ouverte (rien à l'écran) :
// - liste de souhaits : prix vérifiés à l'ouverture (au plus toutes les 6 h) ;
// - alertes de prix : vérifiées à l'ouverture (au plus toutes les 6 h) ; anciens prix cibles repris en alertes ;
// - surveillance de la collection : après chaque mise à jour des prix de la collection (une fois par jour) ;
// - tâche de fond activée tant qu'il y a quelque chose à surveiller ;
// - toucher une notification ouvre la fiche de la carte (ou la page indiquée).
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSettings } from '../lib/settings';
import { useCollection } from '../lib/collection';
import { checkWishlistPrices } from '../lib/wishlist';
import { checkAlerts, checkCollection, mergeAlertResults, migrateWishlistTargets } from '../lib/priceAlerts';
import { setPriceTask } from '../lib/backgroundTasks';

export default function Watchers() {
  const { settings, loaded, update } = useSettings();
  const { items, pricesUpdatedAt, loaded: collectionLoaded } = useCollection();
  const settingsRef = useRef(settings);
  const itemsRef = useRef(items);
  useEffect(() => {
    settingsRef.current = settings;
    itemsRef.current = items;
  }, [settings, items]);
  const wishCount = Object.keys(settings.wishlist || {}).length;
  const alertCount = Object.keys(settings.alerts || {}).length;
  const watching = !!settings.collectionWatch?.enabled;

  // Anciens prix cibles de la liste de souhaits → alertes « sous ce prix » (une fois).
  useEffect(() => {
    if (!loaded) return;
    const moved = migrateWishlistTargets(settingsRef.current.wishlist || {}, settingsRef.current.alerts || {});
    if (moved) update(moved);
  }, [loaded, update]);

  useEffect(() => {
    if (loaded) setPriceTask(wishCount > 0 || alertCount > 0 || watching);
  }, [loaded, wishCount, alertCount, watching]);

  useEffect(() => {
    if (!loaded || !wishCount) return undefined;
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
  }, [loaded, wishCount, update]);

  useEffect(() => {
    if (!loaded || !alertCount) return undefined;
    let cancelled = false;
    checkAlerts(settingsRef.current.alerts).then((next) => {
      if (cancelled || !next) return;
      update({ alerts: mergeAlertResults(settingsRef.current.alerts, next) }, { fromSync: true });
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loaded, alertCount, update]);

  // Prix de la collection mis à jour (chaque jour à l'ouverture, ou à la demande) : cartes qui ont bougé.
  useEffect(() => {
    if (!loaded || !collectionLoaded || !watching || !pricesUpdatedAt) return;
    checkCollection(itemsRef.current, settingsRef.current.collectionWatch).catch(() => {});
  }, [loaded, collectionLoaded, watching, pricesUpdatedAt]);

  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = response?.notification.request.content.data;
    if (data?.cardId && data.tcg) {
      router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: data.tcg, cardId: data.cardId, setId: data.setId || '', lang: data.lang || '', finish: data.finish || '' } });
    } else if (data?.url) router.push(data.url);
  }, [response]);

  return null;
}

const pickPrice = ({ price, priceAt }) => ({ price, priceAt });
