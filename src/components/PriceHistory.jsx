// Évolution du prix d'une carte (version de base) : courbe à parcourir au doigt et variations sur 7 j, 30 j, 90 j, 1 an et depuis
// le premier prix connu, d'après l'historique collecté chaque jour (même source de prix que le prix affiché).
// Tant que cet historique est trop court : évolution récente d'après les moyennes Cardmarket (30 j, 7 j, 1 j, tendance).
import { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useAsync } from '../lib/useAsync';
import { useSettings } from '../lib/settings';
import { changeOver, historyValues } from '../lib/priceHistory';
import { formatPrice } from '../lib/prices';
import { locale, t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';

const RANGES = [[7, '7 j'], [30, '30 j'], [90, '90 j'], [365, '1 an'], [Infinity, 'Tout']];
// Moyennes Cardmarket de la version choisie, de la plus ancienne à la plus récente.
const RECENT = [['avg30', 'Moy. 30 j'], ['avg7', 'Moy. 7 j'], ['avg1', 'Moy. 1 j'], ['trend', 'Tendance']];
function recentCardmarket(prices, finish) {
  const cm = (prices || []).find((p) => p.source === 'Cardmarket' && !p.versions);
  const all = cm?.items || [];
  // Version de base : prix sans version précise, sinon la version que Cardmarket cote (ex. holo seulement).
  const variant = finish ?? (all.some((i) => !i.variant) ? null : all[0]?.variant ?? null);
  const items = all.filter((i) => (i.variant ?? null) === variant);
  return RECENT.map(([label, name]) => ({ name, value: items.find((i) => i.label === label)?.value })).filter((r) => r.value != null);
}

export default function PriceHistory({ tcg, cardId, setId, lang, usdToEur, finish, prices }) {
  const { settings } = useSettings();
  const history = useAsync(
    () => (tcg.getPriceHistory ? tcg.getPriceHistory(cardId, setId, lang) : Promise.resolve(null)),
    [tcg.id, cardId, setId, lang],
  );
  const values = useMemo(() => (usdToEur ? historyValues(history.data, usdToEur, settings.priceSource) : []), [history.data, usdToEur, settings.priceSource]);
  const [range, setRange] = useState(Infinity);
  if (history.loading || !usdToEur) return null;
  const recent = recentCardmarket(prices, finish);
  if (values.length < 2 && recent.length < 2) return null;

  const shown = range === Infinity ? values : values.filter((p) => Date.parse(p.date) >= Date.parse(values[values.length - 1]?.date) - range * 86400000);
  const fmtDate = (d) => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const max = Math.max(...shown.map((p) => p.value), 0.01);
  const min = Math.min(...shown.map((p) => p.value));

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t('Évolution du prix')}</Text>
      {finish ? <Text style={styles.muted}>{t('Historique de la version de base de la carte.')}</Text> : null}
      {values.length < 2 ? (
        <RecentTrend recent={recent} since={values[0]?.date} />
      ) : (
        <>
          <View style={styles.changes}>
            {RANGES.map(([days, label]) => {
              const ch = changeOver(values, days);
              const active = range === days;
              return (
                <Pressable key={days} style={[styles.change, active && styles.changeActive]} onPress={() => setRange(days)}>
                  <Text style={[styles.changeLabel, active && styles.changeLabelActive]}>{t(label)}</Text>
                  <Text style={[styles.changeValue, { color: !ch ? colors.muted : ch.diff >= 0 ? colors.success : colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>
                    {ch?.pct != null ? `${ch.pct >= 0 ? '+' : ''}${ch.pct.toLocaleString(locale(), { maximumFractionDigits: 1 })} %` : '—'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <PriceCurve key={range} points={shown} />
          <View style={styles.axis}>
            <Text style={styles.axisText}>{fmtDate(shown[0].date)}</Text>
            <Text style={styles.axisText}>{t('min {amount}', { amount: formatPrice(min, 'EUR') })} · {t('max {amount}', { amount: formatPrice(max, 'EUR') })}</Text>
            <Text style={styles.axisText}>{fmtDate(shown[shown.length - 1].date)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

// Courbe du prix : on glisse le doigt tout le long, le prix et la date du jour touché s'affichent au-dessus
// (sans toucher : le dernier prix connu).
const CHART_H = 140;
const PAD = 10;
function PriceCurve({ points }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(null);
  const n = points.length;
  const values = points.map((p) => p.value);
  // Échelle verticale d'au moins ±20 % autour du prix moyen : 0,12 → 0,14 € reste une petite variation à l'écran,
  // pas une flambée sur toute la hauteur.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  const span = Math.max(max - min, mid * 0.4, 0.01);
  const lo = mid - span / 2;
  const x = (i) => PAD + (n > 1 ? (i / (n - 1)) * (width - PAD * 2) : (width - PAD * 2) / 2);
  const y = (v) => PAD + (1 - (v - lo) / span) * (CHART_H - PAD * 2);
  const coords = points.map((p, i) => [x(i), y(p.value)]);
  // Courbe lissée (segments de Bézier entre les points, sans dépasser les vrais prix).
  const line = coords.reduce((d, [px, py], i) => {
    if (!i) return `M${px},${py}`;
    const [qx, qy] = coords[i - 1];
    const mx = (qx + px) / 2;
    return `${d} C${mx},${qy} ${mx},${py} ${px},${py}`;
  }, '');
  const area = n ? `${line} L${coords[n - 1][0]},${CHART_H} L${coords[0][0]},${CHART_H} Z` : '';

  // Index du point sous le doigt (le plus proche horizontalement).
  const pick = (px) => setIndex(Math.max(0, Math.min(n - 1, Math.round(((px - PAD) / Math.max(1, width - PAD * 2)) * (n - 1)))));
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // le défilement de la page ne reprend pas le geste
    onPanResponderGrant: (e) => pick(e.nativeEvent.locationX),
    onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
    onPanResponderRelease: () => setIndex(null),
    onPanResponderTerminate: () => setIndex(null),
  }), [width, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = index ?? n - 1;
  const p = points[sel];
  const first = points[0]?.value;
  const diff = first ? ((p.value - first) / first) * 100 : null;
  const [cx, cy] = coords[sel] || [0, 0];
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.readout}>
        <Text style={styles.readoutPrice}>{formatPrice(p.value, 'EUR')}</Text>
        {diff != null && sel > 0 ? (
          <Text style={[styles.readoutDiff, { color: diff >= 0 ? colors.success : colors.danger }]}>
            {diff >= 0 ? '+' : ''}{diff.toLocaleString(locale(), { maximumFractionDigits: 1 })} %
          </Text>
        ) : null}
        <Text style={styles.readoutDate}>{new Date(p.date).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      </View>
      <View style={{ height: CHART_H }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        {width ? (
          <Svg width={width} height={CHART_H} pointerEvents="none">
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#fill)" />
            <Path d={line} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {index != null ? <Line x1={cx} y1={0} x2={cx} y2={CHART_H} stroke={colors.muted} strokeWidth={1} strokeDasharray="4 4" /> : null}
            <Circle cx={cx} cy={cy} r={index != null ? 6 : 4} fill={colors.accent} stroke={colors.surface} strokeWidth={2} />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

// Historique encore trop court : moyennes Cardmarket du dernier mois (barres), variation sur 30 jours.
function RecentTrend({ recent, since }) {
  if (recent.length < 2) {
    return <Text style={styles.muted}>{t('Le prix de cette carte est enregistré chaque jour : la courbe se remplira au fil des jours.')}</Text>;
  }
  const max = Math.max(...recent.map((r) => r.value), 0.01);
  const first = recent[0].value;
  const last = recent[recent.length - 1].value;
  const pct = first ? ((last - first) / first) * 100 : null;
  return (
    <>
      <Text style={styles.muted}>{t('Évolution sur le dernier mois (moyennes de vente Cardmarket) :')}</Text>
      {pct != null ? (
        <Text style={[styles.recentPct, { color: pct >= 0 ? colors.success : colors.danger }]}>
          {pct >= 0 ? '▲ +' : '▼ '}{pct.toLocaleString(locale(), { maximumFractionDigits: 1 })} %
        </Text>
      ) : null}
      <View style={styles.recentRow}>
        {recent.map((r) => (
          <View key={r.name} style={styles.recentSlot}>
            <Text style={styles.recentValue} numberOfLines={1} adjustsFontSizeToFit>{formatPrice(r.value, 'EUR')}</Text>
            <View style={styles.recentBarBox}>
              <View style={[styles.bar, { height: `${Math.max(6, (r.value / max) * 100)}%` }]} />
            </View>
            <Text style={styles.axisText} numberOfLines={1}>{t(r.name)}</Text>
          </View>
        ))}
      </View>
      {since ? <Text style={styles.axisText}>{t('Courbe jour par jour enregistrée depuis le {date}.', { date: new Date(since).toLocaleDateString(locale()) })}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  recentPct: { fontWeight: '800', fontSize: 16 },
  recentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  recentSlot: { flex: 1, alignItems: 'center', gap: 4 },
  recentValue: { color: colors.text, fontWeight: '700', fontSize: 12 },
  recentBarBox: { width: '70%', height: 70, justifyContent: 'flex-end' },
  box: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 10 },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  changes: { flexDirection: 'row', gap: 6 },
  change: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  changeActive: { borderWidth: 1, borderColor: colors.accent },
  changeLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  changeLabelActive: { color: colors.accent },
  changeValue: { fontWeight: '800', fontSize: 14 },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  readoutPrice: { color: colors.text, fontWeight: '800', fontSize: 20 },
  readoutDiff: { fontWeight: '700', fontSize: 13 },
  readoutDate: { color: colors.muted, fontSize: 12, marginLeft: 'auto' },
  bar: { backgroundColor: colors.accent, borderRadius: 2, opacity: 0.85 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  axisText: { color: colors.muted, fontSize: 11 },
});
