import { useMemo, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { getTcg, dataLang } from '../../../../../api';
import { useCollection, summarize } from '../../../../../lib/collection';
import { useCardLang } from '../../../../../lib/cardLang';
import { useAsync } from '../../../../../lib/useAsync';
import { formatPrice } from '../../../../../lib/prices';
import { colors, radius, percent } from '../../../../../lib/theme';
import { LangBadge, ProgressBar } from '../../../../../components/collection';
import { finishName } from '../../../../../lib/finishes';
import { Loading } from '../../../../../components/Status';
import { openItem } from '../../../../../lib/openItem';
import { versionKey } from '../../../../../lib/masterSet';
import { useSettings } from '../../../../../lib/settings';

const FILTERS = [
  ['owned', 'Possédées'],
  ['missing', 'Manquantes'],
  ['all', 'Toutes'],
];
const GAP = 10;
// « Cartes » : une par numéro. « Master set » : chaque version de chaque carte (normale, reverse, foil, motifs…).
const MODES = [
  ['cards', 'Cartes'],
  ['master', 'Master set'],
];

export default function CollectionSetScreen() {
  const { tcg: tcgId, setId, name } = useLocalSearchParams();
  const tcg = getTcg(tcgId);
  const { items } = useCollection();
  const { cardLang } = useCardLang();
  const mine = useMemo(() => items.filter((i) => i.tcg === tcgId && String(i.setId) === String(setId)), [items, tcgId, setId]);
  const lang = dataLang(tcg, mine[0]?.lang || cardLang);
  const s = useMemo(() => summarize(mine), [mine]);
  const [filter, setFilter] = useState('owned');
  const { settings } = useSettings();
  const [mode, setMode] = useState(settings.setView === 'master' ? 'master' : 'cards');
  const master = mode === 'master' && !!tcg.getVersions;
  // Liste complète de l'extension (pour les cartes manquantes et la complétion exacte).
  // Cartes personnelles : pas de catalogue complet (seulement les cartes possédées).
  const full = useAsync(() => (tcg.getCards ? tcg.getCards(setId, lang).catch(() => []) : Promise.resolve([])), [tcgId, setId, lang]);
  const { width } = useWindowDimensions();
  const tileWidth = (width - 32 - GAP * 2) / 3;

  const ownedById = useMemo(() => {
    const m = new Map();
    for (const i of mine) {
      const prev = m.get(i.cardId);
      m.set(i.cardId, { qty: (prev?.qty || 0) + i.qty, price: i.price ?? prev?.price, item: prev?.item || i });
    }
    return m;
  }, [mine]);

  const fullList = useMemo(() => full.data || [], [full.data]);
  // Même référence que l'écran du jeu : taille officielle de l'extension ; la liste complète peut contenir en plus
  // des cartes secrètes (numérotées au-delà du total officiel).
  const official = mine.find((i) => i.setCount)?.setCount || null;
  const setTotal = official || fullList.length || null;
  const extra = official && fullList.length > official ? fullList.length - official : 0;
  const distinct = ownedById.size;
  const cards = useMemo(() => {
    // Possédées : un exemplaire par langue et par version (une carte anglaise et la même en japonais sont distinctes).
    const ownedCards = mine.map((i) => ({
      id: i.cardId, key: i.key, name: i.name, number: i.number, image: i.image, qty: i.qty, price: i.price,
      lang: i.lang, finish: i.finish, label: i.finishName || (i.finish ? finishName(i.finish) : null),
    }));
    if (filter === 'owned' || !fullList.length) return ownedCards.sort((a, b) => String(a.number ?? '').localeCompare(String(b.number ?? ''), undefined, { numeric: true }));
    const all = fullList.map((c) => ({ ...c, qty: ownedById.get(c.id)?.qty || 0, price: ownedById.get(c.id)?.price }));
    return filter === 'missing' ? all.filter((c) => !c.qty) : all;
  }, [filter, fullList, ownedById, mine]);

  // Master set : toutes les versions de l'extension, chacune possédée ou non.
  const versions = useAsync(
    () => (master ? tcg.getVersions(setId, lang).catch(() => []) : Promise.resolve(null)),
    [tcgId, setId, lang, master],
  );
  const ownedByVersion = useMemo(() => {
    const m = new Map();
    for (const i of mine) {
      const k = versionKey(i.cardId, i.finish);
      const prev = m.get(k);
      m.set(k, { qty: (prev?.qty || 0) + i.qty, price: i.price ?? prev?.price, item: prev?.item || i });
    }
    return m;
  }, [mine]);
  const versionList = useMemo(() => (versions.data || []).map((v) => {
    const own = ownedByVersion.get(versionKey(v.id, v.finish));
    return { ...v, key: own?.item.key, lang: own?.item.lang, qty: own?.qty || 0, price: own?.price };
  }), [versions.data, ownedByVersion]);
  const masterOwned = versionList.filter((v) => v.qty).length;
  const shown = master
    ? (filter === 'owned' ? versionList.filter((v) => v.qty) : filter === 'missing' ? versionList.filter((v) => !v.qty) : versionList)
    : cards;

  return (
    <>
      <Stack.Screen options={{ title: name || setId }} />
      <FlatList
        data={shown}
        numColumns={3}
        key="grid"
        keyExtractor={(c, i) => `${c.id}-${c.finish || ''}-${i}`}
        contentContainerStyle={{ padding: 16, gap: GAP }}
        columnWrapperStyle={{ gap: GAP }}
        initialNumToRender={18}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={styles.hero}>
              <View style={styles.rowBetween}>
                <Text style={styles.heroValue}>{formatPrice(s.value, 'EUR')}</Text>
                <Text style={styles.heroCount}>{s.cards} exemplaire{s.cards > 1 ? 's' : ''}</Text>
              </View>
              {setTotal ? (
                <>
                  <ProgressBar value={distinct / setTotal} color={distinct >= setTotal ? colors.success : tcg.color} height={8} />
                  <Text style={styles.muted}>
                    {distinct}/{setTotal} cartes · {percent(Math.min(1, distinct / setTotal))} complétée
                    {setTotal > distinct ? ` · il en manque ${setTotal - distinct}` : ' · extension complète !'}
                  </Text>
                  {extra ? <Text style={styles.muted}>+ {extra} cartes secrètes ou spéciales hors numérotation</Text> : null}
                </>
              ) : (
                <Text style={styles.muted}>{distinct} carte{distinct > 1 ? 's' : ''} différente{distinct > 1 ? 's' : ''}</Text>
              )}
            </View>
            {tcg.getVersions ? (
              <View style={styles.chips}>
                {MODES.map(([k, label]) => (
                  <Pressable key={k} onPress={() => setMode(k)} style={[styles.chip, mode === k && styles.chipActive]}>
                    <Text style={[styles.chipText, mode === k && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {master && versionList.length ? (
              <View style={styles.hero}>
                <ProgressBar value={masterOwned / versionList.length} color={masterOwned >= versionList.length ? colors.success : tcg.color} height={8} />
                <Text style={styles.muted}>
                  Master set : {masterOwned}/{versionList.length} versions · {percent(masterOwned / versionList.length)}
                  {versionList.length > masterOwned ? ` · il en manque ${versionList.length - masterOwned}` : ' · master set complet !'}
                </Text>
              </View>
            ) : null}
            <View style={styles.chips}>
              {FILTERS.map(([k, label]) => (
                <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipActive]}>
                  <Text style={[styles.chipText, filter === k && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {(master ? versions.loading : filter !== 'owned' && full.loading) ? <Loading text="Chargement de l'extension…" /> : null}
          </View>
        }
        renderItem={({ item: c }) => (
          <Pressable
            style={({ pressed }) => [{ width: tileWidth }, pressed && { opacity: 0.7 }]}
            onPress={() => (c.key ? openItem({ ...c, tcg: tcgId, cardId: c.id, setId }) : router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: tcgId, cardId: c.id, setId, finish: c.finish ?? '' } }))}
          >
            <View style={[styles.imgBox, !c.qty && { opacity: 0.35 }]}>
              {c.image ? <Image source={c.image} style={{ width: '100%', height: '100%' }} contentFit="cover" recyclingKey={c.id} /> : null}
              {c.qty ? <Text style={styles.qty}>×{c.qty}</Text> : null}
              {c.key && c.lang && tcgId !== 'custom' ? <LangBadge lang={c.lang} /> : null}
            </View>
            <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
            {c.label ? <Text style={styles.version} numberOfLines={2}>{c.label}</Text> : null}
            <Text style={styles.meta} numberOfLines={1}>
              {[c.number && `#${c.number}`, c.qty && c.price != null ? formatPrice(c.price, 'EUR') : null].filter(Boolean).join(' · ')}
            </Text>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.surfaceAlt, borderRadius: radius, padding: 14, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroValue: { color: colors.accent, fontSize: 26, fontWeight: '800' },
  heroCount: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 13 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#1A1A1A' },
  imgBox: { aspectRatio: 63 / 88, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  qty: { position: 'absolute', top: 5, right: 5, backgroundColor: colors.success, color: '#0B2A1C', fontWeight: '800', fontSize: 12, borderRadius: 10, paddingHorizontal: 6, overflow: 'hidden' },
  name: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 4 },
  meta: { color: colors.muted, fontSize: 11 },
  version: { color: colors.accent, fontSize: 11, fontWeight: '600' },
});
