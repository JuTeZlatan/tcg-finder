import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useIsFocused } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getTcg } from '../../api';
import { identify } from '../../lib/scan';
import { discard, readCard } from '../../lib/scanImage';
import { nameCandidates } from '../../lib/scanDetect';
import { useCardLang, LANG_NAMES } from '../../lib/cardLang';
import { useCollection, ownedQty } from '../../lib/collection';
import { useAsync } from '../../lib/useAsync';
import { averagePrice, formatPrice, getUsdToEur } from '../../lib/prices';
import { colors, radius } from '../../lib/theme';
import { useFinishChoice } from '../../components/collection';
import { useSettings } from '../../lib/settings';
import { finishLabel, storedFinish } from '../../lib/finishes';
import { plural, t } from '../../lib/i18n';

// Rafale automatique : une image toutes les ~0,7 s ; une carte est ajoutée quand son code est lu nettement (score
// ≥ 0,95) ou quand deux images de suite donnent la même carte. Elle n'est pas ajoutée deux fois tant qu'elle reste
// devant l'appareil photo (retirer la carte puis la représenter permet d'en compter un 2e exemplaire).
const SURE_SCORE = 0.95;
const AUTO_PAUSE = 700;
const candKey = (c) => `${c.tcgId}|${c.lang}|${c.id}`;

export default function ScanScreen() {
  useSettings(); // réaffiche les prix quand la devise (ou le taux du jour) change
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const camera = useRef(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [state, setState] = useState({ step: 'camera' }); // camera | analyzing | result | batch
  const { cardLang } = useCardLang();
  // Scan en rafale : chaque carte lue rejoint une liste, vérifiée puis ajoutée d'un coup.
  const [mode, setMode] = useState('single'); // single | batch
  const [batch, setBatch] = useState([]);
  const [auto, setAuto] = useState(true); // rafale : lecture automatique en continu (pause possible)
  const [lastAdded, setLastAdded] = useState(null); // bande du bas : dernière carte ajoutée
  // Position de l'aperçu et du cadre à l'écran : la photo est recadrée sur la carte avant la lecture.
  const layout = useRef({ view: null, frame: null });
  const photoText = async (quality) => {
    const photo = await camera.current.takePictureAsync({ quality, shutterSound: false });
    return { photo, text: await readCard(photo, layout.current.view, layout.current.frame) };
  };

  // Mode une carte : photo au toucher du déclencheur, puis résultat détaillé.
  const scan = async () => {
    if (!ready || !camera.current) return;
    setState({ step: 'analyzing' });
    try {
      const { photo, text } = await photoText(0.9);
      const result = await identify(text, cardLang);
      setState({ step: 'result', photo: photo.uri, text, ...result, selected: 0 });
    } catch (e) {
      setState({ step: 'result', error: e?.message || String(e), candidates: [], detections: [] });
    }
  };

  // Rafale : boucle de lecture tant que l'écran est affiché.
  const memory = useRef({ pending: null, present: null, empty: 0 });
  const running = mode === 'batch' && auto && focused && ready && state.step === 'camera';
  useEffect(() => {
    if (!running) return undefined;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const { photo, text } = await photoText(0.7);
          discard(photo.uri);
          if (stop) break;
          const { candidates = [] } = await identify(text, cardLang);
          const best = candidates[0];
          const m = memory.current;
          if (!best) {
            // carte retirée (deux images vides) : la même carte pourra être ajoutée à nouveau
            m.empty += 1;
            if (m.empty >= 2) Object.assign(m, { pending: null, present: null });
          } else {
            m.empty = 0;
            const key = candKey(best);
            const sure = best.score >= SURE_SCORE || m.pending === key;
            m.pending = key;
            if (sure && m.present !== key) {
              m.present = key;
              const row = { key: `${Date.now()}`, candidates, selected: 0, finish: null, finishName: null, price: null };
              setBatch((b) => [...b, row]);
              setLastAdded({ ...best, rowKey: row.key, at: Date.now() });
            }
          }
        } catch {
          // image illisible : on continue
        }
        await new Promise((r) => setTimeout(r, AUTO_PAUSE));
      }
    })();
    return () => {
      stop = true;
    };
  }, [running, cardLang]);

  if (!permission) return <View style={styles.page} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={56} color={colors.muted} />
        <Text style={styles.title}>{t('Scanner une carte')}</Text>
        <Text style={styles.muted}>
          {t('L’appareil photo sert à lire le code imprimé sur la carte (en bas). La photo reste sur ton téléphone.')}
        </Text>
        <Pressable style={styles.primary} onPress={requestPermission}>
          <Text style={styles.primaryText}>{t('Autoriser l’appareil photo')}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.step === 'result') return <Result state={state} setState={setState} onRetry={() => setState({ step: 'camera' })} />;
  if (state.step === 'batch') {
    return <BatchReview batch={batch} setBatch={setBatch} onBack={() => setState({ step: 'camera' })} onDone={() => { setBatch([]); setLastAdded(null); setState({ step: 'camera' }); }} />;
  }

  const batchMode = mode === 'batch';
  return (
    <View style={styles.page} onLayout={(e) => { layout.current.view = e.nativeEvent.layout; }}>
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
        <View style={styles.modeRow}>
          {[['single', t('Une carte')], ['batch', t('En rafale')]].map(([k, label]) => (
            <Pressable key={k} style={[styles.modeChip, mode === k && styles.modeChipActive]} onPress={() => setMode(k)}>
              <Text style={[styles.modeText, mode === k && styles.modeTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          {batchMode ? t('Présente les cartes une par une dans le cadre : elles sont lues et ajoutées toutes seules.') : t('Cadre la carte entière, bien éclairée.')}
          {'\n'}{t('Le code en bas (ex. OP09-119, 004/084) doit être net.')}{'\n'}{t('Langue des cartes')} : {t(LANG_NAMES[cardLang])}.
        </Text>
        <View style={styles.frame} pointerEvents="none" onLayout={(e) => { layout.current.frame = e.nativeEvent.layout; }}>
          <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 }]} />
          <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 }]} />
          <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 }]} />
          <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 }]} />
        </View>
        <View style={{ width: '100%', gap: 10 }}>
          {batchMode && lastAdded ? <LastScanned card={lastAdded} count={batch.length} onPress={() => setState({ step: 'batch' })} /> : null}
          <View style={styles.controls}>
            <Pressable style={styles.sideBtn} onPress={() => setTorch((tg) => !tg)}>
              <Ionicons name={torch ? 'flash' : 'flash-off'} size={24} color={colors.text} />
            </Pressable>
            {batchMode ? (
              // Rafale : le bouton met en pause / relance la lecture automatique.
              <Pressable style={[styles.shutter, !ready && { opacity: 0.5 }]} onPress={() => setAuto((a) => !a)} disabled={!ready} accessibilityLabel={auto ? t('Pause') : t('Reprendre')}>
                <Ionicons name={auto ? 'pause' : 'play'} size={34} color="#1A1A1A" />
              </Pressable>
            ) : (
              <Pressable style={[styles.shutter, (!ready || state.step === 'analyzing') && { opacity: 0.5 }]} onPress={scan} disabled={!ready || state.step === 'analyzing'}>
                {state.step === 'analyzing' ? <ActivityIndicator color="#1A1A1A" /> : <Ionicons name="scan" size={34} color="#1A1A1A" />}
              </Pressable>
            )}
            {batchMode ? (
              <Pressable style={[styles.sideBtn, styles.listBtn]} onPress={() => setState({ step: 'batch' })} accessibilityLabel={t('Liste des cartes scannées')}>
                <Ionicons name="list" size={22} color="#1A1A1A" />
                <Text style={styles.listCount}>{batch.length}</Text>
              </Pressable>
            ) : (
              // Mode une carte : espace vide pour centrer le déclencheur.
              <View style={[styles.sideBtn, { backgroundColor: 'transparent' }]} />
            )}
          </View>
          {state.step === 'analyzing' ? <Text style={styles.analyzing}>{t('Lecture de la carte…')}</Text> : null}
          {batchMode ? <Text style={styles.analyzing}>{auto ? t('Lecture automatique en cours…') : t('Lecture en pause')}</Text> : null}
        </View>
      </View>
    </View>
  );
}

// Rafale : bande en bas de l'écran avec la dernière carte ajoutée (image, nom, prix, langue).
function LastScanned({ card, count, onPress }) {
  const tcg = getTcg(card.tcgId);
  const { priceSource } = useSettings().settings;
  const info = useAsync(async () => {
    const [full, fx] = await Promise.all([tcg.getCard(card.id, card.setId, card.lang), getUsdToEur()]);
    return averagePrice(full.prices, fx, { source: priceSource });
  }, [card.tcgId, card.id, card.setId, card.lang, priceSource]);
  return (
    <Pressable style={styles.strip} onPress={onPress}>
      {card.image ? <Image source={card.image} style={styles.stripImg} contentFit="cover" /> : <View style={styles.stripImg} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.stripName} numberOfLines={1}>✓ {card.name}</Text>
        <Text style={styles.stripMeta} numberOfLines={1}>{tcg?.name} · {card.number}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.stripPrice}>{info.loading ? '…' : info.data ? formatPrice(info.data.value, 'EUR') : '—'}</Text>
        <Text style={styles.stripLang}>{card.lang.toUpperCase()}</Text>
      </View>
      <Text style={styles.stripCount}>{count}</Text>
    </Pressable>
  );
}

// Toujours visible en haut du résultat (le bouton du bas demande de faire défiler).
function NewScanButton({ onPress }) {
  return (
    <Pressable style={styles.newScan} onPress={onPress} hitSlop={8}>
      <Ionicons name="scan" size={18} color={colors.accent} />
      <Text style={styles.newScanText}>{t('Nouveau scan')}</Text>
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
        <Text style={styles.title}>{t('Carte non reconnue')}</Text>
        <Text style={styles.muted}>
          {state.error
            ? t('Erreur : {0}', { 0: state.error })
            : t('Aucun code de carte lisible. Rapproche-toi, évite les reflets (sleeve brillante) et vérifie que le bas de la carte est net.')}
        </Text>
        {state.text ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>{t('Texte lu')}</Text>
            <Text style={styles.muted} numberOfLines={8}>{state.text}</Text>
          </View>
        ) : null}
        <Pressable style={styles.primary} onPress={onRetry}>
          <Ionicons name="scan" size={18} color="#1A1A1A" />
          <Text style={styles.primaryText}>{t('Réessayer')}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.navigate('/(tabs)/(explore)')}>
          <Text style={styles.secondaryText}>{t('Chercher à la main')}</Text>
        </Pressable>
        {/* Carte hors catalogue : saisie manuelle (rangée dans « Autres ») avec la photo et le nom lus. */}
        <Pressable
          style={styles.secondary}
          onPress={() => router.push({
            pathname: '/(tabs)/(owned)/collection/custom',
            params: { photo: state.photo ?? '', name: nameCandidates((state.text || '').split('\n'))[0] ?? '' },
          })}
        >
          <Text style={styles.secondaryText}>{t('L’ajouter à la main (dans « Autres »)')}</Text>
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
          <Text style={styles.section}>{t('Pas la bonne version ? ({n} possibilités)', { n: candidates.length })}</Text>
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
        <Text style={styles.primaryText}>{t('Scanner une autre carte')}</Text>
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
        <Text style={styles.why} numberOfLines={1}>{c.why.startsWith('nom') ? t('Reconnue par son nom') : t('Code lu : {0}', { 0: c.why })}</Text>
      </View>
      {c.why.startsWith('nom') ? (
        <Text style={styles.nameOnly}>
          {t('⚠ Code de la carte illisible : reconnue par son nom. Vérifie la version (édition, version alternative) dans les choix plus bas, le prix peut beaucoup varier.')}
        </Text>
      ) : null}
      {image ? <Image source={image} style={styles.cardImg} contentFit="contain" transition={150} /> : null}
      <Text style={styles.cardName}>{card?.name || c.name}</Text>
      <Text style={styles.mutedCenter}>{[c.setName || card?.setName || c.setId, c.number].filter(Boolean).join(' · ')}</Text>
      {chooser}
      <View style={styles.priceBox}>
        {info.loading ? <ActivityIndicator color={colors.accent} /> : (
          <>
            <Text style={styles.priceLabel}>{t('Prix moyen')}{chosen ? ` · ${finishLabel(card.prices, chosen)}` : ''}</Text>
            <Text style={styles.priceValue}>{avg ? formatPrice(avg.value, 'EUR') : '—'}</Text>
            {avg ? <Text style={styles.mutedCenter}>{t('Moyenne de {sources}', { sources: avg.sources.join(' + ') })}</Text> : null}
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
        <Text style={styles.primaryText}>{owned ? t('Ajouter un exemplaire (j\'en ai {0})', { 0: owned }) : t('Ajouter à ma collection')}</Text>
      </Pressable>
      <Pressable
        style={styles.secondary}
        onPress={() => router.push({ pathname: '/(tabs)/(explore)/[tcg]/card/[cardId]', params: { tcg: c.tcgId, cardId: c.id, setId: c.setId ?? '' } })}
      >
        <Text style={styles.secondaryText}>{t('Voir la fiche complète')}</Text>
      </Pressable>
    </View>
  );
}

// Rafale : vérification des cartes scannées (bonne carte, version) puis ajout de toutes d'un coup.
function BatchReview({ batch, setBatch, onBack, onDone }) {
  const { add } = useCollection();
  const [done, setDone] = useState(0);
  const patch = useCallback((key, p) => setBatch((b) => b.map((r) => (r.key === key ? { ...r, ...p } : r))), [setBatch]);
  const addAll = () => {
    for (const r of batch) {
      const c = r.candidates[r.selected];
      add(c.tcgId, c.lang, c.setId, { id: c.id, name: r.name || c.name, number: c.number, image: r.image || c.image, setName: c.setName, price: r.price, finish: r.finish, finishName: r.finishName }, 1);
    }
    setDone(batch.length);
  };
  if (done) {
    return (
      <View style={styles.center}>
        <Ionicons name="checkmark-circle" size={64} color={colors.success} />
        <Text style={styles.title}>{plural(done, '{n} carte ajoutée à ta collection', '{n} cartes ajoutées à ta collection')}</Text>
        <Pressable style={styles.primary} onPress={onDone}>
          <Ionicons name="scan" size={18} color="#1A1A1A" />
          <Text style={styles.primaryText}>{t('Nouvelle rafale')}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.navigate('/(tabs)/(owned)')}>
          <Text style={[styles.secondaryText, { paddingHorizontal: 18 }]}>{t('Voir ma collection')}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.resultPage}>
      <Pressable style={styles.newScan} onPress={onBack} hitSlop={8}>
        <Ionicons name="scan" size={18} color={colors.accent} />
        <Text style={styles.newScanText}>{t('Continuer à scanner')}</Text>
      </Pressable>
      <Text style={styles.title}>{plural(batch.length, '{n} carte scannée', '{n} cartes scannées')}</Text>
      {!batch.length ? <Text style={styles.muted}>{t('Scanne des cartes : elles s’ajoutent ici, tu les vérifies puis tu les ajoutes toutes d’un coup.')}</Text> : null}
      {batch.map((r) => <BatchRow key={r.key} row={r} onChange={patch} onRemove={() => setBatch((b) => b.filter((x) => x.key !== r.key))} />)}
      {batch.length ? (
        <Pressable style={styles.primary} onPress={addAll}>
          <Ionicons name="albums" size={20} color="#1A1A1A" />
          <Text style={styles.primaryText}>{plural(batch.length, 'Ajouter {n} carte à ma collection', 'Ajouter les {n} cartes à ma collection')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function BatchRow({ row, onChange, onRemove }) {
  const c = row.candidates[row.selected];
  const tcg = getTcg(c.tcgId);
  const info = useAsync(async () => {
    const [card, fx] = await Promise.all([tcg.getCard(c.id, c.setId, c.lang), getUsdToEur()]);
    return { card, fx };
  }, [c.tcgId, c.id, c.setId, c.lang]);
  const { priceSource } = useSettings().settings;
  const { ask, chooser } = useFinishChoice();
  const card = info.data?.card;
  const avg = card ? averagePrice(card.prices, info.data.fx, { finish: row.finish, source: priceSource }) : null;
  // Prix, nom et image de la carte choisie, gardés pour l'ajout final.
  const price = avg?.value ?? null;
  const needsSync = !!card && (row.price !== price || row.name !== card.name);
  useEffect(() => {
    if (needsSync) onChange(row.key, { price, name: card.name, image: card.image || c.image });
  }, [needsSync, price, card, c.image, onChange, row.key]);
  const chooseVersion = () => card && ask(card.name, card.prices || [], (picked, p, label) => onChange(row.key, { finish: picked, finishName: label, price: p ?? price }));
  const other = (step) => onChange(row.key, { selected: (row.selected + step + row.candidates.length) % row.candidates.length, finish: null, finishName: null, price: null, name: null, image: null });
  return (
    <View style={styles.batchRow}>
      {chooser}
      {card?.image || c.image ? <Image source={card?.image || c.image} style={styles.batchImg} contentFit="cover" /> : <View style={styles.batchImg} />}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.batchName} numberOfLines={2}>{card?.name || c.name}</Text>
        <Text style={styles.altMeta} numberOfLines={1}>{tcg?.name} · {c.number} · {c.lang.toUpperCase()}</Text>
        <Pressable onPress={chooseVersion} hitSlop={6}>
          <Text style={styles.batchLink}>{row.finishName || (card ? finishLabel(card.prices, storedFinish(card.prices, null)) || t('Version') : t('Version'))} ▾</Text>
        </Pressable>
        {row.candidates.length > 1 ? (
          <View style={styles.badgeRow}>
            <Pressable onPress={() => other(-1)} hitSlop={6}><Ionicons name="chevron-back" size={18} color={colors.accent} /></Pressable>
            <Text style={styles.altMeta}>{t('Possibilité {i}/{n}', { i: row.selected + 1, n: row.candidates.length })}</Text>
            <Pressable onPress={() => other(1)} hitSlop={6}><Ionicons name="chevron-forward" size={18} color={colors.accent} /></Pressable>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <Text style={styles.batchPrice}>{info.loading ? '…' : price != null ? formatPrice(price, 'EUR') : '—'}</Text>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={t('Retirer')}>
          <Ionicons name="close-circle" size={22} color={colors.muted} />
        </Pressable>
      </View>
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
  modeRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, padding: 3, marginBottom: 8 },
  modeChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
  modeChipActive: { backgroundColor: colors.accent },
  modeText: { color: '#fff', fontWeight: '700' },
  modeTextActive: { color: '#1A1A1A' },
  listBtn: { backgroundColor: colors.accent },
  listCount: { position: 'absolute', top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', color: '#1A1A1A', fontWeight: '800', fontSize: 12, textAlign: 'center', lineHeight: 22, overflow: 'hidden' },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius, padding: 10 },
  batchImg: { width: 56, aspectRatio: 63 / 88, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  batchName: { color: colors.text, fontWeight: '700' },
  batchLink: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  batchPrice: { color: colors.accent, fontWeight: '800' },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, padding: 8, borderRadius: radius, backgroundColor: 'rgba(15,17,21,0.92)', borderWidth: 1, borderColor: colors.success },
  stripImg: { width: 40, aspectRatio: 63 / 88, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  stripName: { color: colors.text, fontWeight: '700' },
  stripMeta: { color: colors.muted, fontSize: 12 },
  stripPrice: { color: colors.accent, fontWeight: '800' },
  stripLang: { color: colors.muted, fontWeight: '700', fontSize: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 5 },
  stripCount: { color: '#1A1A1A', backgroundColor: colors.success, fontWeight: '800', minWidth: 24, height: 24, lineHeight: 24, textAlign: 'center', borderRadius: 12, overflow: 'hidden' },
});
