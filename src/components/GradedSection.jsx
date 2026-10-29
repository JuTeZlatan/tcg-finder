// Fiche d'une carte : exemplaires gradés (PSA, PCA, CGC, BGS…, notes de 7 à 10).
// Chaque note est un exemplaire à part dans la collection, avec la valeur saisie (cote estimée) ;
// les recherches eBay (ventes réussies) et Vinted de la note choisie aident à l'estimer.
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCollection, gradingLabel } from '../lib/collection';
import { gradedLinks } from '../lib/marketLinks';
import { CURRENCY_SYMBOLS, formatPrice, fromStoredEur, getDisplayCurrency, toStoredEur } from '../lib/prices';
import { finishLabel } from '../lib/finishes';
import { t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';

const COMPANIES = ['PSA', 'PCA', 'CGC', 'BGS'];
const GRADES = ['10', '9.5', '9', '8.5', '8', '7.5', '7'];
const parse = (text) => {
  const v = parseFloat(String(text).replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? toStoredEur(v) : null;
};
const fmt = (v) => (v != null ? String(fromStoredEur(v)).replace('.', ',') : '');

export default function GradedSection({ tcgId, lang, setId, card, finish }) {
  const { items, add, setQty, setPrice } = useCollection();
  const owned = items.filter((i) => i.tcg === tcgId && i.lang === lang && i.cardId === card.id && i.grading);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState('PSA');
  const [grade, setGrade] = useState('9');
  const [value, setValue] = useState('');
  const symbol = CURRENCY_SYMBOLS[getDisplayCurrency()];

  const addGraded = () => {
    const grading = { company, grade };
    const version = finish ? finishLabel(card.prices, finish) : null;
    add(tcgId, lang, setId ?? card.setId ?? null, {
      id: card.id, name: card.name, number: card.number, image: card.image, setName: card.setName,
      price: parse(value), finish: finish ?? null, finishName: [version, gradingLabel(grading)].filter(Boolean).join(' · '), grading,
    }, 1);
    setOpen(false);
    setValue('');
  };

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Ionicons name="ribbon-outline" size={18} color={colors.accent} />
        <Text style={styles.title}>{t('Exemplaires gradés')}</Text>
      </View>

      {owned.map((i) => <OwnedGraded key={i.key} item={i} setQty={setQty} setPrice={setPrice} symbol={symbol} />)}

      {open ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.label}>{t('Société de gradation')}</Text>
          <View style={styles.chips}>
            {COMPANIES.map((c) => <Chip key={c} label={c} active={company === c} onPress={() => setCompany(c)} />)}
          </View>
          <Text style={styles.label}>{t('Note')}</Text>
          <View style={styles.chips}>
            {GRADES.map((g) => <Chip key={g} label={g.replace('.', ',')} active={grade === g} onPress={() => setGrade(g)} />)}
          </View>
          <Text style={styles.label}>{t('Cote estimée ({symbol})', { symbol })}</Text>
          <TextInput style={styles.input} value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.muted} />
          <Text style={styles.hint}>{t('Aucune cote officielle gratuite pour les cartes gradées : regarde les dernières ventes pour estimer la valeur.')}</Text>
          <View style={styles.links}>
            {gradedLinks(tcgId, card, lang, company, grade).map((l) => (
              <Pressable key={l.key} style={styles.link} onPress={() => Linking.openURL(l.url)}>
                <Ionicons name={l.icon} size={16} color={colors.accent} />
                <Text style={styles.linkText}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.primary} onPress={addGraded}>
            <Text style={styles.primaryText}>{t('Ajouter {grade} à ma collection', { grade: `${company} ${grade.replace('.', ',')}` })}</Text>
          </Pressable>
          <Pressable onPress={() => setOpen(false)}>
            <Text style={[styles.hint, { textAlign: 'center' }]}>{t('Annuler')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.secondary} onPress={() => setOpen(true)}>
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.secondaryText}>{t('Ajouter un exemplaire gradé (PSA, PCA…)')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function OwnedGraded({ item, setQty, setPrice, symbol }) {
  const [text, setText] = useState(fmt(item.price));
  const [synced, setSynced] = useState(item.price);
  if (item.price !== synced) {
    setSynced(item.price);
    setText(fmt(item.price));
  }
  return (
    <View style={styles.owned}>
      <Text style={styles.grade}>{gradingLabel(item.grading).replace('.', ',')}</Text>
      <View style={styles.qty}>
        <Pressable onPress={() => setQty(item.key, item.qty - 1)} hitSlop={6}>
          <Ionicons name={item.qty > 1 ? 'remove-circle-outline' : 'trash-outline'} size={22} color={colors.muted} />
        </Pressable>
        <Text style={styles.qtyText}>{item.qty}</Text>
        <Pressable onPress={() => setQty(item.key, item.qty + 1)} hitSlop={6}>
          <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
        </Pressable>
      </View>
      <TextInput
        style={[styles.input, styles.ownedInput]}
        value={text}
        onChangeText={setText}
        onBlur={() => setPrice(item.key, parse(text))}
        onSubmitEditing={() => setPrice(item.key, parse(text))}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>{symbol}</Text>
      {item.rawPrice != null ? <Text style={styles.raw}>{t('brute : {price}', { price: formatPrice(item.rawPrice, 'EUR') })}</Text> : null}
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  label: { color: colors.text, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '700' },
  chipTextActive: { color: '#1A1A1A' },
  input: { backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  links: { gap: 6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  linkText: { color: colors.text, fontWeight: '600' },
  primary: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 12 },
  primaryText: { color: '#1A1A1A', fontWeight: '800' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.accent, fontWeight: '700' },
  owned: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  grade: { color: '#1A1A1A', backgroundColor: colors.accent, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyText: { color: colors.text, fontWeight: '800', minWidth: 16, textAlign: 'center' },
  ownedInput: { flex: 1, minWidth: 70, textAlign: 'right' },
  raw: { color: colors.muted, fontSize: 12, width: '100%' },
});
