import { useRef, useState } from 'react';
import { router, useIsFocused } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getTcg } from '../../api';
import { identify } from '../../lib/scan';
import { nameCandidates } from '../../lib/scanDetect';
import { useCardLang, LANG_NAMES } from '../../lib/cardLang';
import { useCollection, ownedQty } from '../../lib/collection';
import { useAsync } from '../../lib/useAsync';
import { averagePrice, formatPrice, getUsdToEur } from '../../lib/prices';
import { colors, radius } from '../../lib/theme';
import { useFinishChoice } from '../../components/collection';
import { useSettings } from '../../lib/settings';
import { finishLabel, storedFinish } from '../../lib/finishes';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const camera = useRef(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [state, setState] = useState({ step: 'camera' }); // camera | analyzing | result
  const { cardLang } = useCardLang();

  // Lecture du texte (OCR sur le téléphone) puis identification de la carte.
  const analyze = async (getUri) => {
    setState({ step: 'analyzing' });
    try {
      const uri = await getUri();
      if (!uri) return setState({ step: 'camera' });
      const ocr = await recognizeText(uri);
      const result = await identify(ocr?.text || '', cardLang);
      setState({ step: 'result', photo: uri, text: ocr?.text || '', ...result, selected: 0 });
    } catch (e) {
      setState({ step: 'result', error: e?.message || String(e), candidates: [], detections: [] });
    }
  };
  const scan = () => ready && camera.current && analyze(async () => (await camera.current.takePictureAsync({ quality: 0.9, shutterSound: false })).uri);

  if (!permission) return <View style={styles.page} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={56} color={colors.muted} />
        <Text style={styles.title}>Scanner une carte</Text>
        <Text style={styles.muted}>
          L’appareil photo sert à lire le code imprimé sur la carte (en bas). La photo reste sur ton téléphone.
        </Text>
        <Pressable style={styles.primary} onPress={requestPermission}>
          <Text style={styles.primaryText}>Autoriser l’appareil photo</Text>
        </Pressable>
      </View>
    );
  }

  if (state.step === 'result') return <Result state={state} setState={setState} onRetry={() => setState({ step: 'camera' })} />;

  return (
    <View style={styles.page}>
      {focused ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          onCameraReady={() => setReady(true)}
        />
      ) : null}
      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.hint}>Cadre la carte entière, bien éclairée.{'\n'}Le code en bas (ex. OP09-119, 004/084) doit être net.{'\n'}Cartes en {LANG_NAMES[cardLang]?.toLowerCase()}.</Text>
        <View style={styles.frame} pointerEvents="none">
          <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 }]} />
          <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 }]} />
          <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 }]} />
          <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 }]} />
        </View>
        <View style={styles.controls}>
          <Pressable style={styles.sideBtn} onPress={() => setTorch((t) => !t)}>
            <Ionicons name={torch ? 'flash' : 'flash-off'} size={24} color={colors.text} />
          </Pressable>
          <Pressable style={[styles.shutter, (!ready || state.step === 'analyzing') && { opacity: 0.5 }]} onPress={scan} disabled={!ready || state.step === 'analyzing'}>
            {state.step === 'analyzing' ? <ActivityIndicator color="#1A1A1A" /> : <Ionicons name="scan" size={34} color="#1A1A1A" />}
          </Pressable>
          {/* Reconnaissance uniquement avec l'appareil photo : espace vide pour centrer le déclencheur. */}
          <View style={[styles.sideBtn, { backgroundColor: 'transparent' }]} />
        </View>
        {state.step === 'analyzing' ? <Text style={styles.analyzing}>Lecture de la carte…</Text> : null}
      </View>
    </View>
  );
}

// Toujours visible en haut du résultat (le bouton du bas demande de faire défiler).
function NewScanButton({ onPress }) {
  return (
    <Pressable style={styles.newScan} onPress={onPress} hitSlop={8}>
      <Ionicons name="scan" size={18} color={colors.accent} />
      <Text style={styles.newScanText}>Nouveau scan</Text>
    </Pressable>
  );
}

function Result({ state, setState, onRetry }) {
  const { candidates = [], selected = 0 } = state;
  const best = candidates[selected];
  if (!best) {
    return (
      <ScrollView contentContainerStyle={styles.resultPage}>
        <NewScanButton onPress={onRetry} />
        <Ionicons name="help-circle-outline" size={56} color={colors.muted} style={{ alignSelf: 'center' }} />
        <Text style={styles.title}>Carte non reconnue</Text>
        <Text style={styles.muted}>
          {state.error
            ? `Erreur : ${state.error}`
            : 'Aucun code de carte lisible. Rapproche-toi, évite les reflets (sleeve brillante) et vérifie que le bas de la carte est net.'}
        </Text>
        {state.text ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Texte lu</Text>
            <Text style={styles.muted} numberOfLines={8}>{state.text}</Text>
          </View>
        ) : null}
        <Pressable style={styles.primary} onPress={onRetry}>
          <Ionicons name="scan" size={18} color="#1A1A1A" />
          <Text style={styles.primaryText}>Réessayer</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.navigate('/(tabs)/(explore)')}>
          <Text style={styles.secondaryText}>Chercher à la main</Text>
        </Pressable>
        {/* Carte hors catalogue : saisie manuelle (rangée dans « Autres ») avec la photo et le nom lus. */}
        <Pressable
          style={styles.secondary}
          onPress={() => router.push({
            pathname: '/(tabs)/(owned)/collection/custom',
            params: { photo: state.photo ?? '', name: nameCandidates((state.text || '').split('\n'))[0] ?? '' },
          })}
        >
          <Text style={styles.secondaryText}>L’ajouter à la main (dans « Autres »)</Text>
        </Pressable>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.resultPage}>
      <NewScanButton onPress={onRetry} />
      <ScannedCard key={`${best.tcgId}|${best.id}|${best.lang}`} c={best} />
      {candidates.length > 1 ? (
        <>
          <Text style={styles.section}>Pas la bonne version ? ({candidates.length} possibilités)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {candidates.map((c, i) => (
              <Pressable key={`${c.tcgId}|${c.id}|${c.lang}`} onPress={() => setState({ ...state, selected: i })} style={[styles.alt, i === selected && styles.altActive]}>
                {c.image ? <Image source={c.image} style={styles.altImg} contentFit="cover" /> : <View style={styles.altImg} />}
                <Text style={styles.altName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.altMeta} numberOfLines={1}>{getTcg(c.tcgId)?.name} · {c.number}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
      <Pressable style={styles.primary} onPress={onRetry}>
        <Ionicons name="scan" size={18} color="#1A1A1A" />
        <Text style={styles.primaryText}>Scanner une autre carte</Text>
      </Pressable>
    </ScrollView>
  );
}

// Carte reconnue : image, prix moyen et ajout direct à la collection.
function ScannedCard({ c }) {
  const tcg = getTcg(c.tcgId);
  const { items, add } = useCollection();
  const info = useAsync(async () => {
    const [card, fx] = await Promise.all([tcg.getCard(c.id, c.setId, c.lang), getUsdToEur()]);
    return { card, fx };
  }, [c.tcgId, c.id, c.setId, c.lang]);
  // Version de l'exemplaire scanné (foil, reverse…) : demandée à l'ajout, le prix en dépend.
  const [finish, setFinish] = useState(null);
  const { ask, chooser } = useFinishChoice();
  const chosen = info.data ? storedFinish(info.data.card.prices, finish) : null;
  const { priceSource } = useSettings().settings;
  const avg = info.data ? averagePrice(info.data.card.prices, info.data.fx, { finish: chosen, source: priceSource }) : null;
  const owned = ownedQty(items, c.tcgId, c.id, c.lang);
  const card = info.data?.card;
  const image = card?.image || c.image;

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.badgeRow}>
        <Text style={[styles.badge, { backgroundColor: tcg.color }]}>{tcg.name}</Text>
        <Text style={styles.badgeOutline}>{c.lang.toUpperCase()}</Text>
        <Text style={styles.why} numberOfLines={1}>{c.why.startsWith('nom') ? `Reconnue par le ${c.why}` : `Code lu : ${c.why}`}</Text>
      </View>
      {c.why.startsWith('nom') ? (
        <Text style={styles.nameOnly}>
          ⚠ Code de la carte illisible : reconnue par son nom. Vérifie la version (édition, version alternative) dans les choix plus bas, le prix peut beaucoup varier.
        </Text>
      ) : null}
      {image ? <Image source={image} style={styles.cardImg} contentFit="contain" transition={150} /> : null}
      <Text style={styles.cardName}>{card?.name || c.name}</Text>
      <Text style={styles.mutedCenter}>{[c.setName || card?.setName || c.setId, c.number].filter(Boolean).join(' · ')}</Text>
      {chooser}
      <View style={styles.priceBox}>
        {info.loading ? <ActivityIndicator color={colors.accent} /> : (
          <>
            <Text style={styles.priceLabel}>Prix moyen{chosen ? ` · ${finishLabel(card.prices, chosen)}` : ''}</Text>
            <Text style={styles.priceValue}>{avg ? formatPrice(avg.value, 'EUR') : '—'}</Text>
            {avg ? <Text style={styles.mutedCenter}>Moyenne de {avg.sources.join(' + ')}</Text> : null}
          </>
        )}
      </View>
      <Pressable
        style={styles.primary}
        onPress={() => ask(card?.name || c.name, card?.prices || [], (picked, price, label) => {
          setFinish(picked);
          add(c.tcgId, c.lang, c.setId, { id: c.id, name: card?.name || c.name, number: c.number, image, setName: c.setName || card?.setName, price: price ?? avg?.value ?? null, finish: picked, finishName: label }, 1);
        })}
      >
        <Ionicons name={owned ? 'add-circle' : 'albums'} size={20} color="#1A1A1A" />
        <Text style={styles.primaryText}>{owned ? `Ajouter un exemplaire (j'en ai ${owned})` : 'Ajouter à ma collection'}</Text>
      </Pressable>
      <Pressable
        style={styles.secondary}
        onPress={() => router.push({ pathname: '/(tabs)/(explore)/[tcg]/card/[cardId]', params: { tcg: c.tcgId, cardId: c.id, setId: c.setId ?? '' } })}
      >
        <Text style={styles.secondaryText}>Voir la fiche complète</Text>
      </Pressable>
    </View>
  );
}

const FRAME_W = 260;
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 24 },
  hint: { color: '#fff', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, fontSize: 13, marginHorizontal: 16 },
  frame: { width: FRAME_W, height: FRAME_W * (88 / 63) },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: colors.accent, borderRadius: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 40 },
  sideBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff' },
  analyzing: { color: '#fff', marginTop: 8, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  muted: { color: colors.muted, lineHeight: 20, textAlign: 'center' },
  mutedCenter: { color: colors.muted, textAlign: 'center', fontSize: 13 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, paddingHorizontal: 18 },
  primaryText: { color: '#1A1A1A', fontWeight: '800', fontSize: 15 },
  secondary: { alignItems: 'center', borderRadius: radius, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '700' },
  newScan: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  newScanText: { color: colors.accent, fontWeight: '700' },
  resultPage: { padding: 16, gap: 14, backgroundColor: colors.bg, flexGrow: 1 },
  box: { backgroundColor: colors.surface, borderRadius: radius, padding: 12, gap: 6 },
  boxTitle: { color: colors.text, fontWeight: '700' },
  section: { color: colors.text, fontWeight: '700', fontSize: 16 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { color: '#fff', fontWeight: '800', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  badgeOutline: { color: colors.muted, fontWeight: '700', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  why: { color: colors.muted, fontSize: 12, flex: 1 },
  nameOnly: { color: colors.accent, fontSize: 13, lineHeight: 18, backgroundColor: colors.surface, borderRadius: 10, padding: 10 },
  cardImg: { width: '70%', aspectRatio: 63 / 88, alignSelf: 'center', borderRadius: 10 },
  cardName: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  priceBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius, padding: 14, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: colors.accent, minHeight: 70, justifyContent: 'center' },
  priceLabel: { color: colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  priceValue: { color: colors.accent, fontSize: 28, fontWeight: '800' },
  alt: { width: 92, gap: 3, padding: 4, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  altActive: { borderColor: colors.accent },
  altImg: { width: '100%', aspectRatio: 63 / 88, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  altName: { color: colors.text, fontSize: 11, fontWeight: '600' },
  altMeta: { color: colors.muted, fontSize: 10 },
});
