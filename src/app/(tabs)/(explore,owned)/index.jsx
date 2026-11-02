// Accueil « Explorer » : en-tête personnalisé (pseudo, avatar, valeur de la collection), recherche dans tous les jeux,
// langue des cartes, puis les jeux en grandes cartes à dégradé aux couleurs de chacun. Un jeu sans cartes dans la
// langue choisie est grisé avec un cadenas (sauf les jeux affichés en anglais en attendant une version officielle).
import { router, useScrollToTop } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TCGS, dataLang } from '../../../api';
import { useCollection, summarize, groupBy } from '../../../lib/collection';
import { CARD_LANGS, LANG_NAMES, useCardLang } from '../../../lib/cardLang';
import { formatPrice } from '../../../lib/prices';
import { colors } from '../../../lib/theme';
import { GAME_ICONS } from '../../../lib/gameIcons';
import { useSettings } from '../../../lib/settings';
import { Avatar } from '../../../components/SideMenu';
import { plural, t } from '../../../lib/i18n';

const FLAGS = { fr: '🇫🇷', en: '🇬🇧', ja: '🇯🇵', zh: '🇨🇳' };
const GAP = 12;
const PAD = 18;

export default function Home() {
  const { settings } = useSettings(); // (réaffiche aussi les prix quand la devise ou le taux du jour change)
  const { items } = useCollection();
  const perTcg = useMemo(() => groupBy(items, (i) => i.tcg), [items]);
  const total = useMemo(() => summarize(items), [items]);
  const { cardLang, setCardLang } = useCardLang();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const columns = width > 700 ? 3 : 2;
  const tileWidth = (width - PAD * 2 - GAP * (columns - 1)) / columns;
  // Toucher l'onglet « Explorer » déjà ouvert ramène en haut de la page.
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  // Recherche dans tous les jeux à la fois.
  const [query, setQuery] = useState('');
  const search = () => query.trim() && router.push({ pathname: '/search', params: { q: query.trim() } });
  const available = (g) => g.languages.includes(cardLang) || !!g.englishFallback;
  // Préchargement des listes d'extensions de chaque jeu : l'ouverture d'un jeu devient instantanée.
  useEffect(() => {
    for (const g of TCGS) g.getSets(dataLang(g, cardLang)).catch(() => {});
  }, [cardLang]);

  return (
    <View style={styles.screen}>
    <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={[styles.page, { paddingTop: insets.top + 14 }]} keyboardShouldPersistTaps="handled">
      {/* En-tête : salutation et avatar */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>{settings.pseudo ? t('Salut {name}', { name: settings.pseudo }) : t('Salut !')}</Text>
          <Text style={styles.title}>{t('Choisis ton TCG')}</Text>
        </View>
        <Avatar avatar={settings.avatar} pseudo={settings.pseudo} size={48} />
      </View>

      {/* Valeur de la collection (raccourci vers « Ma collection ») */}
      <Pressable style={({ pressed }) => [styles.hero, pressed && styles.pressed]} onPress={() => router.navigate('/(tabs)/(owned)')}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroLabel}>{t('Valeur de ma collection')}</Text>
          <Text style={styles.heroValue}>{formatPrice(total.value, 'EUR')}</Text>
          <Text style={styles.heroMeta}>{plural(total.cards, '{n} carte', '{n} cartes')} · {plural(perTcg.size, '{n} jeu', '{n} jeux')}</Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="albums" size={26} color="#1A1A1A" />
        </View>
      </Pressable>

      {/* Recherche dans tous les jeux */}
      <View style={styles.search}>
        <Ionicons name="search" size={20} color={colors.muted} />
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
            <Ionicons name="arrow-forward" size={18} color="#1A1A1A" />
          </Pressable>
        ) : null}
      </View>

      {/* Langue des cartes */}
      <View style={{ gap: 8 }}>
        <Text style={styles.sectionLabel}>{t('Langue des cartes')}</Text>
        <View style={styles.langs}>
          {CARD_LANGS.map((l) => {
            const active = cardLang === l;
            return (
              <Pressable key={l} style={[styles.lang, active && styles.langActive]} onPress={() => setCardLang(l)}>
                <Text style={styles.flag}>{FLAGS[l]}</Text>
                <Text style={[styles.langText, active && styles.langTextActive]} numberOfLines={1} adjustsFontSizeToFit>{t(LANG_NAMES[l])}</Text>
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
      <View style={styles.grid}>
        {TCGS.map((g) => {
          const owned = perTcg.get(g.id);
          const s = owned && summarize(owned);
          const on = available(g);
          return (
            <Pressable
              key={g.id}
              disabled={!on}
              onPress={() => router.push({ pathname: '/[tcg]', params: { tcg: g.id } })}
              style={({ pressed }) => [
                styles.tile,
                {
                  width: tileWidth,
                  borderColor: `${g.color}55`,
                  backgroundImage: `linear-gradient(150deg, ${g.color}D9 0%, ${g.color}40 48%, ${colors.surface} 100%)`,
                },
                pressed && styles.pressed,
                !on && styles.off,
              ]}
            >
              <View style={styles.tileTop}>
                <View style={styles.iconRing}>
                  <Image source={GAME_ICONS[g.id]} cachePolicy="memory" style={styles.icon} contentFit="contain" />
                </View>
                {!on ? (
                  <Ionicons name="lock-closed" size={18} color={colors.text} />
                ) : s ? (
                  <View style={styles.ownedPill}>
                    <Ionicons name="albums" size={11} color="#1A1A1A" />
                    <Text style={styles.ownedPillText}>{s.cards}</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ gap: 2 }}>
                <Text style={styles.tileName} numberOfLines={1} adjustsFontSizeToFit>{g.name}</Text>
                <Text style={styles.tileTagline} numberOfLines={2}>
                  {on ? t(g.tagline) : t('Pas de cartes dans cette langue')}
                </Text>
                {s && on ? <Text style={styles.tileValue}>{formatPrice(s.value, 'EUR')}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
    {/* Fond derrière la barre d'état : le contenu qui défile ne passe pas sous l'heure et les icônes. */}
    <View style={[styles.statusBar, { height: insets.top }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg },
  page: { paddingHorizontal: PAD, paddingBottom: 32, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24,
    borderWidth: 1, borderColor: `${colors.accent}66`,
    backgroundImage: `linear-gradient(135deg, ${colors.accent}40 0%, ${colors.surfaceAlt} 60%, ${colors.surface} 100%)`,
  },
  heroLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  heroValue: { color: colors.accent, fontSize: 30, fontWeight: '900' },
  heroMeta: { color: colors.text, fontSize: 13, opacity: 0.8 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 6, height: 54,
    borderRadius: 27, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16 },
  searchGo: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  langs: { flexDirection: 'row', gap: 8 },
  lang: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10,
    borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  langActive: { backgroundColor: `${colors.accent}26`, borderColor: colors.accent },
  flag: { fontSize: 16 },
  langText: { color: colors.muted, fontWeight: '700', fontSize: 13, flexShrink: 1 },
  langTextActive: { color: colors.accent },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  section: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sectionCount: { color: colors.muted, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { minHeight: 170, borderRadius: 24, padding: 14, borderWidth: 1, justifyContent: 'space-between', overflow: 'hidden' },
  off: { opacity: 0.38 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  iconRing: { width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(15,17,21,0.55)', alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, borderRadius: 10 },
  ownedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  ownedPillText: { color: '#1A1A1A', fontWeight: '800', fontSize: 12 },
  tileName: { color: colors.text, fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  tileTagline: { color: colors.text, opacity: 0.72, fontSize: 12, lineHeight: 16 },
  tileValue: { color: colors.accent, fontWeight: '800', fontSize: 14, marginTop: 2 },
});
