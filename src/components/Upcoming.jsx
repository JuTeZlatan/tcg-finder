// « Prochaines sorties » de l'accueil : extensions annoncées pour tous les jeux (collectées chaque jour), avec compte
// à rebours. Celles qui sortent dans moins de 2 semaines sont mises en avant. Repliée au-delà des 4 premières.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { memo } from '../api/http';
import { loadBundledFile } from '../api/bundledData';
import { loadData } from '../api/dataSource';
import { getTcg } from '../api';
import { GAME_ICONS } from '../lib/gameIcons';
import { useAsync } from '../lib/useAsync';
import { colors, radius } from '../lib/theme';

const SOON_DAYS = 14;
const DAY = 86400000;

const loadUpcoming = memo(async () => {
  try {
    return await loadData(`upcoming.json`, () => loadBundledFile('upcoming'));
  } catch {
    return [];
  }
});

const daysUntil = (date) => Math.ceil((Date.parse(date) - Date.now()) / DAY);
const countdown = (days) => (days <= 0 ? 'Aujourd’hui' : days === 1 ? 'Demain' : `Dans ${days} jours`);
const fmtDate = (date) => new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export default function Upcoming() {
  const data = useAsync(() => loadUpcoming(), []);
  const [expanded, setExpanded] = useState(false);
  // Sorties encore à venir (les données intégrées à l'appli peuvent dater de quelques jours).
  const list = (data.data || []).filter((u) => daysUntil(u.date) >= 0);
  if (!list.length) return null;
  const shown = expanded ? list : list.slice(0, 4);
  const soon = list.filter((u) => daysUntil(u.date) <= SOON_DAYS).length;

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Text style={styles.title}>Prochaines sorties</Text>
        {soon ? <Text style={styles.soonBadge}>{soon} dans les 2 semaines</Text> : null}
      </View>
      {shown.map((u) => {
        const days = daysUntil(u.date);
        const isSoon = days <= SOON_DAYS;
        return (
          <View key={`${u.tcg}-${u.name}-${u.date}`} style={[styles.row, isSoon && styles.rowSoon]}>
            <Image source={GAME_ICONS[u.tcg]} style={styles.icon} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
              <Text style={styles.meta}>{getTcg(u.tcg)?.name} · {fmtDate(u.date)}</Text>
            </View>
            <Text style={[styles.when, isSoon && styles.whenSoon]}>{countdown(days)}</Text>
          </View>
        );
      })}
      {list.length > 4 ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
          <Text style={styles.more}>{expanded ? 'Voir moins' : `Voir les ${list.length} sorties annoncées`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  soonBadge: { color: '#1A1A1A', backgroundColor: colors.accent, fontSize: 11, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10 },
  rowSoon: { backgroundColor: colors.surfaceAlt },
  icon: { width: 30, height: 30, borderRadius: 6 },
  name: { color: colors.text, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 12 },
  when: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  whenSoon: { color: colors.accent },
  more: { color: colors.accent, fontWeight: '700', textAlign: 'center', paddingTop: 4 },
});
