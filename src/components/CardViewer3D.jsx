// Carte en grand, en 3D : elle s'incline en suivant le doigt (glisser) et revient de face une fois lâchée.
// Rendu des finitions au plus près d'une vraie carte : la brillance n'est pas une couche uniforme, c'est la lumière
// qui « accroche » une zone de la surface brillante et se déplace avec l'inclinaison. Chaque effet est donc :
// - limité à la zone brillante de la carte : l'illustration (holo), tout sauf l'illustration (reverse) ou toute la
//   carte, avec des bords fondus (plusieurs découpes emboîtées, chacune à une fraction de l'intensité) ;
// - visible seulement dans des taches de lumière aux bords très doux (textures « *-spot », générées par
//   scripts/make-foil-textures.mjs) qui traversent la carte à l'opposé de l'inclinaison, chacune à sa vitesse :
//   de face, presque rien ; inclinée, la lumière accroche la surface et glisse dessus. Aucun bord net.
// Finitions de chaque jeu : voir finishEffect. Les versions de la carte se choisissent en bas pour comparer.
import { useMemo, useState } from 'react';
import { Animated, Image as RNImage, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { finishesOf, finishLabel, defaultFinish } from '../lib/finishes';
import { t } from '../lib/i18n';
import { colors } from '../lib/theme';

const MAX_TILT = 22; // degrés
const RATIO = 88 / 63;
// Taches de lumière texturées (texture × fondu rond, transparentes sur les bords).
const SPOT = {
  rainbow: require('../../assets/foil/rainbow-spot.png'),
  sparkle: require('../../assets/foil/sparkle-spot.png'),
  stars: require('../../assets/foil/stars-spot.png'),
  cosmos: require('../../assets/foil/cosmos-spot.png'),
  lines: require('../../assets/foil/lines-spot.png'),
  gold: require('../../assets/foil/gold-spot.png'),
  silver: require('../../assets/foil/silver-spot.png'),
  glare: require('../../assets/foil/spot.png'),
};
// Fenêtre de l'illustration selon le cadre de la carte (fractions) : holo dedans, reverse autour.
const ART_WINDOWS = {
  pokemon: { x: 0.085, y: 0.105, w: 0.83, h: 0.415 },
  yugioh: { x: 0.123, y: 0.185, w: 0.754, h: 0.54 },
  magic: { x: 0.08, y: 0.115, w: 0.84, h: 0.44 },
};
const STEPS = 3; // découpes emboîtées : bord fondu de la zone brillante (0,6 → 0,84 → 0,94 vers l'intérieur)
const STEP_OPACITY = 0.6;
const FEATHER = 0.012; // écart entre deux découpes (fraction de la largeur de la carte)

// Effets : zone brillante et couches [tache texturée, opacité, vitesse et sens du déplacement, taille].
// Intensités retenues : discrètes de face, nettes seulement là où la lumière accroche, comme une vraie carte.
const EFFECTS = {
  holo: { zone: 'art', layers: [['cosmos', 0.91, 1, 1.1], ['rainbow', 0.82, 1.5, 1.3], ['sparkle', 0.82, -0.7, 1]] },
  secret: { zone: 'art', layers: [['rainbow', 0.91, 1.6, 1.3], ['lines', 0.55, 0.4, 1.2], ['sparkle', 0.95, -0.8, 1]] },
  reverse: { zone: 'reverse', layers: [['sparkle', 0.95, -0.8, 1.1], ['rainbow', 0.64, 1.4, 1.3]] },
  foil: { zone: 'full', layers: [['rainbow', 0.82, 1.4, 1.3], ['sparkle', 0.55, -0.6, 1.1]] },
  textured: { zone: 'full', layers: [['rainbow', 0.91, 1.6, 1.3], ['lines', 0.55, 0.4, 1.2], ['sparkle', 0.91, -0.8, 1]] },
  gold: { zone: 'full', layers: [['gold', 0.91, 1.2, 1.4], ['sparkle', 0.73, -0.6, 1.1]] },
  etched: { zone: 'full', layers: [['silver', 0.73, 1.2, 1.4], ['lines', 0.45, 0.4, 1.2]] },
  galaxy: { zone: 'full', layers: [['stars', 0.95, -0.7, 1.2], ['rainbow', 0.55, 1.4, 1.3]] },
  none: { zone: null, layers: [] },
};

// Finition d'une version, d'après la version choisie (identifiant + libellé), la rareté et le traitement spécial.
// Règles tirées des finitions réelles de chaque jeu (raretés présentes dans les données de l'appli).
export function finishEffect(tcgId, finish, label, rarity, treatment = '') {
  const v = `${finish || ''} ${label || ''}`.toLowerCase();
  const r = String(rarity || '').toLowerCase().trim();
  const tr = String(treatment || '').toLowerCase();
  const foilVersion = /foil|holo/.test(v); // version brillante d'une carte qui existe aussi en normale
  if (/reverse/.test(v)) return 'reverse';
  switch (tcgId) {
    case 'pokemon':
      // Holo : illustration ; ex / V / Radiant / ACE SPEC : toute la carte ; illustrations rares, Ultra, Secrètes,
      // Shiny : texturées ; Hyper Rare (dorées) : or.
      if (/hyper|gold/.test(r)) return 'gold';
      if (/illustration|ultra|secret|shiny|full|black white|amazing|classic/.test(r)) return 'textured';
      if (/double|holo rare v|vmax|vstar|\bex\b|gx|radiant|ace spec|break|prime|lv\.x/.test(r)) return 'foil';
      if (/holo/.test(`${v} ${r}`)) return 'holo';
      return 'none';
    case 'yugioh':
      // Super / Ultra Rare : illustration en holo ; Secret / Prismatic / Platinum : illustration en paillettes ;
      // Starlight, Quarter Century, Collector's, Ghost : toute la carte ; Ultimate : relief argenté ; Gold : or.
      if (/gold/.test(`${v} ${r}`)) return 'gold';
      if (/starlight|quarter century|collector|ghost/.test(`${v} ${r}`)) return 'textured';
      if (/secret|prismatic|platinum/.test(`${v} ${r}`)) return 'secret';
      if (/ultimate/.test(`${v} ${r}`)) return 'etched';
      if (/starfoil/.test(`${v} ${r}`)) return 'galaxy';
      if (/mosaic|shatterfoil/.test(`${v} ${r}`)) return 'foil';
      if (/super rare|ultra rare/.test(`${v} ${r}`)) return 'holo';
      return 'none';
    case 'magic':
      // Version choisie (foil / etched), puis traitement de l'impression.
      if (/etched/.test(v)) return 'etched';
      if (!/foil/.test(v)) return 'none';
      if (/galaxy|confetti|stars/.test(tr)) return 'galaxy';
      if (/gilded|gold/.test(tr)) return 'gold';
      if (/surge|textured|neon|raised|halo|rainbow|ripple|double ?rainbow|step/.test(tr)) return 'textured';
      if (/silver/.test(tr)) return 'etched';
      return 'foil';
    case 'onepiece':
      // SEC / SP / Manga / Parallèles : texturées ; TR (Treasure Rare) : or ; R, SR, Leader : brillantes.
      if (r === 'tr' || /treasure|gold/.test(v)) return 'gold';
      if (r === 'sec' || /sp card|manga|parallel|alternat/.test(`${r} ${v}`)) return 'textured';
      if (/^(r|sr|l)$|leader/.test(r) || foilVersion) return 'foil';
      return 'none';
    case 'lorcana':
      // Enchantées et Iconiques : texturées ; Épiques : arc-en-ciel ; versions foil / cold foil : brillantes.
      if (/enchant|iconic/.test(r)) return 'textured';
      if (/epic/.test(r) || foilVersion) return 'foil';
      return 'none';
    case 'riftbound':
      // Rares et Épiques toujours brillantes ; Showcase (alternative, hors série, signature) : texturées.
      if (/showcase|overnumber|signature|alternat|ultimate/.test(`${r} ${v}`)) return 'textured';
      if (/^(rare|epic)$/.test(r) || foilVersion) return 'foil';
      return 'none';
    case 'swu':
      // Showcase : finition spéciale ; versions foil et Hyperspace foil : arc-en-ciel.
      if (/showcase|prestige/.test(`${r} ${v}`)) return 'textured';
      if (foilVersion) return 'foil';
      return 'none';
    case 'dbsfw':
    case 'dbsmasters':
      // SCR, SPR, God Rare, Concept Rare… : texturées ; SR, Leader : brillantes ; versions foil : brillantes.
      if (/god|gdr/.test(r)) return 'gold';
      if (/secret|scr|special|spr|concept|expansion|dragon ball rare|giant force|son gohan/.test(r)) return 'textured';
      if (/super rare|^sr$|^l$|leader|^r$/.test(r) || foilVersion) return 'foil';
      return 'none';
    case 'cyberpunk':
      // Secret (S) et Iconic (IL, IO, IS) : relief qui suit le dessin et nom argenté ; Nova (NR) : brillante.
      if (/^(s|il|io|is)$/.test(r)) return 'textured';
      if (/^nr$/.test(r) || foilVersion) return 'foil';
      return 'none';
    case 'naruto':
      // Legendary « Gold 22K », Chibi, POP, variante Gold : or ; Rare Art, Secret, Secret V, Special, Shinobi, Full Art :
      // texturées ; variante Holo : brillante (la rareté seule ne l'est pas).
      if (/legendary|chibi|pop|gold/.test(`${r} ${v} ${tr}`)) return 'gold';
      if (/rare art|secret|special|shinobi|full art/.test(`${r} ${v} ${tr}`)) return 'textured';
      if (/holo/.test(`${v} ${tr}`) || foilVersion) return 'foil';
      return 'none';
    default:
      return foilVersion ? 'foil' : 'none';
  }
}

// Finition d'une carte qui n'a qu'une version : la seule vendue, ou « foil » quand toutes ses versions sont
// brillantes (un site dit « foil », l'autre « holofoil »), sinon rien.
function soleFinish(prices) {
  const variants = [...new Set((prices || []).flatMap((p) => (p.items || []).map((i) => i.variant)).filter(Boolean))];
  if (variants.length === 1) return variants[0];
  return variants.length && variants.every((v) => /foil|holo/i.test(v)) ? 'foil' : null;
}

export default function CardViewer3D({ visible, onClose, image, tcgId, prices, rarity, treatment, initialFinish }) {
  const { width, height } = useWindowDimensions();
  // Proportions de l'image (hauteur / largeur) : cartes en hauteur, ou en largeur (Leaders et Bases de Star Wars).
  const [ratio, setRatio] = useState(RATIO);
  const cardW = Math.min(width * (ratio < 1 ? 0.94 : 0.86), (height * 0.66) / ratio);
  const cardH = cardW * ratio;
  // Versions proposées : celles de la carte (prix), sinon une seule.
  const finishes = useMemo(() => finishesOf(prices || []), [prices]);
  const [finish, setFinish] = useState(initialFinish || defaultFinish(finishes) || null);
  // Une seule version vendue (aucun choix proposé) : c'est la finition de la carte, ex. une rare qui n'existe qu'en foil.
  const shown = finish || soleFinish(prices);
  const effect = EFFECTS[finishEffect(tcgId, shown, shown ? finishLabel(prices, shown) : '', rarity, treatment)];

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
  // Part d'inclinaison (0 de face → 1 au maximum).
  const amount = Animated.add(
    tilt.x.interpolate({ inputRange: [-MAX_TILT, 0, MAX_TILT], outputRange: [0.5, 0, 0.5] }),
    tilt.y.interpolate({ inputRange: [-MAX_TILT, 0, MAX_TILT], outputRange: [0.5, 0, 0.5] }),
  );
  // Intensité de la brillance : faible de face, pleine une fois la carte inclinée.
  const shine = amount.interpolate({ inputRange: [0, 0.6], outputRange: [0.5, 1], extrapolate: 'clamp' });

  // Une tache texturée, centrée sur la carte, qui glisse à l'opposé de l'inclinaison (vitesse propre à la couche).
  // (ox, oy) : coin de la découpe qui la contient, pour garder la même position quelle que soit la découpe.
  const move = (speed) => [
    { translateX: tilt.y.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [cardW * 0.32 * speed, -cardW * 0.32 * speed] }) },
    { translateY: tilt.x.interpolate({ inputRange: [-MAX_TILT, MAX_TILT], outputRange: [-cardH * 0.24 * speed, cardH * 0.24 * speed] }) },
  ];
  const spot = (tex, opacity, speed, scale, ox, oy, key) => {
    const s = cardW * 1.4 * scale;
    return (
      <Animated.View key={key} style={{ position: 'absolute', left: (cardW - s) / 2 - ox, top: (cardH - s) / 2 - oy, width: s, height: s, opacity, transform: move(speed) }}>
        <RNImage source={SPOT[tex]} resizeMode="stretch" style={styles.fill} />
      </Animated.View>
    );
  };
  // Une découpe de la carte (rectangle en pixels) avec toutes les couches de l'effet dedans.
  const clip = (r, opacity, key) => (r.w > 0 && r.h > 0 ? (
    <View key={key} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, overflow: 'hidden', opacity }}>
      {effect.layers.map(([tex, o, speed, scale], i) => spot(tex, o, speed, scale, r.x, r.y, i))}
    </View>
  ) : null);

  // Zone brillante, bords fondus : STEPS découpes emboîtées, chacune à STEP_OPACITY.
  const frame = ART_WINDOWS[tcgId] || ART_WINDOWS.pokemon;
  const art = { x: frame.x * cardW, y: frame.y * cardH, w: frame.w * cardW, h: frame.h * cardH };
  const zone = [];
  for (let k = 0; k < STEPS && effect.zone; k++) {
    const e = k * FEATHER * cardW;
    if (effect.zone === 'full') {
      if (k === 0) zone.push(clip({ x: 0, y: 0, w: cardW, h: cardH }, 1, 'full'));
    } else if (effect.zone === 'art') {
      zone.push(clip({ x: art.x + e, y: art.y + e, w: art.w - 2 * e, h: art.h - 2 * e }, STEP_OPACITY, `a${k}`));
    } else {
      // Reverse : tout autour de l'illustration (bandes haut, bas, gauche, droite), qui s'en écartent un peu plus à chaque pas.
      const top = art.y - e;
      const bottom = art.y + art.h + e;
      zone.push(
        clip({ x: 0, y: 0, w: cardW, h: top }, STEP_OPACITY, `t${k}`),
        clip({ x: 0, y: bottom, w: cardW, h: cardH - bottom }, STEP_OPACITY, `b${k}`),
        clip({ x: 0, y: top, w: art.x - e, h: bottom - top }, STEP_OPACITY, `l${k}`),
        clip({ x: art.x + art.w + e, y: top, w: cardW - art.x - art.w - e, h: bottom - top }, STEP_OPACITY, `r${k}`),
      );
    }
  }
  const glare = amount.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.22], extrapolate: 'clamp' });

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
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onLoad={(e) => {
              const { width: w, height: h } = e.source || {};
              // Carte en largeur : le cadre prend sa forme (une carte en hauteur garde le format standard).
              if (w && h) setRatio(w > h ? h / w : RATIO);
            }}
          />
          {/* Finition : taches de lumière texturées, limitées à la zone brillante de la carte. */}
          {zone.length ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: shine }]}>{zone}</Animated.View>
          ) : null}
          {/* Reflet de lumière sur la surface (toutes les cartes, discret). */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {spot('glare', glare, 1.2, 1.1, 0, 0, 'glare')}
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
  fill: { width: '100%', height: '100%' },
  hint: { color: colors.muted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 560 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#1A1A1A' },
});
