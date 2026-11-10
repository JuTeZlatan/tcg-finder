// Accueil « Explorer », sur un seul écran sans défilement : en-tête (salutation, avatar), recherche dans tous les jeux,
// langue des cartes (drapeaux sur une ligne), puis les jeux en tuiles à dégradé aux couleurs de chacun (icône et logo officiels), dont la taille
// s'adapte à la hauteur disponible. Un jeu sans cartes dans la langue choisie est grisé avec un cadenas (sauf les jeux
// affichés en anglais en attendant une version officielle).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TCGS, dataLang } from '../../../api';
import { CARD_LANGS, LANG_NAMES, useCardLang } from '../../../lib/cardLang';
import { colors } from '../../../lib/theme';
import { GAME_ICONS, GAME_WORDMARKS, WORDMARK_ONLY, WORDMARK_TINT } from '../../../lib/gameIcons';
import { useSettings } from '../../../lib/settings';
import { Avatar } from '../../../components/SideMenu';
import { t } from '../../../lib/i18n';

const FLAGS = { fr: '🇫🇷', en: '🇬🇧', de: '🇩🇪', it: '🇮🇹', es: '🇪🇸', ja: '🇯🇵', zh: '🇨🇳', ko: '🇰🇷' };
const GAP = 10;
const PAD = 16;

export default function Home() {
  const { settings } = useSettings();
  const { cardLang, setCardLang } = useCardLang();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Tuiles : 3 colonnes (4 sur tablette), hauteur calculée pour que toutes les lignes tiennent dans la place restante.
  const columns = width > 700 ? 4 : 3;
  const rows = Math.ceil(TCGS.length / columns);
  const tileWidth = Math.floor((width - PAD * 2 - GAP * (columns - 1)) / columns); // arrondi vers le bas : pas de retour à la ligne
  const [gridHeight, setGridHeight] = useState(0);
  const tileHeight = gridHeight ? Math.min((gridHeight - GAP * (rows - 1)) / rows, tileWidth * 1.25) : 0;
  // Recherche dans tous les jeux à la fois.
  const [query, setQuery] = useState('');
  const search = () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    router.push({ pathname: '/search', params: { q: query.trim() } });
  };
  const available = (g) => g.languages.includes(cardLang) || !!g.englishFallback;
  // Préchargement des listes d'extensions de chaque jeu : l'ouverture d'un jeu devient instantanée.
  useEffect(() => {
    for (const g of TCGS) g.getSets(dataLang(g, cardLang)).catch(() => {});
  }, [cardLang]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      {/* En-tête : salutation et avatar */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello} numberOfLines={1}>{settings.pseudo ? t('Salut {name}', { name: settings.pseudo }) : t('Salut !')}</Text>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{t('Choisis ton TCG')}</Text>
        </View>
        <Avatar avatar={settings.avatar} pseudo={settings.pseudo} size={42} />
      </View>

      {/* Recherche dans tous les jeux */}
      <View style={styles.search}>
        <Ionicons name="search" size={19} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder={t('Chercher une carte dans tous les jeux…')}
          placeholderTextColor={colors.muted}
        />
        {query.trim() ? (
          <Pressable style={styles.searchGo} onPress={search} accessibilityLabel={t('Recherche')}>
            <Ionicons name="arrow-forward" size={17} color="#1A1A1A" />
          </Pressable>
        ) : null}
      </View>

      {/* Langue des cartes : un drapeau par langue, la langue choisie écrite à côté du titre */}
      <View style={{ gap: 6 }}>
        <Text style={styles.sectionLabel} numberOfLines={1}>
          {t('Langue des cartes')} · <Text style={styles.sectionLabelActive}>{t(LANG_NAMES[cardLang])}</Text>
        </Text>
        <View style={styles.langs}>
          {CARD_LANGS.map((l) => {
            const active = cardLang === l;
            return (
              <Pressable
                key={l}
                style={[styles.lang, active && styles.langActive]}
                onPress={() => setCardLang(l)}
                accessibilityLabel={t(LANG_NAMES[l])}
                accessibilityState={{ selected: active }}
              >
                <Text style={styles.flag}>{FLAGS[l]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Jeux */}
      <View style={styles.sectionHead}>
        <Text style={styles.section}>{t('Jeux')}</Text>
        <Text style={styles.sectionCount}>{TCGS.filter(available).length}/{TCGS.length}</Text>
      </View>
      <View style={styles.gridArea} onLayout={(e) => setGridHeight(e.nativeEvent.layout.height)}>
        {tileHeight ? (
          <View style={styles.grid}>
            {TCGS.map((g) => {
              const on = available(g);
              // Icône officielle centrée en haut, logo officiel (écriture du nom) en dessous, sur toute la largeur.
              const ring = Math.max(36, Math.min(tileWidth * 0.5, tileHeight * 0.5));
              const icon = ring * 0.8;
              const markOnly = WORDMARK_ONLY.has(g.id); // icône = logo écrit : logo seul, sur toute la tuile
              const markHeight = markOnly ? tileHeight - 24 : Math.max(24, tileHeight - ring - 16 - 6);
              return (
                <Pressable
                  key={g.id}
                  disabled={!on}
                  onPress={() => router.push({ pathname: '/[tcg]', params: { tcg: g.id } })}
                  accessibilityLabel={on ? g.name : `${g.name} · ${t('Pas de cartes dans cette langue')}`}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      width: tileWidth,
                      height: tileHeight,
                      borderColor: `${g.color}55`,
                      backgroundImage: `linear-gradient(150deg, ${g.color}D9 0%, ${g.color}40 50%, ${colors.surface} 100%)`,
                    },
                    pressed && styles.pressed,
                    !on && styles.off,
                  ]}
                >
                  {!on ? <Ionicons name="lock-closed" size={15} color={colors.text} style={styles.lock} /> : null}
                  {markOnly ? null : (
                    <View style={[styles.iconRing, { width: ring, height: ring, borderRadius: ring / 3.2 }]}>
                      <Image source={GAME_ICONS[g.id]} cachePolicy="memory" style={{ width: icon, height: icon, borderRadius: icon / 5 }} contentFit="contain" />
                    </View>
                  )}
                  <Image
                    source={GAME_WORDMARKS[g.id]}
                    cachePolicy="memory"
                    style={{ width: tileWidth - 16, height: markHeight }}
                    contentFit="contain"
                    tintColor={WORDMARK_TINT[g.id]}
                    accessible={false}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: PAD, paddingBottom: 12, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 5, height: 46,
    borderRadius: 23, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  searchGo: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 },
  sectionLabelActive: { color: colors.accent },
  langs: { flexDirection: 'row', justifyContent: 'space-between' }, // 8 langues sur une ligne
  lang: {
    width: '11.4%', aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  langActive: { backgroundColor: `${colors.accent}2E`, borderColor: colors.accent, borderWidth: 2 },
  flag: { fontSize: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  section: { color: colors.text, fontSize: 19, fontWeight: '800' },
  sectionCount: { color: colors.muted, fontWeight: '700' },
  gridArea: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { borderRadius: 18, padding: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  off: { opacity: 0.38 },
  lock: { position: 'absolute', top: 8, right: 8 },
  iconRing: { backgroundColor: 'rgba(15,17,21,0.55)', alignItems: 'center', justifyContent: 'center' },
});
