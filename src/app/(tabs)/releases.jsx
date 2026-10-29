// Onglet « Sorties » : calendrier des extensions de tous les jeux (6 prochains mois et 30 derniers jours).
// Filtres par jeu ou « Mes jeux » (ceux de la collection), sorties suivies (étoile) en tête, accès direct à
// l'extension quand ses cartes sont déjà dans l'appli, recherches de précommande.
import { useMemo, useRef, useState } from 'react';
import { router, useScrollToTop } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { TCGS, getTcg } from '../../api';
import { GAME_ICONS } from '../../lib/gameIcons';
import { useAsync } from '../../lib/useAsync';
import { useCollection } from '../../lib/collection';
import { useSettings } from '../../lib/settings';
import { useCardLang } from '../../lib/cardLang';
import { askNotificationPermission } from '../../lib/notifications';
import { SOON_DAYS, countdown, daysUntil, findSetForRelease, loadReleases, localizedReleaseNames, releaseLinks } from '../../lib/releases';
import { colors, radius } from '../../lib/theme';
import { locale, t } from '../../lib/i18n';

const MONTH = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
const FULL_DATE = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });

export default function ReleasesScreen() {
  const data = useAsync(() => loadReleases(), []);
  const { items } = useCollection();
  const { settings, update } = useSettings();
  const followed = useMemo(() => new Set(settings.followed || []), [settings.followed]);
  const [filter, setFilter] = useState('all'); // 'all' | 'mine' | id d'un jeu
  const [showRecent, setShowRecent] = useState(false);
  const [open, setOpen] = useState(null); // clé de la sortie dépliée
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  const myGames = useMemo(() => new Set(items.map((i) => i.tcg)), [items]);
  // Nom dans la langue des cartes quand l'extension existe dans cette langue, sinon nom anglais.
  const { cardLang } = useCardLang();
  const names = useAsync(() => localizedReleaseNames(data.data || [], cardLang), [data.data, cardLang]);
  const all = useMemo(
    () => (data.data || []).map((r) => ({ ...r, name: names.data?.get(r.key) || r.name, days: daysUntil(r.date) })),
    [data.data, names.data],
  );
  const visible = all.filter((r) => (filter === 'all' ? true : filter === 'mine' ? myGames.has(r.tcg) : r.tcg === filter));
  const upcoming = visible.filter((r) => r.days >= 0);
  const recent = visible.filter((r) => r.days < 0).reverse();
  const mine = upcoming.filter((r) => followed.has(r.key));
  const soon = upcoming.filter((r) => r.days <= SOON_DAYS).length;
  const gamesWithReleases = TCGS.filter((tg) => all.some((r) => r.tcg === tg.id && r.days >= 0));

  // Frise : sorties à venir regroupées par mois (les sorties suivies sont déjà en tête de page).
  const months = [];
  for (const r of upcoming) {
    if (followed.has(r.key)) continue;
    const m = MONTH(r.date);
    if (!months.length || months[months.length - 1].month !== m) months.push({ month: m, list: [] });
    months[months.length - 1].list.push(r);
  }

  const toggleFollow = (key) => {
    const next = new Set(followed);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      askNotificationPermission(); // pour le rappel du jour de sortie
    }
    // Ne garde que les sorties encore listées (les anciennes disparaissent d'elles-mêmes).
    update({ followed: [...next].filter((k) => all.some((r) => r.key === k)) });
  };

  const row = (r) => (
    <ReleaseRow
      key={r.key}
      release={r}
      followed={followed.has(r.key)}
      expanded={open === r.key}
      onToggle={() => setOpen(open === r.key ? null : r.key)}
      onFollow={() => toggleFollow(r.key)}
    />
  );

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.page}>
      {data.loading ? <ActivityIndicator color={colors.accent} /> : null}

      {/* En bref */}
      <View style={styles.stats}>
        <Stat value={upcoming.length} label={t('à venir')} />
        <Stat value={soon} label={t('dans 2 semaines')} accent />
        <Stat value={mine.length} label={t('suivies')} />
      </View>

      {/* Filtres */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <Chip label={t('Tous')} active={filter === 'all'} onPress={() => setFilter('all')} />
        {myGames.size ? <Chip label={t('Mes jeux')} icon="albums" active={filter === 'mine'} onPress={() => setFilter('mine')} /> : null}
        {gamesWithReleases.map((tg) => (
          <Chip key={tg.id} label={tg.name} image={GAME_ICONS[tg.id]} active={filter === tg.id} onPress={() => setFilter(tg.id)} />
        ))}
      </ScrollView>

      {mine.length ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.section}>{t('Mes sorties suivies')}</Text>
          {mine.map(row)}
        </View>
      ) : null}

      {months.map(({ month, list }) => (
        <View key={month} style={{ gap: 8 }}>
          <Text style={styles.section}>{month.charAt(0).toUpperCase() + month.slice(1)}</Text>
          {list.map(row)}
        </View>
      ))}
      {!data.loading && !upcoming.length ? <Text style={styles.hint}>{t('Aucune sortie annoncée pour ce filtre.')}</Text> : null}

      {recent.length ? (
        <View style={{ gap: 8 }}>
          <Pressable style={styles.recentHead} onPress={() => setShowRecent((v) => !v)}>
            <Text style={styles.section}>{t('Sorties récentes ({n})', { n: recent.length })}</Text>
            <Ionicons name={showRecent ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
          </Pressable>
          {showRecent ? recent.map(row) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function ReleaseRow({ release: r, followed, expanded, onToggle, onFollow }) {
  const tcg = getTcg(r.tcg);
  const { cardLang } = useCardLang();
  const isSoon = r.days >= 0 && r.days <= SOON_DAYS;
  const [imageFailed, setImageFailed] = useState(false); // visuel introuvable : icône du jeu
  // Extension déjà dans l'appli ? (cherchée seulement quand la sortie est dépliée)
  const set = useAsync(() => (expanded ? findSetForRelease(r, cardLang) : Promise.resolve(null)), [r.key, expanded, cardLang]);

  return (
    <View style={[styles.card, isSoon && styles.cardSoon, r.days === 0 && styles.cardToday]}>
      <Pressable style={styles.cardMain} onPress={onToggle}>
        <View style={styles.visual}>
          {r.image && !imageFailed ? (
            <Image source={r.image} style={styles.visualImg} contentFit="contain" tintColor={r.imageTint ? colors.text : undefined} onError={() => setImageFailed(true)} />
          ) : (
            <Image source={GAME_ICONS[r.tcg]} style={styles.visualIcon} contentFit="contain" />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.gameLine}>
            <Image source={GAME_ICONS[r.tcg]} style={styles.gameIcon} contentFit="contain" />
            <Text style={styles.game}>{tcg?.name}{r.code ? ` · ${r.code}` : ''}</Text>
          </View>
          <Text style={styles.name} numberOfLines={2}>{r.name}</Text>
          <Text style={[styles.when, isSoon && styles.whenSoon]}>{countdown(r.days)} · {FULL_DATE(r.date)}</Text>
        </View>
        <Pressable onPress={onFollow} hitSlop={10} accessibilityLabel={followed ? t('Ne plus suivre') : t('Suivre cette sortie')}>
          <Ionicons name={followed ? 'star' : 'star-outline'} size={22} color={followed ? colors.accent : colors.muted} />
        </Pressable>
      </Pressable>

      {expanded ? (
        <View style={styles.details}>
          {set.loading ? <ActivityIndicator color={colors.accent} /> : set.data ? (
            <Pressable
              style={styles.primary}
              onPress={() => router.navigate({ pathname: '/(tabs)/(explore)/[tcg]/set/[setId]', params: { tcg: set.data.tcg, setId: set.data.setId, name: set.data.name } })}
            >
              <Ionicons name="albums-outline" size={18} color="#1A1A1A" />
              <Text style={styles.primaryText}>{t('Voir les cartes de l’extension')}</Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>{t('Les cartes ne sont pas encore publiées : elles apparaîtront ici dès que les sources les mettront en ligne.')}</Text>
          )}
          <Text style={styles.label}>{r.days >= 0 ? t('Précommander / comparer') : t('Acheter / comparer')}</Text>
          <View style={styles.linkRow}>
            {releaseLinks(r).map((l) => (
              <Pressable key={l.key} style={styles.link} onPress={() => Linking.openURL(l.url)}>
                <Text style={styles.linkText}>{l.label} ↗</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ value, label, accent }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Chip({ label, active, onPress, image, icon }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      {image ? <Image source={image} style={styles.chipIcon} contentFit="contain" /> : null}
      {icon ? <Ionicons name={icon} size={14} color={active ? '#1A1A1A' : colors.muted} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16, paddingBottom: 32 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius, paddingVertical: 12, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 12 },
  filters: { gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent },
  chipIcon: { width: 16, height: 16, borderRadius: 3 },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#1A1A1A' },
  section: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { backgroundColor: colors.surface, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: 'transparent' },
  cardSoon: { borderColor: colors.accent },
  cardToday: { backgroundColor: colors.surfaceAlt },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  visual: { width: 56, height: 72, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  visualImg: { width: '90%', height: '90%' },
  visualIcon: { width: 34, height: 34 },
  gameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gameIcon: { width: 14, height: 14, borderRadius: 3 },
  game: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  when: { color: colors.muted, fontSize: 12 },
  whenSoon: { color: colors.accent, fontWeight: '700' },
  details: { borderTopWidth: 1, borderTopColor: colors.border, padding: 12, gap: 10 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 12 },
  primaryText: { color: '#1A1A1A', fontWeight: '800' },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  linkText: { color: colors.accent, fontWeight: '700' },
});
