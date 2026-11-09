// Panneau « Trier et filtrer » d'une extension : tri, cartes possédées / manquantes / recherchées, tranches de prix,
// rareté, type et couleur (seulement ce que le jeu fournit). Les choix s'appliquent tout de suite à la grille derrière.
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EMPTY_FILTERS, FACETS, PRICE_BANDS, SHOWS, SORTS, activeCount } from '../lib/cardFilters';
import { fieldValue } from '../lib/labels';
import { formatPrice } from '../lib/prices';
import { plural, t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';

export const SORT_LABELS = { number: 'Numéro', priceDesc: 'Prix décroissant', priceAsc: 'Prix croissant', name: 'Nom (A → Z)', rarity: 'Rareté (plus rare d’abord)' };
export const SHOW_LABELS = { all: 'Toutes', owned: 'Possédées', missing: 'Manquantes', wished: 'Recherchées' };
const FACET_LABELS = { rarity: 'Rareté', type: 'Type', color: 'Couleur' };

export const bandLabel = ([, min, max]) => (max === Infinity
  ? t('{min} et plus', { min: formatPrice(min, 'EUR') })
  : min === 0 ? t('Moins de {max}', { max: formatPrice(max, 'EUR') }) : `${formatPrice(min, 'EUR')} – ${formatPrice(max, 'EUR')}`);
export const facetLabel = (facet, value) => t(fieldValue(facet, value));

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

// `facetNames` : nom de la caractéristique propre au jeu (« Attribut » Yu-Gi-Oh!, « Encre » Lorcana…).
export default function FilterSheet({ visible, onClose, filters, onChange, facetOptions, facetNames, hasPrices, hasRarity, resultCount }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const sorts = SORTS.filter((s) => (s.startsWith('price') ? hasPrices : s === 'rarity' ? hasRarity : true));
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('Trier et filtrer')}</Text>
            {activeCount(filters) || filters.sort !== 'number' ? (
              <Pressable onPress={() => onChange(EMPTY_FILTERS)} hitSlop={8}>
                <Text style={styles.reset}>{t('Réinitialiser')}</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
            <Section title={t('Trier par')}>
              {sorts.map((s) => <Chip key={s} label={t(SORT_LABELS[s])} active={filters.sort === s} onPress={() => set({ sort: s })} />)}
            </Section>
            <Section title={t('Afficher')}>
              {SHOWS.map((s) => <Chip key={s} label={t(SHOW_LABELS[s])} active={filters.show === s} onPress={() => set({ show: s })} />)}
            </Section>
            {hasPrices ? (
              <Section title={t('Prix')}>
                {PRICE_BANDS.map((b) => <Chip key={b[0]} label={bandLabel(b)} active={filters.bands.includes(b[0])} onPress={() => set({ bands: toggle(filters.bands, b[0]) })} />)}
              </Section>
            ) : null}
            {FACETS.filter((f) => facetOptions[f]?.length).map((f) => (
              <Section key={f} title={t(facetNames?.[f] || FACET_LABELS[f])}>
                {facetOptions[f].map(({ value, count }) => (
                  <Chip
                    key={value}
                    label={`${facetLabel(f, value)} · ${count}`}
                    active={filters[f].includes(value)}
                    onPress={() => set({ [f]: toggle(filters[f], value) })}
                  />
                ))}
              </Section>
            ))}
          </ScrollView>
          <Pressable style={styles.done} onPress={onClose}>
            <Text style={styles.doneText}>{plural(resultCount, 'Voir {n} carte', 'Voir {n} cartes')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

export function Chip({ label, active, onPress, onRemove }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}{onRemove ? '  ✕' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surfaceAlt, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, gap: 14, maxHeight: '85%',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  reset: { color: colors.accent, fontWeight: '700' },
  section: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#1A1A1A' },
  done: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 13, alignItems: 'center' },
  doneText: { color: '#1A1A1A', fontWeight: '800', fontSize: 15 },
});
