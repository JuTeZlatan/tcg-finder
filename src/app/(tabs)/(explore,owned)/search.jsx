// Recherche dans tous les jeux à la fois (barre de l'accueil « Explorer ») : chaque jeu est interrogé en parallèle
// dans la langue des cartes choisie (en anglais pour les jeux qui n'existent pas dans cette langue) ;
// les résultats arrivent jeu par jeu, avec « Tout voir » vers la recherche du jeu.
import { useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { TCGS, dataLang } from '../../../api';
import { useCardLang } from '../../../lib/cardLang';
import { GAME_ICONS } from '../../../lib/gameIcons';
import { colors, radius } from '../../../lib/theme';
import { plural, t } from '../../../lib/i18n';

const PREVIEW = 12;

export default function GlobalSearchScreen() {
  const { q } = useLocalSearchParams();
  const { cardLang } = useCardLang();
  const [query, setQuery] = useState(String(q || ''));
  // Résultats de la recherche en cours : clé (texte + langue) et, par jeu, { cards } ou { error } dès qu'ils arrivent.
  const key = `${String(q || '').trim()}|${cardLang}`;
  const [state, setState] = useState({ key: null, byGame: {} });
  const results = state.key === key ? state.byGame : {};

  useEffect(() => {
    const text = String(q || '').trim();
    if (!text) return undefined;
    let cancelled = false;
    const done = (id, res) => !cancelled && setState((s) => ({ key, byGame: { ...(s.key === key ? s.byGame : {}), [id]: res } }));
    for (const g of TCGS) {
      g.searchCards(text, dataLang(g, cardLang))
        .then((cards) => done(g.id, { cards: cards || [] }))
        .catch((error) => done(g.id, { error }));
    }
    return () => {
      cancelled = true;
    };
  }, [q, cardLang, key]);

  const submit = () => query.trim() && router.setParams({ q: query.trim() });
  const pending = !!String(q || '').trim() && TCGS.some((g) => !results[g.id]);
  const found = TCGS.filter((g) => results[g.id]?.cards?.length);
  const total = found.reduce((n, g) => n + results[g.id].cards.length, 0);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t('Recherche') }} />
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          returnKeyType="search"
          placeholder={t('Chercher une carte dans tous les jeux…')}
          placeholderTextColor={colors.muted}
          autoFocus={!q}
        />
        <Pressable style={styles.button} onPress={submit}>
          <Ionicons name="search" size={20} color="#1A1A1A" />
        </Pressable>
      </View>

      {q ? (
        <Text style={styles.muted}>
          {pending ? t('Recherche en cours…') : found.length ? plural(total, '{n} carte trouvée', '{n} cartes trouvées') : t('Aucune carte trouvée.')}
        </Text>
      ) : null}
      {pending ? <ActivityIndicator color={colors.accent} /> : null}

      {found.map((g) => {
        const cards = results[g.id].cards;
        const lang = dataLang(g, cardLang);
        return (
          <View key={g.id} style={styles.section}>
            <View style={styles.sectionHead}>
              <Image source={GAME_ICONS[g.id]} style={styles.gameIcon} contentFit="contain" />
              <Text style={styles.sectionTitle}>{g.name}</Text>
              <Text style={styles.muted}>{cards.length}</Text>
              <View style={{ flex: 1 }} />
              {cards.length > PREVIEW ? (
                <Pressable hitSlop={8} onPress={() => router.push({ pathname: '/[tcg]/search', params: { tcg: g.id, q } })}>
                  <Text style={styles.link}>{t('Tout voir')}</Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {cards.slice(0, PREVIEW).map((c, i) => (
                <Pressable
                  key={`${c.id}-${i}`}
                  style={styles.card}
                  onPress={() => router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: g.id, cardId: c.id, setId: c.setId ?? '', lang } })}
                >
                  <View style={styles.imgBox}>
                    {c.image ? <Image source={c.image} style={{ width: '100%', height: '100%' }} contentFit="cover" recyclingKey={c.id} /> : <Text style={styles.noImg}>{t('Pas d’image')}</Text>}
                  </View>
                  <Text style={styles.name} numberOfLines={2}>{c.name}</Text>
                  {c.number || c.subtitle ? <Text style={styles.muted} numberOfLines={1}>{[c.number && `#${c.number}`, c.subtitle].filter(Boolean).join(' · ')}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 32 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: colors.surface, color: colors.text, borderRadius: radius, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, fontSize: 16 },
  button: { backgroundColor: colors.accent, borderRadius: radius, paddingHorizontal: 16, justifyContent: 'center' },
  muted: { color: colors.muted, fontSize: 13 },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gameIcon: { width: 24, height: 24, borderRadius: 6 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  link: { color: colors.accent, fontWeight: '700' },
  card: { width: 110, gap: 3 },
  imgBox: { width: 110, aspectRatio: 63 / 88, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  noImg: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  name: { color: colors.text, fontSize: 12, fontWeight: '600' },
});
