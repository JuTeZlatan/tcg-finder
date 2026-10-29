// Langue de l'application (menu « Langue ») : français, anglais, italien, allemand, chinois, portugais, espagnol.
// Les textes sont écrits en français dans le code et passent par t('…') ; les traductions sont dans src/translations/<langue>.js,
// rangées par texte français. Variables : t('{n} cartes', { n: 3 }). Texte absent d'un dictionnaire : affiché en français.
// Ne pas confondre avec la langue des cartes (src/lib/cardLang.js), qui choisit la version des cartes affichées.
import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import en from '../translations/en';
import it from '../translations/it';
import de from '../translations/de';
import zh from '../translations/zh';
import pt from '../translations/pt';
import es from '../translations/es';

// Chaque langue écrite dans sa propre langue, comme dans les réglages des téléphones.
export const APP_LANGS = { fr: 'Français', en: 'English', it: 'Italiano', de: 'Deutsch', zh: '中文（普通话）', pt: 'Português', es: 'Español' };
const DICTS = { en, it, de, zh, pt, es };
// Format des nombres, prix et dates de chaque langue.
const LOCALES = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', de: 'de-DE', zh: 'zh-CN', pt: 'pt-PT', es: 'es-ES' };
const STORAGE_KEY = 'appLang';

let lang = 'fr';
export const getAppLang = () => lang;
export const locale = () => LOCALES[lang];

export function t(text, vars) {
  let out = (lang !== 'fr' && DICTS[lang]?.[text]) || text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return out;
}
// Singulier ou pluriel selon n (les deux formes passent par la traduction ; 0 est au singulier en français seulement).
export const plural = (n, one, many, vars) => t((lang === 'fr' ? n > 1 : n !== 1) ? many : one, { n, ...vars });

// Après un changement de langue, l'appli est redessinée : le menu se rouvre sur la page « Langue ».
let reopenMenu = false;
export function takeReopenMenu() {
  const v = reopenMenu;
  reopenMenu = false;
  return v;
}

// Hors interface (tâche de fond) : langue enregistrée, sans passer par I18nProvider.
export async function loadAppLang() {
  const saved = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  lang = APP_LANGS[saved] ? saved : deviceLang();
  return lang;
}

function deviceLang() {
  const code = getLocales()[0]?.languageCode;
  return APP_LANGS[code] ? code : 'en';
}

const I18nContext = createContext(null);

// Rend l'appli seulement une fois la langue connue (pas d'éclair de texte dans une autre langue au démarrage).
export function I18nProvider({ children }) {
  const [appLang, setLang] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .catch(() => null)
      .then((saved) => {
        lang = APP_LANGS[saved] ? saved : deviceLang();
        setLang(lang);
      });
  }, []);
  const setAppLang = useCallback((l) => {
    if (!APP_LANGS[l] || l === lang) return;
    lang = l;
    reopenMenu = true;
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
    setLang(l);
  }, []);
  if (!appLang) return null;
  return createElement(I18nContext.Provider, { value: { appLang, setAppLang } }, children(appLang));
}

export const useI18n = () => useContext(I18nContext);
