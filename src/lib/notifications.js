// Notifications locales du téléphone (sans serveur) : alertes de prix de la liste de souhaits et rappel le jour
// de sortie des extensions suivies (onglet « Sorties »).
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { t } from './i18n';

const CHANNEL = 'alerts';
const RELEASE_PREFIX = 'release-';

// Notification affichée même quand l'appli est ouverte.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: t('Alertes de prix et sorties'),
    // eslint-disable-next-line import/namespace -- ré-exporté par expo-notifications (export * en cascade)
    importance: Notifications.AndroidImportance.HIGH,
  });
}

// Demande l'autorisation la première fois (Android 13+ : fenêtre du système). Renvoie true si autorisé.
export async function askNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function notifyNow(title, body, data = {}) {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: { channelId: CHANNEL } });
}

// Rappels des sorties suivies : un par sortie, à 9 h le jour J (reprogrammés à chaque changement de la liste).
// releases : [{ key, date: 'AAAA-MM-JJ', name, tcgName }]
export async function scheduleReleaseReminders(releases) {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannel();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter((n) => n.identifier.startsWith(RELEASE_PREFIX))
    .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  for (const r of releases) {
    const [y, m, d] = r.date.split('-').map(Number);
    const at = new Date(y, m - 1, d, 9, 0, 0);
    if (at <= new Date()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${RELEASE_PREFIX}${r.key}`.slice(0, 120),
      content: { title: t('Sortie du jour : {name}', { name: r.name }), body: t('{game} · disponible aujourd’hui', { game: r.tcgName }), data: { url: '/releases' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
}
