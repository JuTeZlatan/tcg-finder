// Module natif du scanner (Android seulement ; ailleurs `available` est faux et l'appli garde expo-camera).
import { Platform } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

const native = Platform.OS === 'android' ? requireOptionalNativeModule('CardVision') : null;

export const available = !!native;
// Texte d'une image (fichier) ; script : 'latin' | 'ja' | 'zh' | 'ko' (les trois derniers lisent aussi l'alphabet latin).
export const recognize = (uri, script = 'latin') => native.recognize(uri, script);
// Empreinte visuelle d'une image de carte (couleurs et formes sur une petite grille), voir lib/imageMatch.js.
export const fingerprint = (uri) => native.fingerprint(uri);
// Aperçu caméra analysé en direct : props active, torch, roi [x, y, l, h] (fractions de la vue), script ;
// événement onFrame { codeText, cardText, fingerprint } ; méthode capture() → photo de la carte (fichier).
// Index de reconnaissance par l'image seule (voir lib/visualIndex.js) : charge un fichier .bin, renvoie le nombre d'images.
export const loadIndex = (name, uri) => native.loadIndex(name, uri);
export const unloadIndex = (name) => native.unloadIndex(name);
// Avec la prop imageSearch, onFrame donne aussi visual : [{ index, i, score }] (meilleures images des index chargés).
export const CardScannerView = native ? requireNativeView('CardVision') : null;
