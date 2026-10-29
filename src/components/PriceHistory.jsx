// Évolution du prix d'une carte (version de base) : courbe en barres et variations sur 7 j, 30 j, 90 j et 1 an,
// d'après l'historique collecté chaque jour. Même source de prix que le prix affiché (menu Réglages).
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAsync } from '../lib/useAsync';
import { useSettings } from '../lib/settings';
import { changeOver, historyValues } from '../lib/priceHistory';
import { formatPrice } from '../lib/prices';
import { locale, t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';

const RANGES = [[7, '7 j'], [30, '30 j'], [90, '90 j'], [365, '1 an']];

export default function PriceHistory({ tcg, cardId, setId, lang, usdToEur, finish }) {
  const { settings } = useSettings();
  const history = useAsync(
    () => (tcg.getPriceHistory ? tcg.getPriceHistory(cardId, setId, lang) : Promise.resolve(null)),
    [tcg.id, cardId, setId, lang],
  );
  const values = useMemo(() => (usdToEur ? historyValues(history.data, usdToEur, settings.priceSource) : []), [history.data, usdToEur, settings.priceSource]);
  const [range, setRange] = useState(30);
  if (!tcg.getPriceHistory || history.loading || !usdToEur) return null;

  const shown = values.filter((p) => Date.parse(p.date) >= Date.parse(values[values.length - 1]?.date) - range * 86400000);
  const fmtDate = (d) => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const max = Math.max(...shown.map((p) => p.value), 0.01);
  const min = Math.min(...shown.map((p) => p.value));

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t('Évolution du prix')}</Text>
      {finish ? <Text style={styles.muted}>{t('Historique de la version de base de la carte.')}</Text> : null}
      {values.length < 2 ? (
        <Text style={styles.muted}>{t('Le prix de cette carte est enregistré chaque jour : la courbe se remplira au fil des jours.')}</Text>
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
          <View style={styles.chart}>
            {shown.map((p) => (
              <View key={p.date} style={styles.barSlot}>
                <View style={[styles.bar, { height: `${Math.max(4, ((p.value - min * 0.9) / (max - min * 0.9 || 1)) * 100)}%` }]} />
              </View>
            ))}
          </View>
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

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 10 },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  changes: { flexDirection: 'row', gap: 6 },
  change: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  changeActive: { borderWidth: 1, borderColor: colors.accent },
  changeLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  changeLabelActive: { color: colors.accent },
  changeValue: { fontWeight: '800', fontSize: 14 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: colors.accent, borderRadius: 2, opacity: 0.85 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  axisText: { color: colors.muted, fontSize: 11 },
});
