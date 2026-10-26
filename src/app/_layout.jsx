import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CardLangProvider } from '../lib/cardLang';
import { CollectionProvider } from '../lib/collection';
import { SettingsProvider } from '../lib/settings';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <CardLangProvider>
        <CollectionProvider>
          <SettingsProvider>
          <StatusBar style="light" />
          <Stack
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
          </SettingsProvider>
        </CollectionProvider>
      </CardLangProvider>
    </SafeAreaProvider>
  );
}
