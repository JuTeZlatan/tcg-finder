// Module natif du scanner (Android seulement ; ailleurs `available` est faux et l'appli garde expo-camera).
import { Platform } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

const native = Platform.OS === 'android' ? requireOptionalNativeModule('CardVision') : null;

export const available = !!native;
// Texte d'une image (fichier) ; script : 'latin' | 'ja' | 'zh' (les deux derniers lisent aussi l'alphabet latin).
export const recognize = (uri, script = 'latin') => native.recognize(uri, script);
// Empreinte visuelle d'une image de carte (couleurs et formes sur une petite grille), voir lib/imageMatch.js.
export const fingerprint = (uri) => native.fingerprint(uri);
// Aperçu caméra analysé en direct : props active, torch, roi [x, y, l, h] (fractions de la vue), script ;
// événement onFrame { codeText, cardText, fingerprint } ; méthode capture() → photo de la carte (fichier).
export const CardScannerView = native ? requireNativeView('CardVision') : null;
