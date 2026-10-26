// Profil et réglages simples, mémorisés sur le téléphone : pseudo, avatar, vue des extensions par défaut, site(s) de prix.
import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setPreferredSource } from './prices';

const STORAGE_KEY = 'settings.v1';
const DEFAULTS = {
  pseudo: '',
  // avatar : { type: 'photo', uri } ou { type: 'game', id } (icône d'un jeu), null = initiale du pseudo
  avatar: null,
  // Vue d'une extension à l'ouverture : 'simple' (une carte par numéro) ou 'master' (chaque version)
  setView: 'simple',
  // Site(s) de prix : 'both', 'cardmarket' ou 'tcgplayer' (voir src/lib/prices.js)
  priceSource: 'both',
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = { ...DEFAULTS, ...JSON.parse(raw) };
        setPreferredSource(saved.priceSource);
        setSettings(saved);
      })
      .catch(() => {});
  }, []);

  const update = useCallback((patch) => {
    // Source des prix appliquée tout de suite : les calculs lancés juste après (mise à jour de la collection) l'utilisent.
    if (patch.priceSource) setPreferredSource(patch.priceSource);
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return createElement(SettingsContext.Provider, { value: { settings, update } }, children);
}

export const useSettings = () => useContext(SettingsContext);
