// Son et vibration quand une carte est scannée, selon sa valeur (réglables dans Réglages > Scan) :
//   moins de 1 € : petit « tic » et vibration brève ;
//   de 1 à 10 €  : double tintement de pièce ;
//   10 € et plus : arpège de cloches (trésor) et vibration plus marquée.
// Sons créés par scripts/make-scan-sounds.mjs. Le mode silencieux du téléphone est respecté.
import { Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const SOUNDS = {
  low: require('../../assets/sounds/scan-low.wav'),
  mid: require('../../assets/sounds/scan-mid.wav'),
  high: require('../../assets/sounds/scan-high.wav'),
};
const VIBRATIONS = {
  low: 25,
  mid: [0, 35, 70, 35],
  high: [0, 50, 60, 50, 60, 140],
};

export const valueTier = (eur) => (eur == null || eur < 1 ? 'low' : eur < 10 ? 'mid' : 'high');

let players = null;
function playerOf(tier) {
  if (!players) {
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    players = {};
  }
  if (!players[tier]) players[tier] = createAudioPlayer(SOUNDS[tier]);
  return players[tier];
}

// `eur` : valeur de la carte en euros (null : inconnue → niveau le plus discret).
export function scanFeedback(eur, { sound = true, vibrate = true } = {}) {
  const tier = valueTier(eur);
  if (vibrate) Vibration.vibrate(VIBRATIONS[tier]);
  if (sound) {
    try {
      const p = playerOf(tier);
      p.seekTo(0);
      p.play();
    } catch {
      // son indisponible : la vibration suffit
    }
  }
}
