// Langue des cartes (FR / EN / DE / IT / ES / JA / ZH / KO) : version des cartes affichées, pas la langue de l'interface.
// Mémorisée sur le téléphone. Chaque jeu ne propose que les langues dans lesquelles il publie ses cartes.
import { createContext, createElement, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

export const CARD_LANGS = ['fr', 'en', 'de', 'it', 'es', 'ja', 'zh', 'ko'];
export const LANG_NAMES = {
  fr: 'Français', en: 'Anglais', de: 'Allemand', it: 'Italien', es: 'Espagnol', ja: 'Japonais', zh: 'Chinois', ko: 'Coréen',
};
const STORAGE_KEY = 'cardLang';

const CardLangContext = createContext(null);

export function CardLangProvider({ children }) {
  // Par défaut : la langue du téléphone si des cartes existent dans cette langue, sinon le français.
  const [cardLang, setState] = useState(() => (CARD_LANGS.includes(getLocales()[0]?.languageCode) ? getLocales()[0].languageCode : 'fr'));

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
