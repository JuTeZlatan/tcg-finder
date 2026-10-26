import { useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';
import SideMenu from '../../components/SideMenu';

// L'appli s'ouvre sur l'Explorer, même si le bouton « Menu » est le premier de la barre.
export const unstable_settings = { initialRouteName: '(explore)' };

export default function TabsLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
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
          title: 'Menu',
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
        name="(explore)"
        options={{
          title: 'Explorer',
          headerShown: false, // en-têtes gérés par la pile de l'onglet
          tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scanner',
          headerTitle: 'Scanner une carte',
          tabBarIcon: ({ color, size }) => <Ionicons name="scan" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="(owned)"
        options={{
          title: 'Ma collection',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" color={color} size={size} />,
        }}
      />
    </Tabs>
    <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
