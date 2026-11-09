// Fiche d'une carte : « Ajouter à mes recherches » (liste de souhaits). Les alertes de prix sont juste en dessous
// (src/components/PriceAlerts.jsx).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWishlist, wishKey } from '../lib/wishlist';
import { t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';

export default function WishButton({ tcgId, lang, setId, card, unitPrice }) {
  const { wishlist, add, remove } = useWishlist();
  const key = wishKey(tcgId, lang, card.id);

  if (!wishlist[key]) {
    return (
      <Pressable
        style={styles.addButton}
        onPress={() => add({ tcg: tcgId, lang, cardId: card.id, setId: setId ?? null, name: card.name, image: card.image ?? null, number: card.number ?? null, price: unitPrice ?? null, priceAt: unitPrice != null ? Date.now() : null })}
      >
        <Ionicons name="heart-outline" size={18} color={colors.accent} />
        <Text style={styles.addText}>{t('Ajouter à mes recherches')}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.box}>
      <Ionicons name="heart" size={18} color={colors.accent} />
      <Text style={styles.title}>{t('Dans mes recherches')}</Text>
      <Pressable onPress={() => remove(key)} hitSlop={8}>
        <Text style={styles.remove}>{t('Retirer')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius, paddingVertical: 12, borderWidth: 1, borderColor: colors.accent },
  addText: { color: colors.accent, fontWeight: '700' },
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius, padding: 14, borderWidth: 1, borderColor: colors.accent },
  title: { color: colors.text, fontWeight: '700', flex: 1 },
  remove: { color: colors.muted, fontWeight: '600' },
});
