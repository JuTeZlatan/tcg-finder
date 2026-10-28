import { useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { CUSTOM_TCG, TCGS, getTcg } from '../../../../api';
import { useCollection, summarize } from '../../../../lib/collection';
import { finishName } from '../../../../lib/finishes';
import { openItem } from '../../../../lib/openItem';
import { formatPrice } from '../../../../lib/prices';
import { colors, radius } from '../../../../lib/theme';
import { useSettings } from '../../../../lib/settings';

const SORTS = [
  ['value', 'Valeur totale'],
  ['price', 'Prix unitaire'],
  ['recent', 'Récentes'],
  ['name', 'Nom'],
  ['qty', 'Quantité'],
];

const SORT_FNS = {
  value: (a, b) => (b.price ?? 0) * b.qty - (a.price ?? 0) * a.qty,
  price: (a, b) => (b.price ?? 0) - (a.price ?? 0),
  recent: (a, b) => b.addedAt - a.addedAt,
  name: (a, b) => a.name.localeCompare(b.name),
  qty: (a, b) => b.qty - a.qty,
};

export default function AllCardsScreen() {
  useSettings(); // réaffiche les prix quand la devise (ou le taux du jour) change
  const params = useLocalSearchParams();
  const { items } = useCollection();
  const [tcgFilter, setTcgFilter] = useState(params.tcg || null);
  const [sort, setSort] = useState('value');
  const [query, setQuery] = useState('');
  const ownedTcgs = [...TCGS, CUSTOM_TCG].filter((t) => items.some((i) => i.tcg === t.id));

  const q = query.trim().toLowerCase();
  const list = items
    .filter((i) => (!tcgFilter || i.tcg === tcgFilter) && (!q || i.name.toLowerCase().includes(q) || (i.setName || '').toLowerCase().includes(q) || String(i.number ?? '').toLowerCase().includes(q)))
    .sort(SORT_FNS[sort]);
  const s = summarize(list);

  return (
    <>
      <Stack.Screen options={{ title: 'Toutes mes cartes' }} />
      <FlatList
        data={list}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <TextInput
              style={styles.input}
              placeholder="Chercher dans ma collection (nom, extension, numéro)…"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
            />
            <View style={styles.chips}>
              <Pressable onPress={() => setTcgFilter(null)} style={[styles.chip, !tcgFilter && styles.chipActive]}>
                <Text style={[styles.chipText, !tcgFilter && styles.chipTextActive]}>Tous</Text>
              </Pressable>
              {ownedTcgs.map((t) => (
                <Pressable key={t.id} onPress={() => setTcgFilter(t.id)} style={[styles.chip, tcgFilter === t.id && { backgroundColor: t.color }]}>
                  <Text style={[styles.chipText, tcgFilter === t.id && styles.chipTextActive]}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.chips}>
              {SORTS.map(([k, label]) => (
                <Pressable key={k} onPress={() => setSort(k)} style={[styles.chipSmall, sort === k && styles.chipActive]}>
                  <Text style={[styles.chipText, sort === k && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.summary}>
              {list.length} cartes différentes · {s.cards} exemplaires · {formatPrice(s.value, 'EUR')}
            </Text>
          </View>
        }
        renderItem={({ item: i }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => openItem(i)}
          >
            <View style={styles.thumb}>
              {i.image ? <Image source={i.image} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name} numberOfLines={1}>{i.name}{i.finish ? ` · ${i.finishName || finishName(i.finish)}` : ''}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {getTcg(i.tcg)?.name} · {i.setName || i.setId}{i.number ? ` · #${i.number}` : ''}
              </Text>
              <Text style={styles.meta}>
                {i.lang.toUpperCase()} · ×{i.qty}
                {i.price != null ? ` · ${formatPrice(i.price, 'EUR')} l'unité` : ' · prix inconnu'}
                {i.divergent ? ' · ⚠ écart entre sites' : ''}
              </Text>
            </View>
            <Text style={styles.value}>{i.price != null ? formatPrice(i.price * i.qty, 'EUR') : '—'}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.meta}>Aucune carte ne correspond.</Text>}
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius,
    color: colors.text, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
  },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  chipSmall: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#1A1A1A' },
  summary: { color: colors.text, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius, padding: 10 },
  thumb: { width: 46, aspectRatio: 63 / 88, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  name: { color: colors.text, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12 },
  value: { color: colors.accent, fontWeight: '800' },
});
