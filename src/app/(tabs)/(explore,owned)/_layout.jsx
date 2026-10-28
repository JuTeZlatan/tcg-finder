// Pile d'écrans des onglets « Explorer » et « Ma collection » : les mêmes écrans (jeu, extension, fiche,
// collection…) servent aux deux onglets, chacun avec sa propre pile. On reste donc dans l'onglet d'où l'on vient,
// et la barre d'onglets reste visible sur tous les écrans.
import { Stack } from 'expo-router';
import { colors } from '../../../lib/theme';
import { t } from '../../../lib/i18n';

export const unstable_settings = {
  anchor: 'index',
  owned: { anchor: 'collection' },
};

export default function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('TCG Finder') }} />
      <Stack.Screen name="collection" options={{ title: t('Ma collection') }} />
    </Stack>
  );
}
