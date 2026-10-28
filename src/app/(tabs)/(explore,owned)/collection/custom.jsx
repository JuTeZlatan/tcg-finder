// Ajout / modification d'une carte « Autres » : carte absente des catalogues, saisie à la main.
import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useCollection } from '../../../../lib/collection';
import { colors, radius } from '../../../../lib/theme';
import { CURRENCY_SYMBOLS, fromStoredEur, getDisplayCurrency, toStoredEur } from '../../../../lib/prices';
import { t } from '../../../../lib/i18n';

// Prix saisis dans la devise choisie, enregistrés en euros.
const toNumber = (s) => {
  const v = parseFloat(String(s ?? '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? toStoredEur(v) : null;
};
const toText = (v) => (v == null ? '' : String(fromStoredEur(v)).replace('.', ','));

// Recherches eBay (annonces, ventes réussies) et Vinted pour estimer le prix.
const marketSearches = (text) => {
  const q = encodeURIComponent(text);
  return [
    { label: t('Ventes réussies eBay'), url: `https://www.ebay.fr/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1` },
    { label: t('Annonces eBay'), url: `https://www.ebay.fr/sch/i.html?_nkw=${q}` },
    { label: t('Annonces Vinted'), url: `https://www.vinted.fr/catalog?search_text=${q}` },
  ];
};

// La photo est copiée dans l'espace de l'appli (le cache peut être vidé par le système).
async function keepPhoto(uri) {
  if (!uri || uri.includes('/cards/')) return uri;
  const dir = new Directory(Paths.document, 'cards');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `card-${Date.now()}.jpg`);
  await new File(uri).copy(dest, { overwrite: true });
  return dest.uri;
}

export default function CustomCardScreen() {
  const params = useLocalSearchParams();
  const { items, saveCustom, remove } = useCollection();
  const existing = params.key ? items.find((i) => i.key === params.key) : null;
  const c = existing?.custom || {};
  const [form, setForm] = useState({
    name: existing?.name ?? params.name ?? '',
    category: c.category ?? null,
    series: c.series ?? '',
    year: c.year ?? '',
    number: existing?.number ?? '',
    qty: existing?.qty ?? 1,
    price: toText(existing?.price),
    purchase: toText(existing?.purchase),
    notes: c.notes ?? '',
    image: existing?.image ?? params.photo ?? null,
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const pickPhoto = async (camera) => {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const res = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [63, 88] })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [63, 88] });
    if (!res.canceled) set('image')(res.assets[0].uri);
  };

  const save = async () => {
    if (!form.name.trim()) {
      Alert.alert(t('Nom manquant'), t('Indique au moins le nom de la carte.'));
      return;
    }
    const image = await keepPhoto(form.image).catch(() => form.image);
    saveCustom({
      name: form.name.trim(),
      category: form.category,
      series: form.series.trim(),
      year: form.year.trim(),
      number: form.number.trim(),
      qty: form.qty,
      price: toNumber(form.price),
      purchase: toNumber(form.purchase),
      notes: form.notes.trim(),
      image,
    }, existing?.key);
    router.back();
  };

  const del = () =>
    Alert.alert(t('Retirer cette carte ?'), t('Elle sera supprimée de ta collection.'), [
      { text: t('Annuler'), style: 'cancel' },
      { text: t('Retirer'), style: 'destructive', onPress: () => { remove(existing.key); router.back(); } },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: existing ? t('Autre carte') : t('Ajouter une autre carte') }} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.photoRow}>
          <View style={styles.photo}>
            {form.image ? <Image source={form.image} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Ionicons name="image-outline" size={40} color={colors.muted} />}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Pressable style={styles.photoBtn} onPress={() => pickPhoto(true)}>
              <Ionicons name="camera" size={18} color={colors.accent} />
              <Text style={styles.photoBtnText}>{t('Prendre en photo')}</Text>
            </Pressable>
            <Pressable style={styles.photoBtn} onPress={() => pickPhoto(false)}>
              <Ionicons name="images" size={18} color={colors.accent} />
              <Text style={styles.photoBtnText}>{t('Choisir une photo')}</Text>
            </Pressable>
            <Text style={styles.hint}>{t('La photo sert d’image à la carte dans ta collection.')}</Text>
          </View>
        </View>

        <Field label={t('Nom de la carte *')} value={form.name} onChangeText={set('name')} />

        <Field label={t('Jeu / série')} value={form.series} onChangeText={set('series')} placeholder={t('ex. nom du jeu ou de l’extension')} />

        <View style={styles.row2}>
          <Field label={t('Année')} value={form.year} onChangeText={set('year')} style={{ flex: 1 }} />
          <Field label={t('Numéro')} value={form.number} onChangeText={set('number')} style={{ flex: 1 }} />
        </View>

        <View style={styles.row2}>
          <Field label={t('Prix estimé ({0}, à l\'unité)', { 0: CURRENCY_SYMBOLS[getDisplayCurrency()] })} value={form.price} onChangeText={set('price')} keyboardType="decimal-pad" placeholder="—" style={{ flex: 1 }} />
          <Field label={t('Prix d\'achat ({0})', { 0: CURRENCY_SYMBOLS[getDisplayCurrency()] })} value={form.purchase} onChangeText={set('purchase')} keyboardType="decimal-pad" placeholder="—" style={{ flex: 1 }} />
        </View>

        <View style={styles.qtyRow}>
          <Text style={styles.label}>{t('Quantité')}</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => set('qty')(Math.max(1, form.qty - 1))}><Ionicons name="remove" size={18} color={colors.text} /></Pressable>
            <Text style={styles.qty}>{form.qty}</Text>
            <Pressable style={styles.stepBtn} onPress={() => set('qty')(form.qty + 1)}><Ionicons name="add" size={18} color={colors.text} /></Pressable>
          </View>
        </View>

        <Field label={t('Notes (version, numérotée, gradée…)')} value={form.notes} onChangeText={set('notes')} multiline />

        <Text style={styles.hint}>
          {t('Carte hors catalogue, rangée dans « Autres » : les informations et le prix sont ceux que tu saisis. Le bouton « Ventes réussies eBay » de la fiche peut t’aider à estimer le prix.')}
        </Text>

        <Pressable style={styles.save} onPress={save}>
          <Ionicons name="checkmark" size={20} color="#1A1A1A" />
          <Text style={styles.saveText}>{existing ? t('Enregistrer') : t('Ajouter à ma collection')}</Text>
        </Pressable>
        {existing ? (
          <>
            {marketSearches([form.series, form.year, form.name, form.number].filter(Boolean).join(' ')).map((m) => (
              <Pressable key={m.label} style={styles.secondary} onPress={() => Linking.openURL(m.url)}>
                <Text style={styles.secondaryText}>{m.label} ↗</Text>
              </Pressable>
            ))}
            <Pressable style={styles.delete} onPress={del}>
              <Text style={styles.deleteText}>{t('Retirer de ma collection')}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function Field({ label, style, multiline, ...props }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14 },
  photoRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  photo: { width: 110, aspectRatio: 63 / 88, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius, padding: 12 },
  photoBtnText: { color: colors.text, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  label: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row2: { flexDirection: 'row', gap: 10 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, borderRadius: 999, padding: 3 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  qty: { color: colors.text, fontWeight: '800', fontSize: 16, minWidth: 30, textAlign: 'center' },
  save: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14 },
  saveText: { color: '#1A1A1A', fontWeight: '800', fontSize: 15 },
  secondary: { alignItems: 'center', borderRadius: radius, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '700' },
  delete: { alignItems: 'center', paddingVertical: 10 },
  deleteText: { color: colors.danger, fontWeight: '700' },
});
