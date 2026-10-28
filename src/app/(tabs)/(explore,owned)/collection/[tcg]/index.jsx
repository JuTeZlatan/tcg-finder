import { useMemo, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTcg } from '../../../../../api';
import { useCollection, summarize, setsSummary } from '../../../../../lib/collection';
import { formatPrice } from '../../../../../lib/prices';
import { colors, radius, percent } from '../../../../../lib/theme';
import { StatTile, ProgressBar } from '../../../../../components/collection';
import { useSettings } from '../../../../../lib/settings';
import { plural, t } from '../../../../../lib/i18n';

const SORTS = [
  ['value', 'Valeur'],
  ['completion', 'Complétion'],
  ['recent', 'Récentes'],
  ['name', 'Nom'],
];

export default function CollectionTcgScreen() {
  useSettings(); // réaffiche les prix quand la devise (ou le taux du jour) change
  const { tcg: tcgId } = useLocalSearchParams();
  const tcg = getTcg(tcgId);
  const { items } = useCollection();
  const [sort, setSort] = useState('value');
  const mine = useMemo(() => items.filter((i) => i.tcg === tcgId), [items, tcgId]);
  const total = useMemo(() => summarize(mine), [mine]);
  const sets = useMemo(() => {
    const list = setsSummary(mine);
    const by = {
      value: (a, b) => b.value - a.value,
      completion: (a, b) => (b.completion ?? -1) - (a.completion ?? -1),
      recent: (a, b) => b.lastAdded - a.lastAdded,
      name: (a, b) => a.setName.localeCompare(b.setName),
    }[sort];
    return list.sort(by);
  }, [mine, sort]);
  const complete = sets.filter((s) => s.completion === 1).length;

  return (
    <>
      <Stack.Screen options={{ title: t('Ma collection · {0}', { 0: tcg ? t(tcg.name) : '' }) }} />
      <FlatList
        data={sets}
        keyExtractor={(s) => String(s.setId)}
        contentContainerStyle={styles.page}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={[styles.hero, { borderColor: tcg?.color }]}>
              <Text style={styles.heroLabel}>{tcg?.name}</Text>
              <Text style={styles.heroValue}>{formatPrice(total.value, 'EUR')}</Text>
              {total.gain != null ? (
                <Text style={{ color: total.gain >= 0 ? colors.success : colors.danger, fontWeight: '700' }}>
                  {total.gain >= 0 ? '▲' : '▼'} {formatPrice(Math.abs(total.gain), 'EUR')}{' '}{t('vs prix d’achat')}
                </Text>
              ) : null}
            </View>
            <View style={styles.statsRow}>
              <StatTile label={t('Cartes')} value={String(total.cards)} sub={plural(total.unique, '{n} différente', '{n} différentes')} />
              <StatTile label={t('Extensions')} value={String(sets.length)} sub={complete ? plural(complete, '{n} complète', '{n} complètes') : t('en cours')} />
            </View>
            <Pressable
              style={styles.allButton}
              onPress={() => router.push({ pathname: '/collection/cards', params: { tcg: tcgId } })}
            >
              <Ionicons name="list" size={18} color={colors.text} />
              <Text style={styles.allText}>{t('Toutes mes cartes')}{' '}{tcg?.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <View style={styles.chips}>
              {SORTS.map(([k, label]) => (
                <Pressable key={k} onPress={() => setSort(k)} style={[styles.chip, sort === k && styles.chipActive]}>
                  <Text style={[styles.chipText, sort === k && styles.chipTextActive]}>{t(label)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item: s }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => router.push({ pathname: '/collection/[tcg]/[setId]', params: { tcg: tcgId, setId: s.setId, name: s.setName } })}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.setName} numberOfLines={2}>{s.setName}</Text>
              <Text style={styles.setValue}>{formatPrice(s.value, 'EUR')}</Text>
            </View>
            {s.completion != null ? <ProgressBar value={s.completion} color={s.completion === 1 ? colors.success : tcg?.color} /> : null}
            <View style={styles.rowBetween}>
              <Text style={styles.muted}>
                {s.setCount ? t('{owned}/{total} cartes · {pct}', { owned: s.distinct, total: s.setCount, pct: percent(s.completion) }) : plural(s.distinct, '{n} carte différente', '{n} cartes différentes')}
                {s.cards > s.distinct ? ` · ${s.cards} exemplaires` : ''}
              </Text>
              <Text style={styles.muted}>{s.langs.map((l) => l.toUpperCase()).join(' / ')}</Text>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10 },
  hero: { backgroundColor: colors.surfaceAlt, borderRadius: radius, padding: 16, alignItems: 'center', gap: 4, borderWidth: 1 },
  heroLabel: { color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, fontSize: 13 },
  heroValue: { color: colors.accent, fontSize: 32, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 10 },
  allButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius, padding: 14 },
  allText: { color: colors.text, fontWeight: '700', flex: 1 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#1A1A1A' },
  row: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  setName: { color: colors.text, fontWeight: '700', fontSize: 15, flex: 1 },
  setValue: { color: colors.accent, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 12 },
});
