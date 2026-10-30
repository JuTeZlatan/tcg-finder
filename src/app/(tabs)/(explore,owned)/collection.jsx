import { useMemo, useRef } from 'react';
import { router, useScrollToTop } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getTcg } from '../../../api';
import { useCollection, summarize, groupBy, setsSummary } from '../../../lib/collection';
import { formatPrice } from '../../../lib/prices';
import { colors, radius, percent } from '../../../lib/theme';
import { LangBadge, StatTile, ProgressBar, ValueChart } from '../../../components/collection';
import { openItem } from '../../../lib/openItem';
import Movers from '../../../components/Movers';
import { useSettings } from '../../../lib/settings';
import { locale, plural, t } from '../../../lib/i18n';


// Avancement d'un jeu : cartes différentes possédées sur le total des extensions commencées (taille connue).
function completionOf(sets) {
  const known = sets.filter((s) => s.setCount);
  const total = known.reduce((n, s) => n + s.setCount, 0);
  const owned = known.reduce((n, s) => n + Math.min(s.distinct, s.setCount), 0);
  return { sets: sets.length, owned, total, completion: total ? owned / total : null };
}

export default function CollectionScreen() {
  useSettings(); // réaffiche les prix quand la devise (ou le taux du jour) change
  const { loaded, items, history, pricesUpdatedAt, refresh } = useCollection();
  // Toucher l'onglet « Ma collection » déjà ouvert ramène en haut de la page.
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const total = useMemo(() => summarize(items), [items]);
  const wishCount = Object.keys(useSettings().settings.wishlist || {}).length;
  const byTcg = useMemo(
    () => [...groupBy(items, (i) => i.tcg)]
      .map(([id, list]) => ({ tcg: getTcg(id), ...completionOf(setsSummary(list)), ...summarize(list) }))
      .filter((g) => g.tcg)
      .sort((a, b) => b.value - a.value),
    [items],
  );
  const top = useMemo(() => items.filter((i) => i.price != null).sort((a, b) => b.price - a.price).slice(0, 10), [items]);
  const setCount = useMemo(() => byTcg.reduce((s, g) => s + g.sets, 0), [byTcg]);


  if (loaded && !items.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="albums-outline" size={64} color={colors.muted} />
        <Text style={styles.emptyTitle}>{t('Ta collection est vide')}</Text>
        <Text style={styles.emptyText}>
          {t('Dans « Explorer », touche le bouton + sur une carte (ou « Ajouter à ma collection » sur sa fiche). Tu verras ici sa valeur, ta progression par extension et l’évolution de ta collection.')}
        </Text>
        <Pressable style={styles.cta} onPress={() => router.navigate('/(tabs)/(explore)')}>
          <Ionicons name="search" size={18} color="#1A1A1A" />
          <Text style={styles.ctaText}>{t('Explorer les cartes')}</Text>
        </Pressable>
        <Pressable style={styles.ctaSecondary} onPress={() => router.push('/collection/wishlist')}>
          <Ionicons name="heart-outline" size={18} color={colors.accent} />
          <Text style={styles.ctaSecondaryText}>{t('Mes cartes recherchées ({n})', { n: wishCount })}</Text>
        </Pressable>
        <Pressable style={styles.ctaSecondary} onPress={() => router.push('/collection/custom')}>
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.ctaSecondaryText}>{t('Ajouter une autre carte (saisie manuelle)')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.page}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{t('Valeur de ma collection')}</Text>
        <Text style={styles.heroValue}>{formatPrice(total.value, 'EUR')}</Text>
        <Text style={styles.heroMeta}>
          {[plural(total.cards, '{n} carte', '{n} cartes'), plural(total.unique, '{n} différente', '{n} différentes'), plural(setCount, '{n} extension', '{n} extensions'), plural(byTcg.length, '{n} jeu', '{n} jeux')].join(' · ')}
        </Text>
        {total.gain != null ? (
          <Text style={[styles.heroGain, { color: total.gain >= 0 ? colors.success : colors.danger }]}>
            {total.gain >= 0 ? '▲' : '▼'} {formatPrice(Math.abs(total.gain), 'EUR')} ({total.gainPct >= 0 ? '+' : ''}{total.gainPct.toLocaleString(locale(), { maximumFractionDigits: 1 })} %) {t('par rapport au prix d’achat')}
          </Text>
        ) : null}
        {/* Prix mis à jour automatiquement chaque jour : simple date (progression pendant la mise à jour). */}
        {refresh || pricesUpdatedAt ? (
          <Text style={styles.updated}>
            {refresh
              ? t('Mise à jour des prix… {done}/{total}', refresh)
              : t('Prix du {date}', { date: new Date(pricesUpdatedAt).toLocaleDateString(locale()) })}
          </Text>
        ) : null}
        {refresh ? <ProgressBar value={refresh.done / refresh.total} /> : null}
      </View>

      <View style={styles.statsRow}>
        <StatTile label={t('Valeur moyenne')} value={formatPrice(total.unique ? total.value / total.cards : 0, 'EUR')} sub={t('par carte')} />
        <StatTile label={t('Carte la plus chère')} value={top[0] ? formatPrice(top[0].price, 'EUR') : '—'} sub={top[0]?.name} />
      </View>

      <View style={styles.card}>
        <ValueChart history={history} />
      </View>

      <Movers items={items} />

      <Text style={styles.section}>{t('Par jeu')}</Text>
      <View style={styles.card}>
        {byTcg.map((g, idx) => (
          <Pressable
            key={g.tcg.id}
            style={({ pressed }) => [styles.tcgRow, idx > 0 && styles.divider, pressed && { opacity: 0.6 }]}
            onPress={() => router.push({ pathname: '/collection/[tcg]', params: { tcg: g.tcg.id } })}
          >
            <View style={[styles.dot, { backgroundColor: g.tcg.color }]} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.tcgName}>{t(g.tcg.name)}</Text>
                <Text style={styles.tcgValue}>{formatPrice(g.value, 'EUR')}</Text>
              </View>
              {/* Avancement du jeu, comme pour les extensions : cartes différentes possédées / cartes des extensions commencées. */}
              <ProgressBar value={g.completion ?? 0} color={g.completion === 1 ? colors.success : g.tcg.color} height={5} />
              <Text style={styles.muted}>
                {[plural(g.cards, '{n} carte', '{n} cartes'), plural(g.unique, '{n} différente', '{n} différentes'), plural(g.sets, '{n} extension', '{n} extensions'), g.completion != null ? t('{owned}/{total} cartes · {pct}', { owned: g.owned, total: g.total, pct: percent(g.completion) }) : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.section}>{t('Mes cartes les plus chères')}</Text>
        <Pressable onPress={() => router.push('/collection/cards')} hitSlop={8}>
          <Text style={styles.link}>{t('Tout voir')}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {top.map((i) => (
          <Pressable
            key={i.key}
            style={styles.topCard}
            onPress={() => openItem(i)}
          >
            <View style={styles.topImg}>
              {i.image ? <Image source={i.image} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
              {i.qty > 1 ? <Text style={styles.topQty}>{t('×')}{i.qty}</Text> : null}
              {i.tcg !== 'custom' ? <LangBadge lang={i.lang} /> : null}
            </View>
            <Text style={styles.topName} numberOfLines={1}>{i.name}</Text>
            <Text style={styles.topPrice}>{formatPrice(i.price, 'EUR')}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable style={styles.allButton} onPress={() => router.push('/collection/cards')}>
        <Ionicons name="list" size={18} color={colors.text} />
        <Text style={styles.allButtonText}>{t('Toutes mes cartes ({n})', { n: total.unique })}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
      <Pressable style={styles.allButton} onPress={() => router.push('/collection/wishlist')}>
        <Ionicons name="heart-outline" size={18} color={colors.accent} />
        <Text style={styles.allButtonText}>{t('Mes cartes recherchées ({n})', { n: wishCount })}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
      <Pressable style={styles.allButton} onPress={() => router.push('/collection/custom')}>
        <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.allButtonText}>{t('Ajouter une autre carte')}</Text>
          <Text style={styles.muted}>{t('Carte hors catalogue, saisie à la main avec ta photo et ton prix (rangée dans « Autres »)')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 32, gap: 14 },
  hero: { backgroundColor: colors.surfaceAlt, borderRadius: radius, padding: 18, gap: 6, borderWidth: 1, borderColor: colors.accent, alignItems: 'center' },
  heroLabel: { color: colors.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  heroValue: { color: colors.accent, fontSize: 38, fontWeight: '800' },
  heroMeta: { color: colors.text, fontSize: 13, textAlign: 'center' },
  heroGain: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  updated: { color: colors.muted, fontSize: 13, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radius, padding: 14 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700' },
  tcgRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tcgName: { color: colors.text, fontWeight: '700', fontSize: 16 },
  tcgValue: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  muted: { color: colors.muted, fontSize: 12 },
  link: { color: colors.accent, fontWeight: '700' },
  topCard: { width: 110, gap: 3 },
  topImg: { width: 110, aspectRatio: 63 / 88, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  topQty: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.success, color: '#0B2A1C', fontWeight: '800', fontSize: 12, borderRadius: 10, paddingHorizontal: 6, overflow: 'hidden' },
  topName: { color: colors.text, fontSize: 12, fontWeight: '600' },
  topPrice: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  allButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius, padding: 14 },
  allButtonText: { color: colors.text, fontWeight: '700', flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 21 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 12, paddingHorizontal: 18, marginTop: 8 },
  ctaText: { color: '#1A1A1A', fontWeight: '800' },
  ctaSecondary: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border },
  ctaSecondaryText: { color: colors.text, fontWeight: '600', flexShrink: 1 },
});
