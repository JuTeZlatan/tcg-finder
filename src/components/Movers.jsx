// « Ma collection » : plus fortes hausses et baisses de prix des cartes possédées sur 7 jours
// (version de base des cartes du catalogue, d'après l'historique collecté chaque jour).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { getTcg, dataLang } from '../api';
import { useAsync } from '../lib/useAsync';
import { useSettings } from '../lib/settings';
import { changeOver, historyValues } from '../lib/priceHistory';
import { formatPrice, getUsdToEur } from '../lib/prices';
import { openItem } from '../lib/openItem';
import { locale, t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';

const DAYS = 7;
const SHOWN = 3;

async function weeklyChanges(items, source) {
  const fx = await getUsdToEur();
  const rows = await Promise.all(items
    .filter((i) => i.tcg !== 'custom' && !i.finish && i.setId)
    .map(async (i) => {
      const tcg = getTcg(i.tcg);
      if (!tcg?.getPriceHistory) return null;
      const h = await tcg.getPriceHistory(i.cardId, i.setId, dataLang(tcg, i.lang)).catch(() => null);
      const ch = changeOver(historyValues(h, fx, source), DAYS);
      return ch && ch.pct != null && ch.diff !== 0 ? { item: i, ...ch } : null;
    }));
  const moved = rows.filter(Boolean).sort((a, b) => b.pct - a.pct);
  return { up: moved.filter((r) => r.diff > 0).slice(0, SHOWN), down: moved.filter((r) => r.diff < 0).reverse().slice(0, SHOWN) };
}

export default function Movers({ items }) {
  const { settings } = useSettings();
  const keys = items.map((i) => i.key).join(','); // recalcul seulement quand les cartes possédées changent
  const res = useAsync(() => weeklyChanges(items, settings.priceSource), [keys, settings.priceSource]);
  const { up = [], down = [] } = res.data || {};
  if (!up.length && !down.length) return null;
  const row = (r) => (
    <Pressable key={r.item.key} style={styles.row} onPress={() => openItem(r.item)}>
      <View style={styles.thumb}>{r.item.image ? <Image source={r.item.image} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{r.item.name}</Text>
        <Text style={styles.muted} numberOfLines={1}>{formatPrice(r.from, 'EUR')} → {formatPrice(r.to, 'EUR')}</Text>
      </View>
      <Text style={[styles.pct, { color: r.diff >= 0 ? colors.success : colors.danger }]}>
        {r.diff >= 0 ? '▲' : '▼'} {Math.abs(r.pct).toLocaleString(locale(), { maximumFractionDigits: 1 })} %
      </Text>
    </Pressable>
  );
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('Variations de la semaine')}</Text>
      {up.length ? <Text style={styles.sub}>{t('Plus fortes hausses')}</Text> : null}
      {up.map(row)}
      {down.length ? <Text style={styles.sub}>{t('Plus fortes baisses')}</Text> : null}
      {down.map(row)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 36, height: 50, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  name: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 12 },
  pct: { fontWeight: '800' },
});
