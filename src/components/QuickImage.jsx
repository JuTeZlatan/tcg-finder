// Image affichée instantanément si elle est intégrée à l'appli (icônes de personnages, logos d'extensions :
// planches de scripts/make-icons.mjs) : la vignette intégrée apparaît tout de suite, puis l'image en ligne, plus nette,
// la remplace dès qu'elle est chargée (et reste en cache). Sinon : image en ligne seule, comme avant.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { iconKey } from '../lib/iconKey';
import { INDEX, SHEETS } from '../generated/icons';

// `owner` : personnage ou extension (« onepiece|c|luffy », « pokemon|s|sv1 ») : son icône intégrée sert même si
// l'adresse de l'image a changé depuis la compilation (nouvelle carte la plus récente…), dans la langue des cartes,
// sinon en anglais ou en français.
const ownerKeys = (owner, lang) => {
  if (!owner) return [];
  const [tcg, ...rest] = owner.split('|');
  return [...new Set([lang, 'en', 'fr'])].filter(Boolean).map((l) => `${tcg}|${l}|${rest.join('|')}`);
};

export default function QuickImage({ uri, owner, lang, style, contentFit = 'cover', contentPosition, tintColor, onError }) {
  const entry = [uri, ...ownerKeys(owner, lang)].filter(Boolean).map((k) => INDEX[iconKey(k)]).find(Boolean);
  if (!entry) {
    return <Image source={uri} style={style} contentFit={contentFit} contentPosition={contentPosition} tintColor={tintColor} onError={onError} recyclingKey={uri} />;
  }
  // Clé = adresse : une case recyclée par la liste repart de la vignette intégrée.
  return <Bundled key={uri} uri={uri} entry={entry} style={style} contentFit={contentFit} contentPosition={contentPosition} tintColor={tintColor} />;
}

function Bundled({ uri, entry, style, contentFit, contentPosition, tintColor }) {
  const [box, setBox] = useState(null);
  const [sharp, setSharp] = useState(false);
  const [n, col, row] = entry;
  const sheet = SHEETS[n];
  // Case de la planche agrandie à la taille de l'image (même proportions), centrée.
  const s = box ? Math.min(box.width / sheet.cw, box.height / sheet.ch) : 0;
  const dx = box ? (box.width - sheet.cw * s) / 2 : 0;
  const dy = box ? (box.height - sheet.ch * s) / 2 : 0;
  return (
    <View style={[style, styles.clip]} onLayout={(e) => setBox(e.nativeEvent.layout)}>
      {box && !sharp ? (
        <Image
          source={sheet.src}
          style={{ position: 'absolute', width: sheet.w * s, height: sheet.h * s, left: dx - col * sheet.cw * s, top: dy - row * sheet.ch * s }}
          contentFit="fill"
          tintColor={tintColor}
          cachePolicy="memory"
        />
      ) : null}
      <Image
        source={uri}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        contentPosition={contentPosition}
        tintColor={tintColor}
        transition={150}
        onLoad={() => setSharp(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
