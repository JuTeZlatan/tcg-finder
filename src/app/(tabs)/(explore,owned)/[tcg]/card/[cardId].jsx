import { useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { getTcg, dataLang } from '../../../../../api';
import { useAsync } from '../../../../../lib/useAsync';
import { useCardLang } from '../../../../../lib/cardLang';
import { PRICE_SOURCES, averagePrice, formatPrice, getUsdToEur, isRecentSet, isShownSource } from '../../../../../lib/prices';
import { useSettings } from '../../../../../lib/settings';
import { fieldLabel, fieldValue, priceLabel, sourceLabel } from '../../../../../lib/labels';
import { colors, radius } from '../../../../../lib/theme';
import { Loading, ErrorView } from '../../../../../components/Status';
import { CollectionEditor, FinishPicker } from '../../../../../components/collection';
import { useCollection } from '../../../../../lib/collection';
import { defaultFinish, finishLabel, finishesOf, storedFinish } from '../../../../../lib/finishes';
import { Ionicons } from '@expo/vector-icons';
import { marketLinks } from '../../../../../lib/marketLinks';

export default function CardScreen() {
  const { tcg: tcgId, cardId, setId, finish: finishParam, lang: langParam } = useLocalSearchParams();
  const tcg = getTcg(tcgId);
  // Ouverte depuis la collection : langue de l'exemplaire ; sinon la langue des cartes choisie dans l'appli.
  const { cardLang } = useCardLang();
  const lang = dataLang(tcg, langParam || cardLang);
  const card = useAsync(() => tcg.getCard(cardId, setId || null, lang), [tcg.id, cardId, setId, lang]);
  const fx = useAsync(() => getUsdToEur(), []);
  const { width } = useWindowDimensions();
  const c = card.data;
  // Date de l'extension : marge d'erreur élargie sur les prix si elle est sortie il y a moins de 40 jours.
  const sets = useAsync(() => tcg.getSets(lang), [tcg.id, lang]);
  const set = sets.data?.find((s) => String(s.id) === String(setId || c?.setId));
  // Version choisie (foil, reverse…) : le prix moyen et l'ajout à la collection portent sur elle.
  const [finish, setFinish] = useState(finishParam || null);
  const chosen = c ? storedFinish(c.prices, finish) : null;
  const { items } = useCollection();
  const ownedFinishes = c ? items.filter((i) => i.tcg === tcg.id && i.cardId === cardId).map((i) => i.finish || defaultFinish(finishesOf(c.prices))) : [];
  // Site(s) de prix choisi(s) dans le menu : prix moyen et blocs affichés en dépendent.
  const { priceSource } = useSettings().settings;
  const avg = c && fx.data ? averagePrice(c.prices, fx.data, { recent: isRecentSet(set?.date), finish: chosen, source: priceSource }) : null;
  const priceTitle = priceSource === 'both' ? 'Prix moyen' : `Prix ${PRICE_SOURCES[priceSource]}`;

  return (
    <>
      <Stack.Screen options={{ title: c?.name ?? '' }} />
      <ScrollView contentContainerStyle={styles.page}>
        {card.loading && <Loading text="Chargement de la carte…" />}
        {card.error && <ErrorView error={card.error} onRetry={card.retry} />}
        {c && (
          <>
            {c.image ? (
              <Image source={c.image} style={[styles.image, { width: Math.min(width - 64, 360) }]} contentFit="contain" transition={150} />
            ) : null}
            <Text style={styles.name}>{c.name}</Text>
            {/* Nom traduit par nos soins (Riftbound en français) : le nom anglais officiel reste affiché. */}
            {c.nameEn ? <Text style={styles.muted}>Nom officiel : {c.nameEn} · traduction non officielle</Text> : null}
            {c.subtitle ? <Text style={styles.muted}>{c.subtitle}</Text> : null}

            <FinishPicker prices={c.prices} value={finish} onChange={setFinish} ownedFinishes={ownedFinishes} />

            <View style={styles.avgBox}>
              <Text style={styles.avgLabel}>{priceTitle}{chosen ? ` · ${finishLabel(c.prices, chosen)}` : ''}</Text>
              {avg ? (
                <>
                  <Text style={styles.avgValue}>{formatPrice(avg.value, 'EUR')}</Text>
                  {priceSource === 'both' ? (
                    <Text style={styles.muted}>Moyenne de {avg.sources.join(' + ')}{avg.sources.length > 1 ? '' : ' (une seule source)'}</Text>
                  ) : null}
                  {avg.divergent ? (
                    <Text style={styles.warning}>
                      ⚠ Les sites donnent des prix très différents : vérifie la version exacte (édition, version alternative) avant d’acheter ou de vendre.
                    </Text>
                  ) : null}
                  {avg.recent ? (
                    <Text style={styles.muted}>Extension sortie il y a moins de 40 jours : les prix bougent encore beaucoup.</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.muted}>{fx.loading ? 'Calcul…' : (priceSource === 'both' ? 'Aucun prix disponible pour cette carte.' : `Pas de prix ${PRICE_SOURCES[priceSource]} pour cette carte.`)}</Text>
              )}
            </View>

            <CollectionEditor tcgId={tcg.id} lang={lang} setId={setId || c.setId || null} card={{ ...c, id: cardId }} unitPrice={avg?.value ?? null} finish={chosen} onFinishChosen={setFinish} />

            {c.prices.filter((p) => !p.versions && isShownSource(p, priceSource)).map((p) => (
              <View key={sourceLabel(p)} style={styles.block}>
                <Text style={styles.blockTitle}>
                  {sourceLabel(p)}
                  {p.updated ? <Text style={styles.muted}>  · maj {new Date(p.updated).toLocaleDateString('fr-FR')}</Text> : null}
                </Text>
                {p.items.filter((i) => i.value != null).map((i, idx) => (
                  <View key={idx} style={styles.priceRow}>
                    <Text style={styles.priceLabel}>{priceLabel(i)}</Text>
                    <Text style={styles.priceValue}>{formatPrice(i.value, i.currency)}</Text>
                  </View>
                ))}
              </View>
            ))}

            {c.versions?.length ? (
              <>
                <Text style={styles.section}>Autres versions de cette carte</Text>
                <View style={styles.block}>
                  {c.versions.map((v) => (
                    <Pressable key={v.url} style={styles.versionRow} onPress={() => Linking.openURL(v.url)}>
                      <Image source={v.image} style={styles.versionImage} contentFit="contain" />
                      <Text style={styles.versionLabel}>{v.label}</Text>
                      <Text style={styles.priceValue}>
                        {v.price ? formatPrice(v.price.value * (fx.data || 1), fx.data ? 'EUR' : v.price.currency) : '—'}
                      </Text>
                    </Pressable>
                  ))}
                  <Text style={styles.mutedLeft}>Prix TCGplayer (marché). Touche une version pour la voir.</Text>
                </View>
              </>
            ) : null}

            <Text style={styles.section}>Informations</Text>
            <View style={styles.block}>
              {c.details.map(([key, value]) => (
                <View key={key} style={styles.detailRow}>
                  <Text style={styles.detailKey}>{fieldLabel(key)}</Text>
                  <Text style={styles.detailValue}>{String(fieldValue(key, value))}</Text>
                </View>
              ))}
            </View>


            <Text style={styles.section}>Acheter, vendre, comparer</Text>
            <View style={styles.marketRow}>
              {marketLinks(tcg.id, c, lang).map((m) => (
                <Pressable key={m.key} style={styles.marketBtn} onPress={() => Linking.openURL(m.url)}>
                  <Ionicons name={m.icon} size={18} color={colors.accent} />
                  <Text style={styles.marketText}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.links}>
              {c.links.map((l) => (
                <Pressable key={l.label} style={styles.link} onPress={() => Linking.openURL(l.url)}>
                  <Text style={styles.linkText}>Voir sur {l.label} ↗</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.footer}>
              Prix indicatifs (toutes langues confondues chez Cardmarket), à vérifier sur les places de marché.
              Taux USD→EUR du jour : {fx.data?.toFixed(3) ?? '…'}.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, alignItems: 'stretch' },
  image: { aspectRatio: 63 / 88, alignSelf: 'center', borderRadius: 10 },
  name: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  avgBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius, padding: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.accent },
  avgLabel: { color: colors.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  avgValue: { color: colors.accent, fontSize: 32, fontWeight: '800' },
  warning: { color: colors.accent, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  block: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 6 },
  blockTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  priceLabel: { color: colors.muted, flex: 1 },
  priceValue: { color: colors.text, fontWeight: '700' },
  detailRow: { flexDirection: 'row', gap: 12, paddingVertical: 2 },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  versionImage: { width: 36, height: 50, borderRadius: 3 },
  versionLabel: { color: colors.text, flex: 1, fontSize: 13 },
  mutedLeft: { color: colors.muted, fontSize: 12, marginTop: 4 },
  detailKey: { color: colors.muted, width: 130 },
  detailValue: { color: colors.text, flex: 1 },
  marketRow: { gap: 8 },
  marketBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius, paddingVertical: 12, paddingHorizontal: 14 },
  marketText: { color: colors.text, fontWeight: '600' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  linkText: { color: colors.accent, fontWeight: '600' },
  footer: { color: colors.muted, fontSize: 12, marginTop: 8, marginBottom: 24 },
});
