import { router, useScrollToTop } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { TCGS } from '../../../api';
import LangToggle from '../../../components/LangToggle';
import { useCollection, summarize, groupBy } from '../../../lib/collection';
import { LANG_NAMES, useCardLang } from '../../../lib/cardLang';
import { formatPrice } from '../../../lib/prices';
import { colors, radius } from '../../../lib/theme';
import { GAME_ICONS } from '../../../lib/gameIcons';

export default function Home() {
  const { items } = useCollection();
  const total = useMemo(() => summarize(items), [items]);
  const perTcg = useMemo(() => groupBy(items, (i) => i.tcg), [items]);
  const { cardLang } = useCardLang();
  // Toucher l'onglet « Explorer » déjà ouvert ramène en haut de la page.
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.page}>
      <Text style={styles.title}>Choisis ton TCG</Text>

      {items.length > 0 && (
        <Pressable style={({ pressed }) => [styles.collection, pressed && styles.pressed]} onPress={() => router.navigate('/(tabs)/(owned)/collection')}>
          <Ionicons name="albums" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.collectionLabel}>Ma collection</Text>
            <Text style={styles.collectionMeta}>{total.cards} carte{total.cards > 1 ? 's' : ''} · {total.unique} différente{total.unique > 1 ? 's' : ''}</Text>
          </View>
          <Text style={styles.collectionValue}>{formatPrice(total.value, 'EUR')}</Text>
        </Pressable>
      )}

      <LangToggle />
      <View style={styles.grid}>
        {TCGS.map((t) => {
          const owned = perTcg.get(t.id);
          const s = owned && summarize(owned);
          // Jeu sans cartes dans la langue choisie : grisé et non sélectionnable.
          const available = t.languages.includes(cardLang);
          return (
            <Pressable
              key={t.id}
              disabled={!available}
              style={({ pressed }) => [styles.tile, { borderLeftColor: t.color }, pressed && styles.pressed, !available && styles.disabled]}
              onPress={() => router.push({ pathname: '/[tcg]', params: { tcg: t.id } })}
            >
              <Image source={GAME_ICONS[t.id]} style={styles.gameIcon} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.tileName}>{t.name}</Text>
                <Text style={styles.tileTagline}>
                  {available ? t.tagline : `Pas de cartes en ${LANG_NAMES[cardLang].toLowerCase()}`}
                </Text>
              </View>
              {s ? (
                <View style={styles.ownedBox}>
                  <Text style={styles.ownedValue}>{formatPrice(s.value, 'EUR')}</Text>
                  <Text style={styles.ownedCount}>{s.cards} carte{s.cards > 1 ? 's' : ''}</Text>
                </View>
              ) : null}
              {available ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  collection: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceAlt,
    borderRadius: radius, padding: 14, borderWidth: 1, borderColor: colors.accent,
  },
  collectionLabel: { color: colors.text, fontWeight: '700', fontSize: 16 },
  collectionMeta: { color: colors.muted, fontSize: 13 },
  collectionValue: { color: colors.accent, fontWeight: '800', fontSize: 18 },
  grid: { gap: 10, marginTop: 8 },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: radius, borderLeftWidth: 5, paddingVertical: 18, paddingHorizontal: 16,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  tileName: { color: colors.text, fontSize: 20, fontWeight: '700' },
  gameIcon: { width: 44, height: 44, borderRadius: 10 },
  tileTagline: { color: colors.muted, marginTop: 2 },
  ownedBox: { alignItems: 'flex-end' },
  ownedValue: { color: colors.accent, fontWeight: '700' },
  ownedCount: { color: colors.muted, fontSize: 12 },
});
