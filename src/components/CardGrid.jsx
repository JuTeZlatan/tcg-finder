import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CardImage from './CardImage';
import FilterSheet, { Chip, SHOW_LABELS, SORT_LABELS, bandLabel, facetLabel } from './FilterSheet';
import { useAsync } from '../lib/useAsync';
import { colors, radius } from '../lib/theme';
import { Loading, ErrorView } from './Status';
import { QuickAdd } from './collection';
import { copyLang } from '../api';
import { useCardLang } from '../lib/cardLang';
import { useCollection } from '../lib/collection';
import { useSettings } from '../lib/settings';
import { wishKey } from '../lib/wishlist';
import { averagePrice, formatPrice, getUsdToEur } from '../lib/prices';
import { EMPTY_FILTERS, FACETS, PRICE_BANDS, activeCount, applyFilters, facetValues, rarityRanks, totalOf } from '../lib/cardFilters';
import { plural, t } from '../lib/i18n';

const GAP = 10;
const PADDING = 16;

// `headerExtra` : contenu ajouté en tête (ex. choix Simplifié / Master set). Les cartes portant `finish` / `label`
// sont des versions précises (master set) : le « + » ajoute directement cette version.
// Tris et filtres (src/lib/cardFilters.js) : prix moyen, rareté, type, couleur, possédées / manquantes / recherchées ;
// le tri choisi est gardé pour les autres extensions (réglage gridSort).
export default function CardGrid({ tcg, lang, load, deps, setId, headerExtra }) {
  const cards = useAsync(load, deps);
  // « + » : exemplaire dans la langue choisie, même si les données affichées sont anglaises (Riftbound en français).
  const own = copyLang(tcg, useCardLang().cardLang);
  const [filter, setFilter] = useState('');
  const { settings, update } = useSettings();
  // Tri : celui des réglages (lus parfois après le premier affichage) tant qu'on n'en choisit pas un autre ici.
  const [picked, setFilters] = useState(EMPTY_FILTERS);
  const chosen = { ...picked, sort: picked.sortPicked ? picked.sort : settings.gridSort || 'number' };
  const changeFilters = (next) => {
    // Tri inchangé dans le panneau : on garde celui choisi (même s'il est impossible dans cette extension).
    const kept = next.sort === filters.sort ? { ...next, sort: chosen.sort } : next;
    setFilters({ ...kept, sortPicked: true });
    if (kept.sort !== (settings.gridSort || 'number')) update({ gridSort: kept.sort }, { fromSync: true });
  };
  const [sheet, setSheet] = useState(false);
  const fx = useAsync(() => getUsdToEur(), []);
  const { items } = useCollection();
  const wishlist = settings.wishlist;
  const { width } = useWindowDimensions();
  const columns = width > 700 ? 5 : 3;
  const tileWidth = (width - PADDING * 2 - GAP * (columns - 1)) / columns;

  // Exemplaires possédés par carte (et par version en master set), dans la langue où l'on collectionne.
  const ownedIndex = useMemo(() => {
    const m = new Map();
    for (const i of items) {
      if (i.tcg !== tcg.id || i.lang !== own) continue;
      for (const k of [i.cardId, `${i.cardId}|${i.finish || ''}`]) m.set(k, (m.get(k) || 0) + i.qty);
    }
    return m;
  }, [items, tcg.id, own]);

  const rows = useMemo(() => (cards.data || []).map((c) => ({
    card: c,
    facets: c.facets,
    price: fx.data && c.prices?.length ? averagePrice(c.prices, fx.data, { finish: c.finish ?? null })?.value ?? null : null,
    owned: ownedIndex.get('label' in c ? `${c.id}|${c.finish || ''}` : c.id) || 0,
    wished: !!wishlist?.[wishKey(tcg.id, own, c.id)],
  })), [cards.data, fx.data, ownedIndex, wishlist, tcg.id, own]);
  const ranks = useMemo(() => rarityRanks(rows), [rows]);
  const facetOptions = useMemo(() => Object.fromEntries(FACETS.map((f) => [f, facetValues(rows, f, ranks)])), [rows, ranks]);
  const hasPrices = rows.some((r) => r.price != null);
  // Tri gardé d'une autre extension mais impossible ici (pas de prix, pas de rareté) : par numéro.
  const sortAvailable = chosen.sort.startsWith('price') ? hasPrices : chosen.sort === 'rarity' ? facetOptions.rarity.length > 0 : true;
  const sort = sortAvailable ? chosen.sort : 'number';
  const filters = { ...chosen, sort };
  const shownRows = applyFilters(rows, filters, filter, ranks); // mémorisé par le React Compiler

  // Filtres actifs (hors « possédées / manquantes », déjà visibles) : retirables d'un toucher sous la recherche.
  const activeChips = [
    filters.sort !== 'number' && { key: 'sort', label: t(SORT_LABELS[filters.sort]), clear: { sort: 'number' } },
    filters.show === 'wished' && { key: 'show', label: t(SHOW_LABELS.wished), clear: { show: 'all' } },
    ...filters.bands.map((b) => ({ key: `b${b}`, label: bandLabel(PRICE_BANDS.find(([k]) => k === b)), clear: { bands: filters.bands.filter((x) => x !== b) } })),
    ...FACETS.flatMap((f) => filters[f].map((v) => ({ key: `${f}${v}`, label: facetLabel(f, v), clear: { [f]: filters[f].filter((x) => x !== v) } }))),
  ].filter(Boolean);
  const count = activeCount(filters);
  const highlighted = count > 0 || filters.sort !== 'number';
  const total = totalOf(shownRows);

  const open = (c) =>
    router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: tcg.id, cardId: c.id, setId: c.setId ?? setId ?? '', finish: c.finish ?? '' } });

  return (
    <FlatList
      key={columns}
      data={shownRows}
      numColumns={columns}
      keyExtractor={(r, i) => `${r.card.id}-${r.card.finish || ''}-${i}`}
      contentContainerStyle={{ padding: PADDING, gap: GAP }}
      columnWrapperStyle={{ gap: GAP }}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={18}
      maxToRenderPerBatch={12}
      windowSize={9}
      removeClippedSubviews
      ListHeaderComponent={
        <View style={styles.header}>
          {headerExtra}
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={t('Filtrer par nom ou numéro…')}
              placeholderTextColor={colors.muted}
              value={filter}
              onChangeText={setFilter}
            />
            <Pressable
              style={[styles.filterBtn, highlighted && styles.filterBtnActive]}
              onPress={() => setSheet(true)}
              accessibilityLabel={t('Trier et filtrer')}
            >
              <Ionicons name="options-outline" size={20} color={highlighted ? '#1A1A1A' : colors.text} />
              {count ? <Text style={styles.filterCount}>{count}</Text> : null}
            </Pressable>
          </View>
          {/* Accès direct : toutes / possédées / manquantes (le reste dans le panneau). */}
          <View style={styles.quick}>
            {['all', 'owned', 'missing'].map((k) => (
              <Chip key={k} label={t(SHOW_LABELS[k])} active={filters.show === k} onPress={() => changeFilters({ ...filters, show: k })} />
            ))}
          </View>
          {activeChips.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {activeChips.map((c) => (
                <Chip key={c.key} label={c.label} active onPress={() => changeFilters({ ...filters, ...c.clear })} onRemove />
              ))}
            </ScrollView>
          ) : null}
          {cards.data && (
            <Text style={styles.count}>
              {plural(shownRows.length, '{n} carte', '{n} cartes')}
              {hasPrices && total > 0 ? ` · ${t('valeur {value}', { value: formatPrice(total, 'EUR') })}` : ''}
            </Text>
          )}
          {cards.loading && <Loading text={t('Chargement des cartes…')} />}
          {cards.error && <ErrorView error={cards.error} onRetry={cards.retry} />}
          {cards.data && !cards.data.length && <Text style={styles.count}>{t('Aucune carte trouvée.')}</Text>}
        </View>
      }
      renderItem={({ item: { card: c, price } }) => (
        <Pressable style={({ pressed }) => [{ width: tileWidth }, pressed && { opacity: 0.7 }]} onPress={() => open(c)}>
          <View style={styles.imgBox}>
            {c.image ? (
              <CardImage source={c.image} style={styles.img} contentFit="cover" recyclingKey={`${c.id}-${c.finish || ''}`} transition={100} />
            ) : (
              <Text style={styles.noImg}>{t('Pas d’image')}</Text>
            )}
            <QuickAdd tcgId={tcg.id} lang={own} setId={c.setId ?? setId} card={c} version={'label' in c ? { finish: c.finish, label: c.label } : null} />
          </View>
          <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
          {c.label ? <Text style={styles.version} numberOfLines={2}>{c.label}</Text> : null}
          <Text style={styles.meta} numberOfLines={1}>
            {[c.number && `#${c.number}`, c.subtitle].filter(Boolean).join(' · ')}
          </Text>
          {price != null ? <Text style={styles.price} numberOfLines={1}>{formatPrice(price, 'EUR')}</Text> : null}
        </Pressable>
      )}
      ListFooterComponent={(
        <FilterSheet
          visible={sheet}
          onClose={() => setSheet(false)}
          filters={filters}
          onChange={changeFilters}
          facetOptions={facetOptions}
          facetNames={tcg.facetNames}
          hasPrices={hasPrices}
          hasRarity={facetOptions.rarity.length > 0}
          resultCount={shownRows.length}
        />
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
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  filterBtn: {
    width: 46, height: 46, borderRadius: radius, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterCount: { position: 'absolute', top: 3, right: 5, color: '#1A1A1A', fontSize: 10, fontWeight: '800' },
  quick: { flexDirection: 'row', gap: 8 },
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
  price: { color: colors.accent, fontSize: 11, fontWeight: '700' },
});
