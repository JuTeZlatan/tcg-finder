// « Mes cartes recherchées » : liste de souhaits avec dernier prix connu, prix cible et alerte atteinte.
// Tirer vers le bas : nouvelle vérification de tous les prix.
import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getTcg } from '../../../../api';
import { useWishlist, checkWishlistPrices } from '../../../../lib/wishlist';
import { useSettings } from '../../../../lib/settings';
import { formatPrice } from '../../../../lib/prices';
import { LangBadge } from '../../../../components/collection';
import { t } from '../../../../lib/i18n';
import { colors, radius } from '../../../../lib/theme';

export default function WishlistScreen() {
  const { list, wishlist } = useWishlist();
  const { update } = useSettings();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    const next = await checkWishlistPrices(wishlist, { force: true }).catch(() => null);
    if (next) update({ wishlist: next }, { fromSync: true });
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('Mes cartes recherchées') }} />
      <FlatList
        data={list}
        keyExtractor={(w) => `${w.tcg}|${w.lang}|${w.cardId}`}
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={56} color={colors.muted} />
            <Text style={styles.emptyText}>
              {t('Aucune carte recherchée. Sur la fiche d’une carte, touche « Ajouter à mes recherches » et indique un prix : tu seras prévenu quand elle passe en dessous.')}
            </Text>
          </View>
        }
        renderItem={({ item: w }) => {
          const reached = w.target != null && w.price != null && w.price <= w.target;
          return (
            <Pressable
              style={[styles.row, reached && styles.rowReached]}
              onPress={() => router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: w.tcg, cardId: w.cardId, setId: w.setId || '', lang: w.lang } })}
            >
              <View style={styles.thumb}>
                {w.image ? <Image source={w.image} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
                <LangBadge lang={w.lang} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={2}>{w.name}</Text>
                <Text style={styles.muted} numberOfLines={1}>{[getTcg(w.tcg)?.name, w.number && `#${w.number}`].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.muted}>
                  {w.target != null ? t('Prix cible : {price}', { price: formatPrice(w.target, 'EUR') }) : t('Pas de prix cible')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={[styles.price, reached && { color: colors.success }]}>{w.price != null ? formatPrice(w.price, 'EUR') : '—'}</Text>
                {reached ? <Text style={styles.reached}>{t('Prix atteint')}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius, padding: 10 },
  rowReached: { borderWidth: 1, borderColor: colors.success },
  thumb: { width: 56, aspectRatio: 63 / 88, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  name: { color: colors.text, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 12 },
  price: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  reached: { color: colors.success, fontSize: 12, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 21 },
});
