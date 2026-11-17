// Carte en grand, en 3D : elle tourne librement en suivant le doigt, dans tous les sens (haut, bas, gauche, droite,
// en diagonale), continue sur sa lancée une fois lâchée et reste où on la laisse. Retournée, elle montre son dos :
// le dos réel du jeu (src/lib/cardBacks.js) ou la seconde face des cartes recto-verso (Leaders, cartes double face).
// Rendu des finitions au plus près d'une vraie carte : la brillance n'est pas une couche uniforme, c'est la lumière
// qui « accroche » une zone de la surface brillante et se déplace avec l'inclinaison. Chaque effet est donc :
// - limité à la zone brillante de la carte : l'illustration (holo), tout sauf l'illustration (reverse) ou toute la
//   carte, avec des bords fondus (plusieurs découpes emboîtées, chacune à une fraction de l'intensité) ;
// - visible seulement dans des taches de lumière aux bords très doux (textures « *-spot », générées par
//   scripts/make-foil-textures.mjs) qui traversent la carte à l'opposé de l'inclinaison, chacune à sa vitesse :
//   de face, presque rien ; inclinée, la lumière accroche la surface et glisse dessus. Aucun bord net.
// Finitions de chaque jeu : voir finishEffect. Les versions de la carte se choisissent en bas pour comparer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image as RNImage, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { finishesOf, finishLabel, defaultFinish } from '../lib/finishes';
import { backOf } from '../lib/cardBacks';
import FoilCard from './FoilCard';
import { t } from '../lib/i18n';
import { colors } from '../lib/theme';

const MAX_TILT = 22; // degrés : inclinaison qui donne la brillance maximale
const TURNS = 20; // tours couverts par les interpolations (angles ramenés entre -180° et 180° à chaque geste)
// Brillance selon l'orientation : de face 0, de profil (90°) le maximum, de nouveau 0 à 180° (la face est cachée),
// motif répété tous les 360° (courbe en zigzag : l'interpolation d'Animated n'a pas de sinus).
const zigzag = (max) => {
  const inputRange = [];
  const outputRange = [];
  for (let a = -360 * TURNS; a <= 360 * TURNS; a += 90) {
    inputRange.push(a);
    outputRange.push([0, max, 0, -max][((a / 90) % 4 + 4) % 4]);
  }
  return { inputRange, outputRange, extrapolate: 'clamp' };
};
const DEG = { inputRange: [-360 * TURNS, 360 * TURNS], outputRange: [`${-360 * TURNS}deg`, `${360 * TURNS}deg`] };
// Angle ramené entre -180° et 180° (même orientation).
const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
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
  // Rendu par le shader de FoilCard (zone seulement) :
  cosmos: { zone: 'art', layers: [] },
  lines: { zone: 'full', layers: [] },
  coldfoil: { zone: 'full', layers: [] },
  starlight: { zone: 'full', layers: [] },
  none: { zone: null, layers: [] },
};
// Motif du shader (src/components/FoilCard.jsx) de chaque finition.
const SHADER_KIND = { coldfoil: 'holo', holo: 'holo', cosmos: 'cosmos', secret: 'secret', lines: 'secret', reverse: 'reverse', foil: 'foil', textured: 'textured', gold: 'gold', etched: 'etched', galaxy: 'galaxy', starlight: 'starlight', none: 'none' };

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
      if (/double|holo rare v|vmax|vstar|\bex\b|gx|radiant|ace spec|break|prime|lv\.x/.test(r)) return 'lines';
      if (/holo/.test(`${v} ${r}`)) return 'cosmos';
      return 'none';
    case 'yugioh':
      // Super / Ultra Rare : illustration en holo ; Secret / Prismatic / Platinum : illustration en paillettes ;
      // Starlight, Quarter Century, Collector's, Ghost : toute la carte ; Ultimate : relief argenté ; Gold : or.
      // Version choisie (« Super Rare (RA05-EN037) ») ; sans choix, la rareté de l'impression affichée.
      const ygo = v.trim() ? v : r;
      if (/gold/.test(ygo)) return 'gold';
      if (/starlight|quarter century|collector/.test(ygo)) return 'starlight';
      if (/ghost/.test(ygo)) return 'etched';
      if (/secret|prismatic|platinum/.test(ygo)) return 'secret';
      if (/ultimate/.test(ygo)) return 'etched';
      if (/starfoil/.test(ygo)) return 'galaxy';
      if (/mosaic|shatterfoil/.test(ygo)) return 'foil';
      if (/super rare|ultra rare/.test(ygo)) return 'holo';
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
      // Enchantées et Iconiques : texturées ; « cold foil » : seules les zones claires de l'illustration brillent ;
      // Épiques et versions foil : voile arc-en-ciel sur toute la carte.
      if (/enchant|iconic/.test(r)) return 'textured';
      if (/cold/.test(v)) return 'coldfoil';
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

export default function CardViewer3D({ visible, onClose, image, tcgId, prices, rarity, treatment, initialFinish, card, lang, setDate }) {
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
  const effectName = finishEffect(tcgId, shown, shown ? finishLabel(prices, shown) : '', rarity, treatment);
  const effect = EFFECTS[effectName] || EFFECTS.none;
  // Inclinaison transmise au shader de la finition (sinus des angles), sans rendu React à chaque image.
  const foilTilt = useRef(null);
  const [foilReady, setFoilReady] = useState(false);
  const setFoilTilt = useCallback((set) => { foilTilt.current = set; }, []);
  const onFoilLoad = useCallback(() => setFoilReady(true), []);

  // Dos : image intégrée du jeu, ou seconde face (adresse) ; repli sur le dos du jeu si elle ne se charge pas.
  const back = useMemo(() => backOf(tcgId, card, { lang, setDate }), [tcgId, card, lang, setDate]);
  const [backFailed, setBackFailed] = useState(false);
  const [frontFailed, setFrontFailed] = useState(false);
  const backSource = backFailed ? back.fallback : back.source;

  // Orientation en degrés (x : autour de l'axe horizontal, haut / bas ; y : autour de l'axe vertical, gauche / droite),
  // pilotée par le doigt : un glissé sur toute la largeur de la carte la fait tourner d'un demi-tour.
  const [rot] = useState(() => ({ x: new Animated.Value(0), y: new Animated.Value(0) }));
  const pan = useMemo(() => {
    const start = { x: 0, y: 0 };
    const k = 180 / Math.max(1, cardW);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        rot.x.stopAnimation((v) => { start.x = wrap(v); rot.x.setValue(start.x); });
        rot.y.stopAnimation((v) => { start.y = wrap(v); rot.y.setValue(start.y); });
      },
      onPanResponderMove: (_, g) => {
        rot.x.setValue(start.x - g.dy * k);
        rot.y.setValue(start.y + g.dx * k);
      },
      // Lâchée : elle continue sur sa lancée, ralentit et reste dans la position atteinte.
      onPanResponderRelease: (_, g) => {
        Animated.parallel([
          Animated.decay(rot.x, { velocity: -g.vy * k, deceleration: 0.994, useNativeDriver: false }),
          Animated.decay(rot.y, { velocity: g.vx * k, deceleration: 0.994, useNativeDriver: false }),
        ]).start();
      },
    });
  }, [rot, cardW]);
  // Boutons : retourner (demi-tour) et remettre de face, en douceur.
  const turnTo = (toX, toY) => {
    rot.x.stopAnimation((vx) => {
      rot.y.stopAnimation((vy) => {
        rot.x.setValue(wrap(vx));
        rot.y.setValue(wrap(vy));
        Animated.parallel([
          Animated.spring(rot.x, { toValue: toX(wrap(vx)), useNativeDriver: false, friction: 7 }),
          Animated.spring(rot.y, { toValue: toY(wrap(vy)), useNativeDriver: false, friction: 7 }),
        ]).start();
      });
    });
  };
  const flip = () => turnTo((x) => Math.round(x / 180) * 180, (y) => Math.round(y / 180) * 180 + 180);
  const face = () => turnTo(() => 0, () => 0);

  const rotateX = rot.x.interpolate(DEG);
  const rotateY = rot.y.interpolate(DEG);
  // Inclinaison équivalente pour la brillance (même effet qu'avant : ±MAX_TILT), maximale de profil.
  const tilt = { x: rot.x.interpolate(zigzag(MAX_TILT)), y: rot.y.interpolate(zigzag(MAX_TILT)) };
  // Face tournée vers l'écran, calculée d'après l'orientation (Android ne cache pas la face arrière d'une vue placée
  // dans une vue qui tourne) : la normale de la carte pointe vers nous tant que cos(x) × cos(y) > 0.
  const [showBack, setShowBack] = useState(false);
  useEffect(() => {
    const angle = { x: 0, y: 0 };
    const update = () => {
      setShowBack(Math.cos((angle.x * Math.PI) / 180) * Math.cos((angle.y * Math.PI) / 180) < 0);
      foilTilt.current?.(Math.sin((angle.x * Math.PI) / 180), Math.sin((angle.y * Math.PI) / 180));
    };
    const ix = rot.x.addListener(({ value }) => { angle.x = value; update(); });
    const iy = rot.y.addListener(({ value }) => { angle.y = value; update(); });
    return () => { rot.x.removeListener(ix); rot.y.removeListener(iy); };
  }, [rot, foilTilt]);
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
        <Animated.View {...pan.panHandlers} style={{ width: cardW, height: cardH, transform: [{ perspective: 1100 }, { rotateX }, { rotateY }] }}>
        {/* Dos (ou seconde face), tourné d'un demi-tour derrière la face : visible une fois la carte retournée. */}
        <View style={[styles.card, styles.side, { width: cardW, height: cardH, opacity: showBack ? 1 : 0, transform: [{ rotateY: '180deg' }] }]}>
          {backSource ? (
            <Image
              source={backSource}
              style={StyleSheet.absoluteFill}
              contentFit={back.face ? 'contain' : 'cover'}
              // Dos intégrés à l'appli : jamais en cache disque (clé = n° de ressource, qui change d'une version de
              // l'appli à l'autre : l'ancien cache affichait le dos d'un autre jeu).
              cachePolicy={typeof backSource === 'number' ? 'memory' : 'disk'}
              onError={() => setBackFailed(true)}
            />
          ) : null}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {spot('glare', glare, -1.2, 1.1, 0, 0, 'glare-back')}
          </View>
        </View>
        <View style={[styles.card, styles.side, { width: cardW, height: cardH, opacity: showBack ? 0 : 1 }]}>
          <Image
            source={frontFailed || !back.front ? image : back.front}
            onError={() => setFrontFailed(true)}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onLoad={(e) => {
              const { width: w, height: h } = e.source || {};
              // Carte en largeur : le cadre prend sa forme (une carte en hauteur garde le format standard).
              if (w && h) setRatio(w > h ? h / w : RATIO);
            }}
          />
          {/* Finition et reflet calculés pixel par pixel (shader) à partir de l'image de la carte. */}
          <FoilCard
            uri={frontFailed || !back.front ? image : back.front}
            width={cardW}
            height={cardH}
            kind={SHADER_KIND[effectName] || 'none'}
            zone={effect.zone || 'none'}
            art={frame}
            onTilt={setFoilTilt}
            onLoad={onFoilLoad}
          />
          {/* Avant que le shader soit prêt (ou s'il n'est pas disponible) : anciennes taches de lumière. */}
          {!foilReady && zone.length ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: shine }]}>{zone}</Animated.View>
          ) : null}
          {!foilReady ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {spot('glare', glare, 1.2, 1.1, 0, 0, 'glare')}
            </View>
          ) : null}
        </View>
        </Animated.View>

        <Text style={styles.hint}>{t('Fais glisser la carte pour la tourner dans tous les sens')}</Text>
        <View style={styles.chips}>
          <Pressable onPress={flip} style={styles.chip} accessibilityLabel={t('Retourner la carte')}>
            <Text style={styles.chipText}><Ionicons name="sync" size={13} color="#fff" /> {t('Retourner')}</Text>
          </Pressable>
          <Pressable onPress={face} style={styles.chip}>
            <Text style={styles.chipText}><Ionicons name="scan-outline" size={13} color="#fff" /> {t('De face')}</Text>
          </Pressable>
        </View>
        {finishes.length > 1 ? (
          // Versions sur une ligne qui défile : une carte peut en avoir plus de dix (Yu-Gi-Oh!), elles restaient hors de l'écran.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.versionRow} contentContainerStyle={styles.versionList}>
            {finishes.map((f) => (
              <Pressable key={f} onPress={() => setFinish(f)} style={[styles.chip, f === finish && styles.chipActive]}>
                <Text style={[styles.chipText, f === finish && styles.chipTextActive]} numberOfLines={1}>{finishLabel(prices, f)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'rgba(5,6,10,0.96)', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 16 },
  close: { position: 'absolute', top: 48, right: 20, zIndex: 2 },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#111' },
  // Deux faces dos à dos ; celle qui est tournée vers l'écran est choisie d'après l'orientation (showBack).
  side: { position: 'absolute', left: 0, top: 0 },
  fill: { width: '100%', height: '100%' },
  hint: { color: colors.muted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 560 },
  versionRow: { flexGrow: 0, alignSelf: 'stretch' },
  versionList: { gap: 8, paddingHorizontal: 4, flexGrow: 1, justifyContent: 'center' },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#1A1A1A' },
});
