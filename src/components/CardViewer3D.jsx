// Carte en grand, en 3D : elle s'incline en suivant le doigt (glisser) et revient de face une fois lâchée, avec un
// reflet de lumière et l'effet brillant de sa finition, qui bouge avec l'inclinaison (textures de assets/foil,
// superposées en fondu normal : visibles sur tous les téléphones). Finitions reproduites, d'après celles des jeux :
// - holo : illustration seulement (Pokémon holo « cosmos », Yu-Gi-Oh! Super / Ultra Rare, Dragon Ball R) ;
// - reverse : toute la carte sauf l'illustration (Pokémon reverse) ;
// - foil : arc-en-ciel sur toute la carte (Magic foil, One Piece SR / SEC / Leader, Lorcana foil, Star Wars foil…) ;
// - textured : arc-en-ciel, relief et paillettes (illustrations rares Pokémon, Enchantées Lorcana, SP / Manga /
//   Parallèles One Piece, Secret / Starlight / Quarter Century Yu-Gi-Oh!, Showcase, SCR / God Rare Dragon Ball…) ;
// - gold : or métallisé (Hyper Rare Pokémon, Gold Rare, DON!! dorées…) ; etched : argent mat (Magic etched) ;
// - galaxy : étoiles (Magic galaxy foil) ; none : reflet seul (version normale).
// Les versions de la carte (normale, reverse, holo…) se choisissent en bas pour comparer leur rendu.
import { useMemo, useState } from 'react';
import { Animated, Image as RNImage, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { finishesOf, finishLabel, defaultFinish } from '../lib/finishes';
import { t } from '../lib/i18n';
import { colors } from '../lib/theme';

const MAX_TILT = 22; // degrés
const RATIO = 88 / 63;
const TEX = {
  rainbow: require('../../assets/foil/rainbow.png'),
  sparkle: require('../../assets/foil/sparkle.png'),
  stars: require('../../assets/foil/stars.png'),
  cosmos: require('../../assets/foil/cosmos.png'),
  lines: require('../../assets/foil/lines.png'),
  gold: require('../../assets/foil/gold.png'),
  silver: require('../../assets/foil/silver.png'),
  glare: require('../../assets/foil/glare.png'),
};
// Zone de l'illustration (fractions de la carte) : effet « holo » dedans, « reverse » autour.
const ART = {
  pokemon: { x: 0.08, y: 0.11, w: 0.84, h: 0.42 },
  yugioh: { x: 0.12, y: 0.18, w: 0.76, h: 0.55 },
  magic: { x: 0.08, y: 0.11, w: 0.84, h: 0.45 },
  default: { x: 0.07, y: 0.1, w: 0.86, h: 0.45 },
};

// Couches de chaque finition : [texture, répétée (tuiles) ?, opacité de face, opacité inclinée, vitesse de défilement].
const LAYERS = {
  holo: [['cosmos', true, 0.35, 0.8, 1], ['rainbow', false, 0.2, 0.55, 1.6], ['sparkle', true, 0.3, 0.75, -0.6]],
  reverse: [['sparkle', true, 0.45, 0.95, -0.8], ['rainbow', false, 0.15, 0.45, 1.4]],
  foil: [['rainbow', false, 0.16, 0.48, 1.4], ['sparkle', true, 0.2, 0.55, -0.6]],
  textured: [['rainbow', false, 0.3, 0.7, 1.6], ['lines', true, 0.25, 0.5, 0.3], ['sparkle', true, 0.35, 0.9, -0.8]],
  gold: [['gold', false, 0.3, 0.6, 1.2], ['sparkle', true, 0.25, 0.7, -0.6]],
  etched: [['silver', false, 0.2, 0.45, 1.2], ['lines', true, 0.2, 0.4, 0.3], ['sparkle', true, 0.15, 0.45, -0.5]],
  galaxy: [['stars', true, 0.5, 1, -0.7], ['rainbow', false, 0.15, 0.45, 1.4]],
  none: [],
};

// Finition à afficher pour une version (identifiant + libellé) et la rareté de la carte.
export function finishEffect(tcgId, finish, label, rarity) {
  const v = `${finish || ''} ${label || ''}`.toLowerCase();
  const r = String(rarity || '').toLowerCase();
  const all = `${v} ${r}`;
  if (/reverse/.test(v)) return 'reverse';
  if (/etched|silver foil/.test(v)) return 'etched';
  if (/galaxy/.test(v)) return 'galaxy';
  if (/gold|hyper rare/.test(all) && !/golden ?age/.test(all)) return 'gold';
  if (/surge|textured|enchant|showcase|starlight|quarter century|illustration|ultra secret|secret|manga|sp card|\bsp\b|\bspr\b|parallel|alternat|alt art|god rare|\bgdr\b|\bscr\b|full art|rainbow|prestige|serialized|overnumber|signature|iconic|shiny|ghost|collector/.test(all)
    && !(tcgId === 'pokemon' && /^holo/.test(finish || '') && !/illustration|ultra|secret|shiny/.test(r))) return 'textured';
  if (tcgId === 'pokemon' && /holo/.test(all)) return /ultra|full/.test(r) ? 'textured' : /double|ex\b|gx|vmax|vstar|\bv\b/.test(r) ? 'foil' : 'holo';
  if (tcgId === 'yugioh' && /super rare|ultra rare|ultimate/.test(all)) return 'holo';
  if (tcgId === 'dbsfw' || tcgId === 'dbsmasters') { if (/^r$|\brare\b/.test(r) && !/super/.test(r)) return 'holo'; }
  if (/foil|holo|\bsr\b|\bsec\b|^l$|leader|legendary|super rare|epic|hyperspace/.test(all)) return 'foil';
  return 'none';
}

export default function CardViewer3D({ visible, onClose, image, tcgId, prices, rarity, initialFinish }) {
  const { width, height } = useWindowDimensions();
  const cardW = Math.min(width * 0.86, (height * 0.66) / RATIO);
  const cardH = cardW * RATIO;
  // Versions proposées : celles de la carte (prix), sinon une seule.
  const finishes = useMemo(() => finishesOf(prices || []), [prices]);
  const [finish, setFinish] = useState(initialFinish || defaultFinish(finishes) || null);
  const effect = finishEffect(tcgId, finish, finish ? finishLabel(prices, finish) : '', rarity);

  // Inclinaison en degrés (x : haut / bas, y : gauche / droite), pilotée par le doigt.
  const [tilt] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      tilt.setValue({
        x: Math.max(-MAX_TILT, Math.min(MAX_TILT, (-g.dy / cardH) * MAX_TILT * 2.2)),
        y: Math.max(-MAX_TILT, Math.min(MAX_TILT, (g.dx / cardW) * MAX_TILT * 2.2)),
      });
    },
    // Lâchée : la carte revient de face.
    onPanResponderRelease: () => Animated.spring(tilt, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 5 }).start(),
  }), [tilt, cardW, cardH]);

  const rotateX = tilt.x.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [`${-MAX_TILT}deg`, `${MAX_TILT}deg`] });
  const rotateY = tilt.y.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [`${-MAX_TILT}deg`, `${MAX_TILT}deg`] });
  // Part d'inclinaison (0 de face → 1 au maximum) : l'effet s'intensifie quand la carte penche.
  const amount = Animated.add(
    tilt.x.interpolate({ inputRange: [-MAX_TILT, 0, MAX_TILT], outputRange: [0.5, 0, 0.5] }),
    tilt.y.interpolate({ inputRange: [-MAX_TILT, 0, MAX_TILT], outputRange: [0.5, 0, 0.5] }),
  );
  // Reflet : tache de lumière qui traverse la carte à l'opposé de l'inclinaison.
  const glareX = tilt.y.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [cardW * 0.55, -cardW * 0.55] });
  const glareY = tilt.x.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [-cardH * 0.45, cardH * 0.45] });

  // Une couche de texture : plus grande que sa zone, elle glisse avec l'inclinaison (vitesse propre à chaque couche).
  const layer = ([tex, tiled, low, high, speed], w, h, key) => {
    const tx = tilt.y.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [-w * 0.35 * speed, w * 0.35 * speed] });
    const ty = tilt.x.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [h * 0.25 * speed, -h * 0.25 * speed] });
    const opacity = amount.interpolate({ inputRange: [0, 1], outputRange: [low, high], extrapolate: 'clamp' });
    const size = Math.max(w, h) * 1.9;
    return (
      <Animated.View key={key} pointerEvents="none" style={{ position: 'absolute', left: (w - size) / 2, top: (h - size) / 2, width: size, height: size, opacity, transform: [{ translateX: tx }, { translateY: ty }] }}>
        <RNImage source={TEX[tex]} resizeMode={tiled ? 'repeat' : 'stretch'} style={{ width: size, height: size }} />
      </Animated.View>
    );
  };
  const zone = (rect, key) => (
    <View key={key} pointerEvents="none" style={[styles.zone, rect]}>
      {LAYERS[effect].map((l, i) => layer(l, rect.width, rect.height, i))}
    </View>
  );
  const art = ART[tcgId] || ART.default;
  const artRect = { left: art.x * cardW, top: art.y * cardH, width: art.w * cardW, height: art.h * cardH };
  const zones = effect === 'none' ? [] : effect === 'holo' ? [artRect] : effect === 'reverse' ? [
    { left: 0, top: 0, width: cardW, height: art.y * cardH },
    { left: 0, top: (art.y + art.h) * cardH, width: cardW, height: cardH * (1 - art.y - art.h) },
    { left: 0, top: art.y * cardH, width: art.x * cardW, height: art.h * cardH },
    { left: (art.x + art.w) * cardW, top: art.y * cardH, width: cardW * (1 - art.x - art.w), height: art.h * cardH },
  ] : [{ left: 0, top: 0, width: cardW, height: cardH }];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.page}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={12} accessibilityLabel={t('Fermer')}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Animated.View
          {...pan.panHandlers}
          style={[styles.card, { width: cardW, height: cardH, transform: [{ perspective: 900 }, { rotateX }, { rotateY }] }]}
        >
          <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
          {zones.map((z, i) => zone(z, i))}
          {/* Reflet de lumière (toutes les cartes). */}
          <View style={styles.zoneFull} pointerEvents="none">
            <Animated.View
              style={{
                position: 'absolute', left: cardW * 0.5 - cardW * 0.55, top: cardH * 0.5 - cardW * 0.55, width: cardW * 1.1, height: cardW * 1.1,
                opacity: amount.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.55], extrapolate: 'clamp' }),
                transform: [{ translateX: glareX }, { translateY: glareY }],
              }}
            >
              <RNImage source={TEX.glare} resizeMode="stretch" style={{ width: '100%', height: '100%' }} />
            </Animated.View>
          </View>
        </Animated.View>

        <Text style={styles.hint}>{t('Fais glisser la carte pour l’incliner')}</Text>
        {finishes.length > 1 ? (
          <View style={styles.chips}>
            {finishes.map((f) => (
              <Pressable key={f} onPress={() => setFinish(f)} style={[styles.chip, f === finish && styles.chipActive]}>
                <Text style={[styles.chipText, f === finish && styles.chipTextActive]} numberOfLines={1}>{finishLabel(prices, f)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'rgba(5,6,10,0.96)', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 16 },
  close: { position: 'absolute', top: 48, right: 20, zIndex: 2 },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#111', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 18 }, elevation: 18 },
  zone: { position: 'absolute', overflow: 'hidden' },
  zoneFull: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  hint: { color: colors.muted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 560 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#1A1A1A' },
});
