// Langue des cartes (FR / EN / JA / ZH) : version des cartes affichées, pas la langue de l'interface. Mémorisée sur le téléphone.
import { createContext, createElement, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

export const CARD_LANGS = ['fr', 'en', 'ja', 'zh'];
export const LANG_NAMES = { fr: 'Français', en: 'Anglais', ja: 'Japonais', zh: 'Chinois' };
const STORAGE_KEY = 'cardLang';

const CardLangContext = createContext(null);

export function CardLangProvider({ children }) {
  const [cardLang, setState] = useState(() => (getLocales()[0]?.languageCode === 'en' ? 'en' : 'fr'));

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => CARD_LANGS.includes(saved) && setState(saved))
      .catch(() => {});
  }, []);

  const setCardLang = (lang) => {
    setState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  };

  return createElement(CardLangContext.Provider, { value: { cardLang, setCardLang } }, children);
}

export const useCardLang = () => useContext(CardLangContext);
