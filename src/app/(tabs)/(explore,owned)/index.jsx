import { router, useScrollToTop } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { TCGS } from '../../../api';
import LangToggle from '../../../components/LangToggle';
import { useCollection, summarize, groupBy } from '../../../lib/collection';
import { useCardLang } from '../../../lib/cardLang';
import { formatPrice } from '../../../lib/prices';
import { colors, radius } from '../../../lib/theme';
import { GAME_ICONS } from '../../../lib/gameIcons';
import { useSettings } from '../../../lib/settings';
import { plural, t } from '../../../lib/i18n';

export default function Home() {
  useSettings(); // réaffiche les prix quand la devise (ou le taux du jour) change
  const { items } = useCollection();
  const perTcg = useMemo(() => groupBy(items, (i) => i.tcg), [items]);
  const { cardLang } = useCardLang();
  // Toucher l'onglet « Explorer » déjà ouvert ramène en haut de la page.
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  // Recherche dans tous les jeux à la fois.
  const [query, setQuery] = useState('');
  const search = () => query.trim() && router.push({ pathname: '/search', params: { q: query.trim() } });

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.page}>
      <Text style={styles.title}>{t('Choisis ton TCG')}</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder={t('Chercher une carte dans tous les jeux…')}
          placeholderTextColor={colors.muted}
        />
        <Pressable style={styles.searchButton} onPress={search} accessibilityLabel={t('Recherche')}>
          <Ionicons name="search" size={20} color="#1A1A1A" />
        </Pressable>
      </View>

      <LangToggle />
      <View style={styles.grid}>
        {TCGS.map((g) => {
          const owned = perTcg.get(g.id);
          const s = owned && summarize(owned);
          // Jeu sans cartes dans la langue choisie : grisé et non sélectionnable
          // (sauf les jeux affichés en anglais en attendant une version officielle, ex. Riftbound en français).
          const available = g.languages.includes(cardLang) || !!g.englishFallback;
          return (
            <Pressable
              key={g.id}
              disabled={!available}
              style={({ pressed }) => [styles.tile, { borderLeftColor: g.color }, pressed && styles.pressed, !available && styles.disabled]}
              onPress={() => router.push({ pathname: '/[tcg]', params: { tcg: g.id } })}
            >
              <Image source={GAME_ICONS[g.id]} style={styles.gameIcon} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.tileName}>{g.name}</Text>
                <Text style={styles.tileTagline}>
                  {available ? t(g.tagline) : t('Pas de cartes dans cette langue')}
                </Text>
              </View>
              {s ? (
                <View style={styles.ownedBox}>
                  <Text style={styles.ownedValue}>{formatPrice(s.value, 'EUR')}</Text>
                  <Text style={styles.ownedCount}>{plural(s.cards, '{n} carte', '{n} cartes')}</Text>
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
  grid: { gap: 10, marginTop: 8 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, backgroundColor: colors.surface, color: colors.text, borderRadius: radius, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, fontSize: 16 },
  searchButton: { backgroundColor: colors.accent, borderRadius: radius, paddingHorizontal: 16, justifyContent: 'center' },
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
