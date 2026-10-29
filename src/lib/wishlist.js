// Liste de souhaits (cartes recherchées) et alertes de prix.
// Rangée dans les réglages (settings.wishlist, sauvegardée avec le compte) : clé → { tcg, lang, cardId, setId, name,
// image, number, target (€ ou null), price (dernier prix connu, €), priceAt, alertedPrice, addedAt }.
// Les prix sont vérifiés à l'ouverture de l'appli (au plus toutes les 6 h) et en arrière-plan (tâche quotidienne) :
// une notification part quand une carte passe sous son prix cible (puis à chaque nouvelle baisse de plus de 2 %).
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings, STORAGE_KEY } from './settings';
import { fetchCardInfo } from './collection';
import { formatPrice, setDisplayCurrency, setPreferredSource } from './prices';
import { notifyNow } from './notifications';
import { getTcg } from '../api';
import { t } from './i18n';

export const wishKey = (tcg, lang, cardId) => `${tcg}|${lang}|${cardId}`;
const CHECK_EVERY = 6 * 3600 * 1000;

export function useWishlist() {
  const { settings, update } = useSettings();
  const wishlist = settings.wishlist || {};
  const save = useCallback((next) => update({ wishlist: next }), [update]);
  return {
    wishlist,
    list: Object.values(wishlist).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)),
    isWished: (tcg, lang, cardId) => !!wishlist[wishKey(tcg, lang, cardId)],
    add: (entry) => save({ ...wishlist, [wishKey(entry.tcg, entry.lang, entry.cardId)]: { target: null, addedAt: Date.now(), ...entry } }),
    remove: (key) => {
      const next = { ...wishlist };
      delete next[key];
      save(next);
    },
    setTarget: (key, target) => wishlist[key] && save({ ...wishlist, [key]: { ...wishlist[key], target, alertedPrice: null } }),
  };
}

// Vérifie les prix ; renvoie la liste mise à jour (ou null si rien à faire). `force` : sans attendre 6 h.
export async function checkWishlistPrices(wishlist, { force = false } = {}) {
  const entries = Object.entries(wishlist || {});
  const due = entries.filter(([, w]) => force || !w.priceAt || Date.now() - w.priceAt > CHECK_EVERY);
  if (!due.length) return null;
  const next = { ...wishlist };
  for (const [key, w] of due) {
    try {
      const info = await fetchCardInfo(w.tcg, w.cardId, w.setId, w.lang, null);
      const entry = { ...w, price: info.price, priceAt: Date.now() };
      if (w.target != null && info.price != null) {
        if (info.price <= w.target && (w.alertedPrice == null || info.price < w.alertedPrice * 0.98)) {
          await notifyNow(
            t('Prix en baisse : {name}', { name: w.name }),
            t('{price} (ton prix cible : {target}) · {game}', { price: formatPrice(info.price, 'EUR'), target: formatPrice(w.target, 'EUR'), game: getTcg(w.tcg)?.name || '' }),
            { tcg: w.tcg, cardId: w.cardId, setId: w.setId, lang: w.lang },
          );
          entry.alertedPrice = info.price;
        } else if (info.price > w.target) entry.alertedPrice = null;
      }
      next[key] = entry;
    } catch {
      // carte momentanément indisponible : nouvel essai à la prochaine vérification
    }
  }
  return next;
}

// Tâche de fond : lit et réécrit les réglages directement (l'interface n'est pas forcément ouverte).
export async function checkWishlistInBackground() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const settings = JSON.parse(raw);
  if (!Object.keys(settings.wishlist || {}).length) return;
  setPreferredSource(settings.priceSource || 'both');
  setDisplayCurrency(settings.currency || 'EUR');
  const next = await checkWishlistPrices(settings.wishlist, { force: true });
  if (!next) return;
  const latest = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '{}');
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...latest, wishlist: { ...latest.wishlist, ...pick(next, latest.wishlist) } }));
}

// Ne réécrit que les cartes encore dans la liste (une carte retirée pendant la vérification ne revient pas).
const pick = (next, current = {}) => Object.fromEntries(Object.entries(next).filter(([k]) => current[k]));
