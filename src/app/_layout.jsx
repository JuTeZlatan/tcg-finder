import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CardLangProvider } from '../lib/cardLang';
import { CollectionProvider } from '../lib/collection';
import { I18nProvider } from '../lib/i18n';
import { SettingsProvider } from '../lib/settings';
import { SyncProvider } from '../lib/sync';
import { colors } from '../lib/theme';
import Watchers from '../components/Watchers';
// Déclare la tâche de fond des alertes de prix (doit être chargée au démarrage, hors composant).
import '../lib/backgroundTasks';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        {(appLang) => (
          <CardLangProvider>
            <CollectionProvider>
              <SettingsProvider>
                <SyncProvider>
                  <StatusBar style="light" />
                  <Watchers />
                  {/* Changement de langue : les écrans sont redessinés (key), les données restent chargées. */}
                  <Stack
                    key={appLang}
                    screenOptions={{
                      headerStyle: { backgroundColor: colors.bg },
                      headerTintColor: colors.text,
                      headerTitleStyle: { fontWeight: '700' },
                      headerBackButtonDisplayMode: 'minimal',
                      contentStyle: { backgroundColor: colors.bg },
                    }}
                  >
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  </Stack>
                </SyncProvider>
              </SettingsProvider>
            </CollectionProvider>
          </CardLangProvider>
        )}
      </I18nProvider>
    </SafeAreaProvider>
  );
}
