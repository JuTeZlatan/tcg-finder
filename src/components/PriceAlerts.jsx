// Fiche d'une carte : ses alertes de prix (src/lib/priceAlerts.js) et la création d'une nouvelle alerte.
// Quatre règles : sous un montant, au-dessus d'un montant, baisse de N %, hausse de N %, avec des valeurs proposées
// d'après le prix actuel. Une alerte suit la version affichée (normale, foil…) et la langue de collection.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ALERT_KINDS, distanceOf, isPercentKind, ruleText, useAlerts } from '../lib/priceAlerts';
import { askNotificationPermission } from '../lib/notifications';
import { CURRENCY_SYMBOLS, formatPrice, fromStoredEur, getDisplayCurrency, toStoredEur } from '../lib/prices';
import { locale, t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';

const KIND_LABELS = { below: 'Passe sous', above: 'Passe au-dessus', drop: 'Baisse de', rise: 'Hausse de' };
const PERCENTS = [10, 20, 30, 50];
// Montants proposés : écart au prix actuel (−10 % … pour « sous », +10 % … pour « au-dessus »).
const STEPS = { below: [-0.1, -0.2, -0.3], above: [0.1, 0.25, 0.5] };
const round = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 100) / 100);

export default function PriceAlerts({ tcgId, lang, setId, card, finish, finishName, unitPrice }) {
  const { forCard, add, setPaused, remove } = useAlerts();
  const mine = forCard(tcgId, lang, card.id, finish);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('below');
  const [text, setText] = useState('');

  const percent = isPercentKind(kind);
  const presets = percent
    ? PERCENTS.map((p) => ({ label: `${p} %`, value: String(p) }))
    : unitPrice ? STEPS[kind].map((s) => {
      const v = round(fromStoredEur(unitPrice * (1 + s)));
      return { label: `${String(v).replace('.', ',')} ${CURRENCY_SYMBOLS[getDisplayCurrency()]}`, value: String(v).replace('.', ',') };
    }) : [];

  const create = () => {
    const v = parseFloat(text.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || (percent && v >= 100 && kind === 'drop')) return;
    add({
      tcg: tcgId, lang, cardId: card.id, setId: setId ?? null, finish: finish ?? null, finishName: finishName ?? null,
      name: card.name, image: card.image ?? null, number: card.number ?? null,
      kind, value: percent ? v : toStoredEur(v), price: unitPrice ?? null,
    });
    askNotificationPermission();
    setOpen(false);
    setText('');
  };

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Ionicons name="notifications-outline" size={18} color={colors.accent} />
        <Text style={styles.title}>{t('Alertes de prix')}</Text>
        <Pressable onPress={() => router.push('/collection/alerts')} hitSlop={8}>
          <Text style={styles.link}>{t('Toutes')}</Text>
        </Pressable>
      </View>

      {mine.map((a) => {
        const distance = distanceOf({ ...a, price: unitPrice ?? a.price });
        return (
          <View key={a.id} style={[styles.alert, a.paused && { opacity: 0.55 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rule}>{ruleText(a)}{a.finishName ? ` · ${a.finishName}` : ''}</Text>
              <Text style={[styles.status, a.triggered && !a.paused && { color: colors.success }]}>
                {a.paused ? t('En pause')
                  : a.triggered || distance === 0 ? t('Seuil atteint')
                    : distance != null ? t('Encore {pct} avant l’alerte', { pct: `${(distance * 100).toLocaleString(locale(), { maximumFractionDigits: 0 })} %` })
                      : t('En attente du prix')}
              </Text>
            </View>
            <Pressable onPress={() => setPaused(a.id, !a.paused)} hitSlop={8} accessibilityLabel={a.paused ? t('Réactiver') : t('Mettre en pause')}>
              <Ionicons name={a.paused ? 'play-outline' : 'pause-outline'} size={20} color={colors.muted} />
            </Pressable>
            <Pressable onPress={() => remove(a.id)} hitSlop={8} accessibilityLabel={t('Supprimer')}>
              <Ionicons name="trash-outline" size={20} color={colors.muted} />
            </Pressable>
          </View>
        );
      })}

      {open ? (
        <View style={styles.form}>
          <View style={styles.chips}>
            {ALERT_KINDS.map((k) => (
              <Pressable key={k} onPress={() => { setKind(k); setText(''); }} style={[styles.chip, kind === k && styles.chipActive]}>
                <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>{t(KIND_LABELS[k])}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              onSubmitEditing={create}
              keyboardType="decimal-pad"
              placeholder={percent ? '20' : unitPrice ? String(round(fromStoredEur(unitPrice))).replace('.', ',') : '—'}
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <Text style={styles.unit}>{percent ? '%' : CURRENCY_SYMBOLS[getDisplayCurrency()]}</Text>
          </View>
          {presets.length ? (
            <View style={styles.chips}>
              {presets.map((p) => (
                <Pressable key={p.label} onPress={() => setText(p.value)} style={styles.preset}>
                  <Text style={styles.presetText}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.hint}>
            {unitPrice != null ? `${t('Prix actuel : {price}', { price: formatPrice(unitPrice, 'EUR') })} · ` : ''}
            {percent
              ? t('Par rapport au prix d’aujourd’hui, puis à chaque alerte envoyée.')
              : t('Une notification te prévient dès que le seuil est franchi, même appli fermée.')}
          </Text>
          <View style={styles.row}>
            <Pressable style={styles.cancel} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>{t('Annuler')}</Text>
            </Pressable>
            <Pressable style={styles.save} onPress={create}>
              <Text style={styles.saveText}>{t('Créer l’alerte')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.add} onPress={() => setOpen(true)}>
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.addText}>{mine.length ? t('Ajouter une autre alerte') : t('Créer une alerte de prix')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontWeight: '700', flex: 1 },
  link: { color: colors.accent, fontWeight: '600' },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10 },
  rule: { color: colors.text, fontWeight: '700' },
  status: { color: colors.muted, fontSize: 12, marginTop: 2 },
  form: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#1A1A1A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, textAlign: 'right', fontSize: 16 },
  unit: { color: colors.text, fontSize: 16, width: 18 },
  preset: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.accent },
  presetText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  cancel: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.text, fontWeight: '600' },
  save: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10, backgroundColor: colors.accent },
  saveText: { color: '#1A1A1A', fontWeight: '800' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.accent, borderStyle: 'dashed' },
  addText: { color: colors.accent, fontWeight: '700' },
});
