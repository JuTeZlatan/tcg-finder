import { useMemo, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { getTcg, dataLang, langNote } from '../../../../api';
import { useAsync } from '../../../../lib/useAsync';
import { useCardLang } from '../../../../lib/cardLang';
import { colors, radius } from '../../../../lib/theme';
import LangToggle from '../../../../components/LangToggle';
import { Loading, ErrorView } from '../../../../components/Status';
import { t } from '../../../../lib/i18n';

const GAP = 10;

// Écran d'un jeu : recherche, puis deux onglets — « Extensions » et les personnages du jeu (« Pokémon »,
// « Personnages », « Champions », « Archétypes », « Planeswalkers » selon le jeu).
export default function TcgScreen() {
  const { tcg: tcgId } = useLocalSearchParams();
  const tcg = getTcg(tcgId);
  const { cardLang } = useCardLang();
  const lang = dataLang(tcg, cardLang);
  const [tab, setTab] = useState('sets');
  const showCharacters = tab === 'characters' && !!tcg.getCharacters;
  const sets = useAsync(() => tcg.getSets(lang), [tcg.id, lang]);
  const characters = useAsync(
    () => (showCharacters ? tcg.getCharacters(lang) : Promise.resolve(null)),
    [tcg.id, lang, showCharacters],
  );
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  // Personnages : ordre alphabétique, ou numéro (Pokédex) quand le jeu en a un.
  const [order, setOrder] = useState('alpha');
  const { width } = useWindowDimensions();
  const tileWidth = (width - 32 - GAP * 2) / 3;

  const shownSets = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (sets.data || []).filter((s) => !f || s.name.toLowerCase().includes(f) || s.subtitle?.toLowerCase().includes(f));
  }, [sets.data, filter]);

  const shownCharacters = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = (characters.data || []).filter((c) => !f || c.name.toLowerCase().includes(f) || String(c.number ?? '') === f);
    return order === 'number' && tcg.characterOrder
      ? [...list].sort((a, b) => a.number - b.number)
      : [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [characters.data, filter, order, tcg.characterOrder]);

  const search = () => {
    if (query.trim()) router.push({ pathname: '/[tcg]/search', params: { tcg: tcg.id, q: query.trim() } });
  };

  const header = (
    <View style={styles.header}>
      {tcg.languages.length > 1 ? <LangToggle langs={tcg.languages} shown={lang} note={langNote(tcg, lang)} /> : null}
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder={t('Chercher une carte par son nom…')}
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <Pressable style={styles.button} onPress={search}>
          <Text style={styles.buttonText}>{t('OK')}</Text>
        </Pressable>
      </View>
      {tcg.getCharacters ? (
        <View style={styles.tabs}>
          {[['sets', t('Extensions')], ['characters', t(tcg.charactersLabel)]].map(([k, label]) => (
            <Pressable key={k} onPress={() => { setTab(k); setFilter(''); }} style={[styles.tab, tab === k && styles.tabActive]}>
              <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {showCharacters ? (
        <>
          <Text style={styles.section}>{t(tcg.charactersLabel)} {characters.data ? `(${shownCharacters.length})` : ''}</Text>
          {tcg.characterOrder ? (
            <View style={styles.orderRow}>
              {[['alpha', 'A → Z'], ['number', t(tcg.characterOrder)]].map(([k, label]) => (
                <Pressable key={k} onPress={() => setOrder(k)} style={[styles.chip, order === k && styles.chipActive]}>
                  <Text style={[styles.chipText, order === k && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.section}>{t('Extensions')}{' '}{sets.data ? `(${shownSets.length})` : ''}</Text>
      )}
      <TextInput
        style={styles.input}
        placeholder={showCharacters ? t('Filtrer…') : t('Filtrer les extensions…')}
        placeholderTextColor={colors.muted}
        value={filter}
        onChangeText={setFilter}
      />
      {showCharacters ? (
        <>
          {characters.loading && <Loading text={t('Chargement…')} />}
          {characters.error && <ErrorView error={characters.error} onRetry={characters.retry} />}
        </>
      ) : (
        <>
          {sets.loading && <Loading text={t('Chargement des extensions…')} />}
          {sets.error && <ErrorView error={sets.error} onRetry={sets.retry} />}
        </>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: tcg.name }} />
      {showCharacters ? (
        <FlatList
          key="characters"
          data={shownCharacters}
          numColumns={3}
          keyExtractor={(c) => String(c.id)}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          columnWrapperStyle={{ gap: GAP }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          windowSize={7}
          renderItem={({ item: c }) => (
            <Pressable
              style={({ pressed }) => [{ width: tileWidth }, pressed && { opacity: 0.7 }]}
              onPress={() => router.push({ pathname: '/[tcg]/character/[charId]', params: { tcg: tcg.id, charId: c.id, name: c.name } })}
            >
              <View style={styles.charImg}>
                {c.image ? <Image source={c.image} style={{ width: '100%', height: '100%' }} contentFit="cover" contentPosition="top" recyclingKey={String(c.id)} /> : null}
                {c.number && tcg.characterOrder ? <Text style={styles.charNumber}>#{c.number}</Text> : null}
              </View>
              <Text style={styles.charName} numberOfLines={2}>{c.name}</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="sets"
          data={shownSets}
          keyExtractor={(s) => String(s.id)}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          renderItem={({ item: s }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              onPress={() => router.push({ pathname: '/[tcg]/set/[setId]', params: { tcg: tcg.id, setId: s.id, name: s.name } })}
            >
              <SetLogo uri={s.logo} tint={s.logoTint} />
              <View style={{ flex: 1 }}>
                <Text style={styles.setName} numberOfLines={2}>{s.name}</Text>
                <Text style={styles.meta}>{s.subtitle}{s.count ? ` · ${s.count} cartes` : ''}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </>
  );
}

// Logo d'extension (ou symbole, ou image du booster selon le jeu) ; masqué s'il ne se charge pas.
// `tint` : symbole monochrome (Magic) recoloré pour rester lisible sur fond sombre.
function SetLogo({ uri, tint }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return null;
  return (
    <View style={styles.logo}>
      <Image source={uri} style={styles.logoImg} contentFit="contain" tintColor={tint ? colors.text : undefined} onError={() => setFailed(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  header: { gap: 10, marginBottom: 4 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  button: { backgroundColor: colors.accent, borderRadius: radius, paddingHorizontal: 18, justifyContent: 'center' },
  buttonText: { color: '#1A1A1A', fontWeight: '800' },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 999, padding: 4, marginTop: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999 },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.muted, fontWeight: '700' },
  tabTextActive: { color: '#1A1A1A' },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  orderRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#1A1A1A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius, padding: 12 },
  logo: { width: 64, height: 48, justifyContent: 'center' },
  logoImg: { width: '100%', height: '100%' },
  setName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  charImg: { aspectRatio: 1, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  charNumber: { position: 'absolute', top: 4, left: 6, color: colors.muted, fontSize: 11, fontWeight: '700' },
  charName: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' },
});
