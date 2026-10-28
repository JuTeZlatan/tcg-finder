import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useAsync } from '../lib/useAsync';
import { colors, radius } from '../lib/theme';
import { Loading, ErrorView } from './Status';
import { QuickAdd } from './collection';
import { plural, t } from '../lib/i18n';

const GAP = 10;
const PADDING = 16;

// `headerExtra` : contenu ajouté en tête (ex. choix Simplifié / Master set). Les cartes portant `finish` / `label`
// sont des versions précises (master set) : le « + » ajoute directement cette version.
export default function CardGrid({ tcg, lang, load, deps, setId, headerExtra }) {
  const cards = useAsync(load, deps);
  const [filter, setFilter] = useState('');
  const { width } = useWindowDimensions();
  const columns = width > 700 ? 5 : 3;
  const tileWidth = (width - PADDING * 2 - GAP * (columns - 1)) / columns;

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (cards.data || []).filter((c) => !f || c.name.toLowerCase().includes(f) || String(c.number ?? '').toLowerCase().includes(f));
  }, [cards.data, filter]);

  const open = (c) =>
    router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: tcg.id, cardId: c.id, setId: c.setId ?? setId ?? '', finish: c.finish ?? '' } });

  return (
    <FlatList
      key={columns}
      data={shown}
      numColumns={columns}
      keyExtractor={(c, i) => `${c.id}-${c.finish || ''}-${i}`}
      contentContainerStyle={{ padding: PADDING, gap: GAP }}
      columnWrapperStyle={{ gap: GAP }}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={18}
      windowSize={7}
      ListHeaderComponent={
        <View style={styles.header}>
          {headerExtra}
          <TextInput
            style={styles.input}
            placeholder={t('Filtrer par nom ou numéro…')}
            placeholderTextColor={colors.muted}
            value={filter}
            onChangeText={setFilter}
          />
          {cards.data && <Text style={styles.count}>{plural(shown.length, '{n} carte', '{n} cartes')}</Text>}
          {cards.loading && <Loading text={t('Chargement des cartes…')} />}
          {cards.error && <ErrorView error={cards.error} onRetry={cards.retry} />}
          {cards.data && !cards.data.length && <Text style={styles.count}>{t('Aucune carte trouvée.')}</Text>}
        </View>
      }
      renderItem={({ item: c }) => (
        <Pressable style={({ pressed }) => [{ width: tileWidth }, pressed && { opacity: 0.7 }]} onPress={() => open(c)}>
          <View style={styles.imgBox}>
            {c.image ? (
              <Image source={c.image} style={styles.img} contentFit="cover" recyclingKey={c.id} transition={100} />
            ) : (
              <Text style={styles.noImg}>{t('Pas d’image')}</Text>
            )}
            <QuickAdd tcgId={tcg.id} lang={lang} setId={c.setId ?? setId} card={c} version={'label' in c ? { finish: c.finish, label: c.label } : null} />
          </View>
          <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
          {c.label ? <Text style={styles.version} numberOfLines={2}>{c.label}</Text> : null}
          <Text style={styles.meta} numberOfLines={1}>
            {[c.number && `#${c.number}`, c.subtitle].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 4 },
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
  count: { color: colors.muted },
  imgBox: {
    aspectRatio: 63 / 88,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: { width: '100%', height: '100%' },
  noImg: { color: colors.muted, fontSize: 11 },
  name: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 4 },
  meta: { color: colors.muted, fontSize: 11 },
  version: { color: colors.accent, fontSize: 11, fontWeight: '600' },
});
