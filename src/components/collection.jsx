// Briques visuelles de la collection : chiffres clés, barres, graphique, bouton d'ajout rapide, bloc de la fiche.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTcg, dataLang } from '../api';
import { useCollection, itemKey, ownedQty } from '../lib/collection';
import { CURRENCY_SYMBOLS, averagePrice, formatPrice, fromStoredEur, getDisplayCurrency, getUsdToEur, toStoredEur } from '../lib/prices';
import { defaultFinish, finishLabel, finishesOf, isThinPrice, storedFinish } from '../lib/finishes';
import { useAsync } from '../lib/useAsync';
import { colors, radius } from '../lib/theme';
import { useSettings } from '../lib/settings';
import { locale, t } from '../lib/i18n';

// Badge de langue posé sur l'image d'une carte de la collection (chaque langue est un exemplaire distinct).
export function LangBadge({ lang }) {
  if (!lang) return null;
  return <Text style={styles.langOnImage}>{String(lang).toUpperCase()}</Text>;
}

export function StatTile({ label, value, sub, accent }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export function ProgressBar({ value, color = colors.accent, height = 6 }) {
  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, backgroundColor: color, height }]} />
    </View>
  );
}

// Évolution de la valeur totale (un point par jour, 30 derniers jours affichés).
export function ValueChart({ history }) {
  useSettings(); // réaffiche les prix quand la devise (ou le taux du jour) change
  const points = history.slice(-30);
  if (points.length < 2) {
    return <Text style={styles.chartEmpty}>{t('L’évolution de la valeur s’affichera ici au fil des jours.')}</Text>;
  }
  const max = Math.max(...points.map((p) => p.value), 0.01);
  const min = Math.min(...points.map((p) => p.value));
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const diff = last - first;
  const fmtDate = (d) => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.chartHead}>
        <Text style={styles.chartTitle}>{t('Évolution')}</Text>
        <Text style={[styles.chartDiff, { color: diff >= 0 ? colors.success : colors.danger }]}>
          {diff >= 0 ? '+' : ''}{t('{amount} depuis le {date}', { amount: formatPrice(diff, 'EUR'), date: fmtDate(points[0].date) })}
        </Text>
      </View>
      <View style={styles.chart}>
        {points.map((p) => (
          <View key={p.date} style={styles.barSlot}>
            <View style={[styles.bar, { height: `${Math.max(4, ((p.value - min * 0.9) / (max - min * 0.9 || 1)) * 100)}%` }]} />
          </View>
        ))}
      </View>
      <View style={styles.chartHead}>
        <Text style={styles.chartAxis}>{fmtDate(points[0].date)}</Text>
        <Text style={styles.chartAxis}>{t('max {amount}', { amount: formatPrice(max, 'EUR') })}</Text>
        <Text style={styles.chartAxis}>{fmtDate(points[points.length - 1].date)}</Text>
      </View>
    </View>
  );
}

// Fenêtre « Quelle version ? » à l'ajout d'une carte qui existe en plusieurs versions (normale, foil, reverse,
// 1re édition…) : une ligne par version avec son prix moyen, la valeur en collection en dépend.
function FinishChooser({ request, onClose }) {
  useSettings(); // réaffiche les prix quand la devise (ou le taux du jour) change
  const fx = useAsync(() => getUsdToEur(), []);
  if (!request) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{t('Quelle version as-tu ?')}</Text>
        <Text style={styles.sheetSub} numberOfLines={2}>{request.title} · {t('le prix dépend de la version')}</Text>
        {finishesOf(request.prices).map((f) => {
          const stored = storedFinish(request.prices, f);
          const avg = fx.data ? averagePrice(request.prices, fx.data, { finish: stored }) : null;
          return (
            <Pressable
              key={f}
              style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}
              onPress={() => {
                onClose();
                request.onPick(stored, avg ? Math.round(avg.value * 100) / 100 : null, stored ? finishLabel(request.prices, f) : null);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowText}>{finishLabel(request.prices, f)}</Text>
                {isThinPrice(request.prices, f) ? <Text style={styles.sheetRowNote}>{t('Peu de ventes : prix indicatif')}</Text> : null}
              </View>
              <Text style={styles.sheetRowPrice}>{avg ? formatPrice(avg.value, 'EUR') : '—'}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.sheetCancel} onPress={onClose}>
          <Text style={styles.sheetCancelText}>{t('Annuler')}</Text>
        </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// `ask(titre, prix, onPick)` : demande la version si la carte en a plusieurs, sinon ajoute directement
// (onPick(null, null)). `chooser` est la fenêtre à afficher dans l'écran.
export function useFinishChoice() {
  const [request, setRequest] = useState(null);
  const ask = useCallback((title, prices, onPick) => {
    if (finishesOf(prices).length < 2) onPick(null, null);
    else setRequest({ title, prices, onPick });
  }, []);
  const chooser = <FinishChooser request={request} onClose={() => setRequest(null)} />;
  return { ask, chooser };
}

// Bouton « + » sur une vignette de carte (recherche, extension) avec la quantité déjà possédée.
// La fiche est chargée pour connaître ses versions : s'il y en a plusieurs, on demande laquelle.
// `version` ({ finish, label }) : vignette d'une version précise (master set), ajoutée directement.
export function QuickAdd({ tcgId, lang, setId, card, version = null }) {
  const { items, add } = useCollection();
  const { ask, chooser } = useFinishChoice();
  const [busy, setBusy] = useState(false);
  const qty = version
    ? items.filter((i) => i.tcg === tcgId && i.cardId === card.id && i.lang === lang && (i.finish ?? null) === (version.finish ?? null)).reduce((n, i) => n + i.qty, 0)
    : ownedQty(items, tcgId, card.id, lang);
  const ownSetId = setId ?? card.setId ?? null;
  const onPress = async () => {
    const addWith = (finish, price, label) => add(tcgId, lang, ownSetId, { ...card, finish, finishName: label, price: price ?? card.price }, 1);
    if (version) return addWith(version.finish ?? null, null, version.finish ? version.label : null);
    const tcg = getTcg(tcgId);
    setBusy(true);
    const full = await tcg.getCard(card.id, ownSetId, dataLang(tcg, lang)).catch(() => null);
    setBusy(false);
    if (full) ask(card.name, full.prices, addWith);
    else addWith(null, null);
  };
  return (
    <>
      <Pressable
        hitSlop={8}
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [styles.quick, qty > 0 && styles.quickOwned, pressed && { transform: [{ scale: 0.9 }] }]}
        accessibilityLabel={t('Ajouter {0} à ma collection', { 0: card.name })}
      >
        {busy ? <ActivityIndicator size="small" color="#1A1A1A" />
          : qty > 0 ? <Text style={styles.quickText}>{t('×')}{qty}</Text> : <Ionicons name="add" size={18} color="#1A1A1A" />}
      </Pressable>
      {chooser}
    </>
  );
}

// Choix de la version d'une carte (normale, foil, reverse…) quand il en existe plusieurs.
// `prices` : lignes de prix de la carte ; `ownedFinishes` : versions déjà en collection (marquées d'un point).
export function FinishPicker({ prices, value, onChange, ownedFinishes = [] }) {
  const finishes = finishesOf(prices);
  if (finishes.length < 2) return null;
  const current = value || defaultFinish(finishes);
  return (
    <View style={styles.finishBox}>
      <Text style={styles.editorLabel}>{t('Version')}</Text>
      <View style={styles.finishRow}>
        {finishes.map((f) => (
          <Pressable key={f} onPress={() => onChange(f)} style={[styles.finishChip, current === f && styles.finishChipActive]}>
            <Text style={[styles.finishText, current === f && styles.finishTextActive]}>
              {finishLabel(prices, f)}{ownedFinishes.includes(f) ? ' •' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Bloc « Ma collection » de la fiche d'une carte (`finish` : version choisie, null = version de référence).
// À l'ajout, la version est demandée ; `onFinishChosen` reporte le choix sur la fiche.
export function CollectionEditor({ tcgId, lang, setId, card, unitPrice, finish = null, onFinishChosen }) {
  useSettings(); // réaffiche les prix quand la devise (ou le taux du jour) change
  const { items, add, setQty, setPurchase } = useCollection();
  const { ask, chooser } = useFinishChoice();
  const item =
    items.find((i) => i.key === itemKey(tcgId, lang, setId ?? card.setId ?? null, card.id, finish)) ||
    items.find((i) => i.tcg === tcgId && i.lang === lang && i.cardId === card.id && (i.finish ?? null) === finish && (!setId || !i.setId || i.setId === setId));
  const key = item?.key ?? itemKey(tcgId, lang, setId ?? card.setId ?? null, card.id, finish);
  const otherLangs = items.filter((i) => i.tcg === tcgId && i.cardId === card.id && i.lang !== lang);
  // Prix d'achat enregistré en euros, saisi et affiché dans la devise choisie.
  const fmtPurchase = (v) => (v != null ? String(fromStoredEur(v)).replace('.', ',') : '');
  const [purchase, setPurchaseText] = useState(fmtPurchase(item?.purchase));
  // Prix d'achat modifié ailleurs (autre écran) : on resynchronise le champ.
  const [syncedPurchase, setSyncedPurchase] = useState(item?.purchase);
  if (item?.purchase !== syncedPurchase) {
    setSyncedPurchase(item?.purchase);
    setPurchaseText(fmtPurchase(item?.purchase));
  }

  const summary = { id: card.id, name: card.name, number: card.number, image: card.image, setName: card.setName, price: unitPrice, finish };
  const savePurchase = () => {
    const v = parseFloat(purchase.replace(',', '.'));
    setPurchase(key, Number.isFinite(v) && v >= 0 ? toStoredEur(v) : null);
  };

  return (
    <View style={styles.editor}>
      {chooser}
      <View style={styles.editorHead}>
        <Ionicons name="albums" size={18} color={colors.accent} />
        <Text style={styles.editorTitle}>{t('Ma collection')}</Text>
        {finish ? <Text style={styles.langBadge} numberOfLines={1}>{finishLabel(card.prices, finish)}</Text> : null}
        <Text style={styles.langBadge}>{lang.toUpperCase()}</Text>
      </View>
      {!item ? (
        <Pressable
          style={styles.addButton}
          onPress={() => ask(card.name, card.prices || [], (chosen, price, label) => {
            add(tcgId, lang, setId ?? card.setId ?? null, { ...summary, finish: chosen, finishName: label, price: price ?? unitPrice }, 1);
            onFinishChosen?.(chosen);
          })}
        >
          <Ionicons name="add-circle" size={20} color="#1A1A1A" />
          <Text style={styles.addButtonText}>{t('Ajouter à ma collection')}</Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.qtyRow}>
            <Text style={styles.editorLabel}>{t('Quantité')}</Text>
            <View style={styles.stepper}>
              <Pressable style={styles.stepBtn} onPress={() => setQty(key, item.qty - 1)} hitSlop={6}>
                <Ionicons name={item.qty === 1 ? 'trash-outline' : 'remove'} size={18} color={colors.text} />
              </Pressable>
              <Text style={styles.qty}>{item.qty}</Text>
              <Pressable style={styles.stepBtn} onPress={() => setQty(key, item.qty + 1)} hitSlop={6}>
                <Ionicons name="add" size={18} color={colors.text} />
              </Pressable>
            </View>
          </View>
          <View style={styles.qtyRow}>
            <Text style={styles.editorLabel}>{t('Valeur de mes exemplaires')}</Text>
            <Text style={styles.editorValue}>{unitPrice != null ? formatPrice(unitPrice * item.qty, 'EUR') : '—'}</Text>
          </View>
          <View style={styles.qtyRow}>
            <Text style={styles.editorLabel}>{t('Prix d’achat (par carte)')}</Text>
            <View style={styles.purchaseBox}>
              <TextInput
                style={styles.purchaseInput}
                value={purchase}
                onChangeText={setPurchaseText}
                onEndEditing={savePurchase}
                onSubmitEditing={savePurchase}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.editorLabel}>{CURRENCY_SYMBOLS[getDisplayCurrency()]}</Text>
            </View>
          </View>
          {item.purchase != null && unitPrice != null ? (
            <Text style={[styles.gain, { color: unitPrice >= item.purchase ? colors.success : colors.danger }]}>
              {unitPrice >= item.purchase ? t('Plus-value') : t('Moins-value')} : {formatPrice((unitPrice - item.purchase) * item.qty, 'EUR')}
            </Text>
          ) : null}
          <Text style={styles.editorHint}>{t('Ajoutée le {date}', { date: new Date(item.addedAt).toLocaleDateString(locale()) })}</Text>
        </>
      )}
      {otherLangs.length ? (
        <Text style={styles.editorHint}>
          {t('Tu as aussi : {list}.', { list: otherLangs.map((i) => `${i.qty} × ${i.lang.toUpperCase()}`).join(', ') })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, minWidth: 100, backgroundColor: colors.surface, borderRadius: radius, padding: 12, gap: 2 },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  statSub: { color: colors.muted, fontSize: 11 },
  track: { backgroundColor: colors.border, borderRadius: 999, overflow: 'hidden', width: '100%' },
  fill: { borderRadius: 999 },
  chartEmpty: { color: colors.muted, fontSize: 13 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  chartDiff: { fontWeight: '700', fontSize: 13 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 3 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: colors.accent, borderRadius: 3, opacity: 0.85 },
  chartAxis: { color: colors.muted, fontSize: 11 },
  quick: {
    position: 'absolute', top: 6, right: 6, minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 6,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, elevation: 3,
  },
  quickOwned: { backgroundColor: colors.success },
  quickText: { color: '#0B2A1C', fontWeight: '800', fontSize: 13 },
  editor: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  editorHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editorTitle: { color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 },
  langBadge: { color: colors.muted, borderColor: colors.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, fontSize: 12, fontWeight: '700' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 12 },
  addButtonText: { color: '#1A1A1A', fontWeight: '800', fontSize: 15 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  editorLabel: { color: colors.muted },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surfaceAlt, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, gap: 10,
  },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sheetSub: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius, paddingVertical: 16, paddingHorizontal: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  sheetRowText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sheetRowNote: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sheetRowPrice: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  sheetCancel: { alignItems: 'center', paddingVertical: 12 },
  sheetCancelText: { color: colors.muted, fontWeight: '700' },
  finishBox: { gap: 8 },
  langOnImage: {
    position: 'absolute', top: 5, left: 5, backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, fontWeight: '800',
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden',
  },
  finishRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  finishChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  finishChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  finishText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  finishTextActive: { color: '#1A1A1A' },
  editorValue: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: 999, padding: 3 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  qty: { color: colors.text, fontWeight: '800', fontSize: 16, minWidth: 30, textAlign: 'center' },
  purchaseBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  purchaseInput: {
    color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    minWidth: 80, textAlign: 'right', fontSize: 15,
  },
  gain: { fontWeight: '700' },
  editorHint: { color: colors.muted, fontSize: 12 },
});
