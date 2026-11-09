// « Alertes de prix » : toutes les alertes (src/lib/priceAlerts.js), la surveillance de toute la collection et
// l'historique des alertes envoyées. Tirer vers le bas ou « Vérifier maintenant » : nouvelle vérification des prix.
import { useCallback, useEffect, useState } from 'react';
import { router, Stack, useFocusEffect } from 'expo-router';
import { AppState, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { getTcg } from '../../../../api';
import { useSettings } from '../../../../lib/settings';
import { useCollection } from '../../../../lib/collection';
import {
  checkAlerts, checkCollection, clearAlertLog, distanceOf, mergeAlertResults, readAlertLog, resetCollectionRefs, ruleText, useAlerts,
} from '../../../../lib/priceAlerts';
import { askNotificationPermission } from '../../../../lib/notifications';
import { formatPrice } from '../../../../lib/prices';
import { Chip } from '../../../../components/FilterSheet';
import { LangBadge } from '../../../../components/collection';
import { locale, plural, t } from '../../../../lib/i18n';
import { colors, radius } from '../../../../lib/theme';

const PERCENTS = [10, 15, 20, 30, 50];
const MIN_PRICES = [0, 1, 5, 10, 20, 50];

export default function AlertsScreen() {
  const { settings, update } = useSettings();
  const { list, setPaused, remove } = useAlerts();
  const { items } = useCollection();
  const watch = settings.collectionWatch || { enabled: false, percent: 20, minPrice: 5 };
  const [checking, setChecking] = useState(false);
  const [log, setLog] = useState([]);
  const [permission, setPermission] = useState(null);

  const reload = useCallback(() => {
    readAlertLog().then(setLog);
    Notifications.getPermissionsAsync().then(setPermission).catch(() => {});
  }, []);
  useFocusEffect(reload);
  // Retour dans l'appli : alertes envoyées entre-temps par la tâche de fond.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && reload());
    return () => sub.remove();
  }, [reload]);

  const setWatch = (patch) => {
    update({ collectionWatch: { ...watch, ...patch } });
    // Nouveaux seuils : les prix actuels redeviennent la référence.
    resetCollectionRefs().then(() => checkCollection(items, { ...watch, ...patch })).catch(() => {});
    if (patch.enabled) askNotificationPermission().then(reload);
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const next = await checkAlerts(settings.alerts, { force: true });
      if (next) update({ alerts: mergeAlertResults(settings.alerts, next) }, { fromSync: true });
      if (watch.enabled) await checkCollection(items, watch);
    } catch {
      // réseau indisponible : nouvel essai plus tard
    }
    setChecking(false);
    reload();
  };

  // Première visite sans autorisation : on la demande.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && (list.length || watch.enabled)) askNotificationPermission().then(reload);
  }, [permission, list.length, watch.enabled, reload]);

  const minLabel = (v) => (v ? formatPrice(v, 'EUR') : t('Toutes'));

  return (
    <>
      <Stack.Screen options={{ title: t('Alertes de prix') }} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={checking} onRefresh={checkNow} tintColor={colors.accent} colors={[colors.accent]} />}
      >
        {permission && !permission.granted ? (
          <Pressable
            style={styles.warning}
            onPress={() => (permission.canAskAgain ? askNotificationPermission().then(reload) : Linking.openSettings())}
          >
            <Ionicons name="notifications-off-outline" size={20} color={colors.danger} />
            <Text style={styles.warningText}>
              {t('Notifications désactivées : tu ne recevras pas les alertes. Touche ici pour les autoriser.')}
            </Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.check} onPress={checkNow} disabled={checking}>
          <Ionicons name="refresh" size={18} color="#1A1A1A" />
          <Text style={styles.checkText}>{checking ? t('Vérification…') : t('Vérifier les prix maintenant')}</Text>
        </Pressable>
        <Text style={styles.muted}>
          {t('Les prix sont aussi vérifiés automatiquement environ deux fois par jour, même appli fermée.')}
        </Text>

        <Text style={styles.section}>{t('Surveiller toute ma collection')}</Text>
        <View style={styles.card}>
          <View style={styles.chips}>
            <Chip label={t('Activée')} active={watch.enabled} onPress={() => setWatch({ enabled: true })} />
            <Chip label={t('Désactivée')} active={!watch.enabled} onPress={() => setWatch({ enabled: false })} />
          </View>
          <Text style={styles.muted}>
            {t('Une notification quand une de tes cartes monte ou baisse fortement, et quand la valeur de ta collection change beaucoup.')}
          </Text>
          {watch.enabled ? (
            <>
              <Text style={styles.label}>{t('Variation minimum')}</Text>
              <View style={styles.chips}>
                {PERCENTS.map((p) => <Chip key={p} label={`± ${p} %`} active={watch.percent === p} onPress={() => setWatch({ percent: p })} />)}
              </View>
              <Text style={styles.label}>{t('Cartes valant au moins')}</Text>
              <View style={styles.chips}>
                {MIN_PRICES.map((v) => <Chip key={v} label={minLabel(v)} active={(watch.minPrice ?? 0) === v} onPress={() => setWatch({ minPrice: v })} />)}
              </View>
            </>
          ) : null}
        </View>

        <Text style={styles.section}>{plural(list.length, 'Mon alerte ({n})', 'Mes alertes ({n})')}</Text>
        {!list.length ? (
          <View style={styles.card}>
            <Text style={styles.muted}>
              {t('Aucune alerte. Sur la fiche d’une carte, touche « Créer une alerte de prix » : sous un montant, au-dessus d’un montant, ou à la hausse / à la baisse d’un pourcentage.')}
            </Text>
          </View>
        ) : list.map((a) => {
          const distance = distanceOf(a);
          return (
            <Pressable
              key={a.id}
              style={[styles.row, a.triggered && !a.paused && styles.rowReached, a.paused && { opacity: 0.55 }]}
              onPress={() => router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: a.tcg, cardId: a.cardId, setId: a.setId || '', lang: a.lang, finish: a.finish || '' } })}
            >
              <View style={styles.thumb}>
                {a.image ? <Image source={a.image} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
                <LangBadge lang={a.lang} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={2}>{a.name}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {[getTcg(a.tcg)?.name, a.number && `#${a.number}`, a.finishName].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.rule}>{ruleText(a)}</Text>
                <Text style={[styles.muted, a.triggered && !a.paused && { color: colors.success }]}>
                  {a.paused ? t('En pause')
                    : a.triggered || distance === 0 ? t('Seuil atteint')
                      : distance != null ? t('Encore {pct} avant l’alerte', { pct: `${(distance * 100).toLocaleString(locale(), { maximumFractionDigits: 0 })} %` })
                        : t('En attente du prix')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 10 }}>
                <Text style={styles.price}>{a.price != null ? formatPrice(a.price, 'EUR') : '—'}</Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <Pressable onPress={() => setPaused(a.id, !a.paused)} hitSlop={8} accessibilityLabel={a.paused ? t('Réactiver') : t('Mettre en pause')}>
                    <Ionicons name={a.paused ? 'play-outline' : 'pause-outline'} size={20} color={colors.muted} />
                  </Pressable>
                  <Pressable onPress={() => remove(a.id)} hitSlop={8} accessibilityLabel={t('Supprimer')}>
                    <Ionicons name="trash-outline" size={20} color={colors.muted} />
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        })}

        {log.length ? (
          <>
            <View style={styles.rowBetween}>
              <Text style={styles.section}>{t('Dernières alertes reçues')}</Text>
              <Pressable onPress={() => clearAlertLog().then(reload)} hitSlop={8}>
                <Text style={styles.link}>{t('Effacer')}</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              {log.slice(0, 30).map((e, i) => (
                <Pressable
                  key={`${e.at}-${i}`}
                  style={[styles.logRow, i > 0 && styles.divider]}
                  onPress={() => {
                    const d = e.data || {};
                    if (d.cardId && d.tcg) router.push({ pathname: '/[tcg]/card/[cardId]', params: { tcg: d.tcg, cardId: d.cardId, setId: d.setId || '', lang: d.lang || '', finish: d.finish || '' } });
                    else if (d.url) router.push(d.url);
                  }}
                >
                  <Text style={styles.logTitle}>{e.title}</Text>
                  <Text style={styles.muted}>{e.body}</Text>
                  <Text style={styles.logDate}>{new Date(e.at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, paddingBottom: 40 },
  warning: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius, padding: 12, borderWidth: 1, borderColor: colors.danger },
  warningText: { color: colors.text, flex: 1, lineHeight: 19 },
  check: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 12 },
  checkText: { color: '#1A1A1A', fontWeight: '800' },
  section: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius, padding: 14, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius, padding: 10 },
  rowReached: { borderWidth: 1, borderColor: colors.success },
  thumb: { width: 56, aspectRatio: 63 / 88, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  name: { color: colors.text, fontWeight: '700' },
  rule: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  price: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: colors.accent, fontWeight: '600', marginTop: 12 },
  logRow: { gap: 2, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  logTitle: { color: colors.text, fontWeight: '700' },
  logDate: { color: colors.muted, fontSize: 11 },
});
