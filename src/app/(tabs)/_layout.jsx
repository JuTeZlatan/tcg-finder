import { useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';
import SideMenu from '../../components/SideMenu';
import { useSettings } from '../../lib/settings';
import { useAsync } from '../../lib/useAsync';
import { daysUntil, loadReleases } from '../../lib/releases';
import { t, takeReopenMenu } from '../../lib/i18n';

// L'appli s'ouvre sur l'Explorer, même si le bouton « Menu » est le premier de la barre.
export const unstable_settings = { initialRouteName: '(explore)' };

export default function TabsLayout() {
  // Rouvert d'office juste après un changement de langue (l'appli vient d'être redessinée).
  const [menuOpen, setMenuOpen] = useState(takeReopenMenu);
  const [menuPage] = useState(() => (menuOpen ? 'language' : 'main'));
  // Badge de l'onglet « Sorties » : sorties suivies qui arrivent dans les 7 jours.
  const releases = useAsync(() => loadReleases(), []);
  const followed = new Set(useSettings().settings.followed || []);
  const dueSoon = (releases.data || []).filter((r) => followed.has(r.key) && daysUntil(r.date) >= 0 && daysUntil(r.date) <= 7).length;
  return (
    <>
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* Bouton « Menu » en bas à gauche : ouvre le menu latéral (profil, raccourcis, réglages) au lieu d'un écran. */}
      <Tabs.Screen
        name="menu"
        options={{
          title: t('Menu'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            setMenuOpen(true);
          },
        }}
      />
      <Tabs.Screen
        name="releases"
        options={{
          title: t('Sorties'),
          headerTitle: t('Prochaines sorties'),
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
          tabBarBadge: dueSoon || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: '#1A1A1A' },
        }}
      />
      <Tabs.Screen
        name="(explore)"
        options={{
          title: t('Explorer'),
          headerShown: false, // en-têtes gérés par la pile de l'onglet
          tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: t('Scanner'),
          headerTitle: t('Scanner une carte'),
          tabBarIcon: ({ color, size }) => <Ionicons name="scan" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="(owned)"
        options={{
          title: t('Ma collection'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" color={color} size={size} />,
        }}
      />
    </Tabs>
    <SideMenu open={menuOpen} initialPage={menuPage} onClose={() => setMenuOpen(false)} />
    </>
  );
}
