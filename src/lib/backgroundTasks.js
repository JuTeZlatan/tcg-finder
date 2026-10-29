// Tâche de fond (WorkManager sur Android) : vérifie les prix de la liste de souhaits même quand l'appli est fermée,
// environ deux fois par jour (le système choisit le moment : batterie suffisante et réseau disponible).
// Déclarée à l'import de ce fichier (portée globale, exigée par expo-task-manager) : importé par app/_layout.jsx.
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { checkWishlistInBackground } from './wishlist';
import { loadAppLang } from './i18n';
import { loadRates } from './prices';

export const PRICE_TASK = 'wishlist-prices';

TaskManager.defineTask(PRICE_TASK, async () => {
  try {
    await loadAppLang();
    await loadRates();
    await checkWishlistInBackground();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Active la tâche tant que la liste de souhaits n'est pas vide.
export async function setPriceTask(enabled) {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(PRICE_TASK);
    if (enabled && !registered) await BackgroundTask.registerTaskAsync(PRICE_TASK, { minimumInterval: 12 * 60 });
    else if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(PRICE_TASK);
  } catch {
    // service indisponible (restreint par le système) : les prix restent vérifiés à l'ouverture de l'appli
  }
}
