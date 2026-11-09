// Profil et réglages simples, mémorisés sur le téléphone : pseudo, avatar, vue des extensions par défaut, site(s) de prix.
import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRates, setDisplayCurrency, setPreferredSource } from './prices';

export const STORAGE_KEY = 'settings.v1';
const DEFAULTS = {
  pseudo: '',
  // avatar : { type: 'photo', uri } ou { type: 'game', id } (icône d'un jeu), null = initiale du pseudo
  avatar: null,
  // Vue d'une extension à l'ouverture : 'simple' (une carte par numéro) ou 'master' (chaque version)
  setView: 'simple',
  // Site(s) de prix : 'both', 'cardmarket' ou 'tcgplayer' (voir src/lib/prices.js)
  priceSource: 'both',
  // Devise d'affichage des prix : 'EUR', 'USD' ou 'GBP' (voir src/lib/prices.js)
  currency: 'EUR',
  // Scan : son et vibration à chaque carte reconnue, selon sa valeur (src/lib/scanFeedback.js)
  scanSound: true,
  scanVibrate: true,
  // Sorties suivies (onglet « Sorties ») : clés de src/lib/releases.js
  followed: [],
  // Cartes recherchées (liste de souhaits) : clé → { tcg, lang, cardId, setId, name, image, number, target, price… }
  wishlist: {},
  // Alertes de prix (src/lib/priceAlerts.js) : id → { tcg, lang, cardId, setId, finish, name, image, kind, value… }
  alerts: {},
  // Surveillance de toute la collection : carte possédée qui monte ou baisse d'au moins `percent` %
  // (cartes valant au moins `minPrice` €), et valeur totale de la collection.
  collectionWatch: { enabled: false, percent: 20, minPrice: 5 },
  // Tri des cartes d'une extension (src/lib/cardFilters.js), gardé d'une extension à l'autre
  gridSort: 'number',
  // Date du dernier changement (sauvegarde en ligne : le plus récent l'emporte)
  updatedAt: 0,
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  // Taux de change du jour : une fois chargés, les écrans qui lisent les réglages réaffichent leurs prix.
  const [ratesAt, setRatesAt] = useState(0);
  useEffect(() => {
    loadRates().then(() => setRatesAt(Date.now()));
  }, []);

  // Changements demandés avant la lecture des réglages enregistrés : appliqués après, sur les réglages lus
  // (sinon l'enregistrement partirait des réglages par défaut et effacerait alertes, liste de souhaits…).
  const pending = useRef([]);
  const loadedRef = useRef(false);

  // `fromSync` : réglages venus du compte en ligne, qui gardent leur date.
  const update = useCallback((patch, { fromSync } = {}) => {
    if (!loadedRef.current) {
      pending.current.push([patch, { fromSync }]);
      return;
    }
    // Source des prix appliquée tout de suite : les calculs lancés juste après (mise à jour de la collection) l'utilisent.
    if (patch.priceSource) setPreferredSource(patch.priceSource);
    if (patch.currency) setDisplayCurrency(patch.currency);
    setSettings((prev) => {
      const next = { ...prev, ...patch, updatedAt: fromSync ? patch.updatedAt ?? prev.updatedAt : Date.now() };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = { ...DEFAULTS, ...JSON.parse(raw) };
        setPreferredSource(saved.priceSource);
        setDisplayCurrency(saved.currency);
        setSettings(saved);
      })
      .catch(() => {})
      .finally(() => {
        loadedRef.current = true;
        setLoaded(true);
        for (const [patch, opts] of pending.current.splice(0)) update(patch, opts);
      });
  }, [update]);

  // Les refs ne sont lues que dans `update` (action), jamais pendant le rendu.
  // eslint-disable-next-line react-hooks/refs
  return createElement(SettingsContext.Provider, { value: { settings, loaded, update, ratesAt } }, children);
}

export const useSettings = () => useContext(SettingsContext);
