// Fiche d'une carte : « Ajouter à mes recherches » (liste de souhaits) et prix cible de l'alerte.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWishlist, wishKey } from '../lib/wishlist';
import { askNotificationPermission } from '../lib/notifications';
import { CURRENCY_SYMBOLS, formatPrice, fromStoredEur, getDisplayCurrency, toStoredEur } from '../lib/prices';
import { t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';

const fmt = (v) => (v != null ? String(fromStoredEur(v)).replace('.', ',') : '');

export default function WishButton({ tcgId, lang, setId, card, unitPrice }) {
  const { wishlist, add, remove, setTarget } = useWishlist();
  const key = wishKey(tcgId, lang, card.id);
  const entry = wishlist[key];
  const [text, setText] = useState(fmt(entry?.target));
  const [synced, setSynced] = useState(entry?.target);
  if (entry?.target !== synced) {
    setSynced(entry?.target);
    setText(fmt(entry?.target));
  }

  if (!entry) {
    return (
      <Pressable
        style={styles.addButton}
        onPress={() => {
          add({ tcg: tcgId, lang, cardId: card.id, setId: setId ?? null, name: card.name, image: card.image ?? null, number: card.number ?? null, price: unitPrice ?? null, priceAt: unitPrice != null ? Date.now() : null });
          askNotificationPermission();
        }}
      >
        <Ionicons name="heart-outline" size={18} color={colors.accent} />
        <Text style={styles.addText}>{t('Ajouter à mes recherches')}</Text>
      </Pressable>
    );
  }

  const saveTarget = () => {
    const v = parseFloat(text.replace(',', '.'));
    setTarget(key, Number.isFinite(v) && v > 0 ? toStoredEur(v) : null);
  };
  const reached = entry.target != null && unitPrice != null && unitPrice <= entry.target;
  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Ionicons name="heart" size={18} color={colors.accent} />
        <Text style={styles.title}>{t('Dans mes recherches')}</Text>
        <Pressable onPress={() => remove(key)} hitSlop={8}>
          <Text style={styles.remove}>{t('Retirer')}</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('M’alerter sous')}</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          onBlur={saveTarget}
          onSubmitEditing={saveTarget}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>{CURRENCY_SYMBOLS[getDisplayCurrency()]}</Text>
      </View>
      <Text style={[styles.hint, reached && { color: colors.success }]}>
        {reached
          ? t('Prix actuel sous ton prix cible ({price}) !', { price: formatPrice(unitPrice, 'EUR') })
          : entry.target != null
            ? t('Une notification te prévient quand le prix passe sous ce montant.')
            : t('Indique un prix pour recevoir une alerte quand la carte devient moins chère.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius, paddingVertical: 12, borderWidth: 1, borderColor: colors.accent },
  addText: { color: colors.accent, fontWeight: '700' },
  box: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.accent },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontWeight: '700', flex: 1 },
  remove: { color: colors.muted, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: colors.text },
  input: { flex: 1, backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, textAlign: 'right' },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
