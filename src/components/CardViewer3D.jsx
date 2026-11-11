// Carte en grand, en 3D : elle s'incline en suivant le doigt (glisser) et le téléphone (capteur de mouvement), avec un
// reflet de lumière et, pour les versions brillantes, un effet holographique qui bouge avec l'inclinaison :
// - holo : l'illustration seulement (cartes « Holo » Pokémon) ;
// - reverse : toute la carte sauf l'illustration ;
// - brillante (foil, etched, gold, alternative, enchantée…) : toute la carte.
// Les versions de la carte (normale, reverse, holo…) se choisissent en bas pour comparer leur rendu.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { DeviceMotion } from 'expo-sensors';
import { finishesOf, finishLabel, defaultFinish } from '../lib/finishes';
import { t } from '../lib/i18n';
import { colors } from '../lib/theme';

const MAX_TILT = 22; // degrés
const RATIO = 88 / 63;
// Zone de l'illustration (fractions de la carte) : effet « holo » dedans, « reverse » autour.
const ART = { pokemon: { x: 0.08, y: 0.11, w: 0.84, h: 0.42 }, default: { x: 0.07, y: 0.1, w: 0.86, h: 0.45 } };
const SHINY = /holo|foil|etched|gold|rainbow|cold|galaxy|cosmos|enchant|parallel|alternat|alt art|special|secret|ultra|full ?art|showcase|signature|manga|serialized|surge|textured|sp card|\bsec\b|\bsr\b|\bsp\b|legendary|epic|overnumber|illustration/i;

// Effet d'une version : 'reverse' | 'holo' (illustration) | 'foil' (toute la carte) | 'none' (reflet seul).
export function finishEffect(tcgId, finish, label, rarity) {
  const text = `${finish || ''} ${label || ''}`;
  if (/reverse/i.test(text)) return 'reverse';
  if (tcgId === 'pokemon' && /^holo|holofoil/i.test(finish || '')) return /illustration|ultra|secret|special|full|hyper|ex\b|gx|vmax|vstar/i.test(rarity || '') ? 'foil' : 'holo';
  if (SHINY.test(text)) return 'foil';
  if (!finish && SHINY.test(rarity || '')) return /holo/i.test(rarity) && tcgId === 'pokemon' ? 'holo' : 'foil';
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

  // Inclinaison en degrés (x : haut / bas, y : gauche / droite), pilotée par le doigt ou le téléphone.
  const [tilt] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const dragging = useRef(false);
  const base = useRef(null);
  useEffect(() => {
    if (!visible) return undefined;
    let sub = null;
    base.current = null;
    DeviceMotion.isAvailableAsync().then((ok) => {
      if (!ok) return;
      DeviceMotion.setUpdateInterval(30);
      sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation || dragging.current) return;
        // Position du téléphone à l'ouverture = carte de face ; on suit l'écart depuis cette position.
        if (!base.current) base.current = { beta: rotation.beta, gamma: rotation.gamma };
        const k = 180 / Math.PI;
        const x = Math.max(-MAX_TILT, Math.min(MAX_TILT, (rotation.beta - base.current.beta) * k * 0.9));
        const y = Math.max(-MAX_TILT, Math.min(MAX_TILT, (rotation.gamma - base.current.gamma) * k * 0.9));
        tilt.setValue({ x, y });
      });
    }).catch(() => {});
    return () => sub?.remove();
  }, [visible, tilt]);

  // Les refs ne sont lues que dans les gestionnaires du geste (jamais pendant le rendu).
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { dragging.current = true; },
    onPanResponderMove: (_, g) => {
      tilt.setValue({
        x: Math.max(-MAX_TILT, Math.min(MAX_TILT, (-g.dy / cardH) * MAX_TILT * 2.2)),
        y: Math.max(-MAX_TILT, Math.min(MAX_TILT, (g.dx / cardW) * MAX_TILT * 2.2)),
      });
    },
    onPanResponderRelease: () => {
      // Lâchée : la carte revient de face, puis le téléphone reprend la main.
      Animated.spring(tilt, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 5 }).start(() => {
        dragging.current = false;
        base.current = null;
      });
    },
  }), [tilt, cardW, cardH]);

  const rotateX = tilt.x.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [`${-MAX_TILT}deg`, `${MAX_TILT}deg`] });
  const rotateY = tilt.y.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [`${-MAX_TILT}deg`, `${MAX_TILT}deg`] });
  // Reflet et arc-en-ciel : déplacés avec l'inclinaison (la lumière glisse sur la carte).
  const shineX = tilt.y.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [-cardW * 0.6, cardW * 0.6] });
  const shineY = tilt.x.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [cardH * 0.4, -cardH * 0.4] });
  const holoX = tilt.y.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [-cardW * 1.2, cardW * 0.2] });
  const holoOpacity = Animated.add(tilt.x.interpolate({ inputRange: [-MAX_TILT, 0, MAX_TILT], outputRange: [0.25, 0.08, 0.25] }), tilt.y.interpolate({ inputRange: [-MAX_TILT, 0, MAX_TILT], outputRange: [0.3, 0.1, 0.3] }));

  const art = ART[tcgId] || ART.default;
  const rainbow = (
    <Animated.View
      pointerEvents="none"
      style={[styles.rainbow, { width: cardW * 2.4, height: cardH * 1.6, opacity: holoOpacity, transform: [{ translateX: holoX }, { translateY: -cardH * 0.3 }] }]}
    />
  );

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
          {/* Holographique : sur l'illustration (holo), autour (reverse) ou partout (brillante). */}
          {effect === 'foil' ? <View style={styles.clip} pointerEvents="none">{rainbow}</View> : null}
          {effect === 'holo' ? (
            <View pointerEvents="none" style={[styles.clipArt, { left: art.x * cardW, top: art.y * cardH, width: art.w * cardW, height: art.h * cardH }]}>{rainbow}</View>
          ) : null}
          {effect === 'reverse' ? (
            <>
              {/* Quatre bandes autour de l'illustration. */}
              {[
                { left: 0, top: 0, width: cardW, height: art.y * cardH },
                { left: 0, top: (art.y + art.h) * cardH, width: cardW, height: cardH * (1 - art.y - art.h) },
                { left: 0, top: art.y * cardH, width: art.x * cardW, height: art.h * cardH },
                { left: (art.x + art.w) * cardW, top: art.y * cardH, width: cardW * (1 - art.x - art.w), height: art.h * cardH },
              ].map((r, i) => <View key={i} pointerEvents="none" style={[styles.clipArt, r]}>{rainbow}</View>)}
            </>
          ) : null}
          {/* Reflet de lumière (toutes les cartes). */}
          <View style={styles.clip} pointerEvents="none">
            <Animated.View style={[styles.glare, { width: cardW * 1.6, height: cardH * 1.6, left: -cardW * 0.3, top: -cardH * 0.3, transform: [{ translateX: shineX }, { translateY: shineY }] }]} />
          </View>
        </Animated.View>

        <Text style={styles.hint}>{t('Incline ton téléphone ou fais glisser la carte')}</Text>
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
  clip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  clipArt: { position: 'absolute', overflow: 'hidden' },
  // Arc-en-ciel incliné, fondu « color-dodge » sur l'image : les couleurs éclaircissent la carte comme un film holographique.
  rainbow: {
    position: 'absolute', left: 0, top: 0, mixBlendMode: 'color-dodge',
    backgroundImage: 'linear-gradient(115deg, #ff3c78 0%, #ffd84a 14%, #4dffa6 28%, #3fd0ff 42%, #b36bff 56%, #ff3c78 70%, #ffd84a 84%, #4dffa6 100%)',
  },
  // Reflet : bande de lumière blanche diagonale, fondue « soft-light ».
  glare: {
    position: 'absolute', mixBlendMode: 'soft-light',
    backgroundImage: 'linear-gradient(125deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.75) 48%, rgba(255,255,255,0) 66%)',
  },
  hint: { color: colors.muted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 560 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#1A1A1A' },
});
