// Menu latéral (profil et réglages) : s'ouvre depuis la gauche sur une partie de l'écran, par le bouton « Menu »
// de la barre d'onglets. En haut : avatar rond et pseudo, puis prix et réglages.
import { useEffect, useMemo, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../lib/settings';
import { useCollection, summarize } from '../lib/collection';
import { CARD_LANGS, LANG_NAMES, useCardLang } from '../lib/cardLang';
import { GAME_ICONS } from '../lib/gameIcons';
import { CURRENCIES, PRICE_SOURCES, formatPrice } from '../lib/prices';
import { colors, radius } from '../lib/theme';
import AccountSection from './AccountSection';
import { APP_LANGS, plural, t, useI18n } from '../lib/i18n';

// La photo d'avatar est copiée dans l'espace de l'appli (le cache peut être vidé par le système).
async function keepAvatar(uri) {
  const dir = new Directory(Paths.document, 'profile');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `avatar-${Date.now()}.jpg`);
  await new File(uri).copy(dest, { overwrite: true });
  return dest.uri;
}

export function Avatar({ avatar, pseudo, size = 72 }) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (avatar?.type === 'photo') return <Image source={avatar.uri} style={[styles.avatar, style]} contentFit="cover" />;
  if (avatar?.type === 'game' && GAME_ICONS[avatar.id]) {
    return <Image source={GAME_ICONS[avatar.id]} style={[styles.avatar, style]} contentFit="contain" />;
  }
  return (
    <View style={[styles.avatar, styles.avatarEmpty, style]}>
      {pseudo ? <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{pseudo[0].toUpperCase()}</Text>
        : <Ionicons name="person" size={size * 0.5} color={colors.muted} />}
    </View>
  );
}

export default function SideMenu({ open, onClose, initialPage = 'main' }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(340, width * 0.82);
  const [x] = useState(() => new Animated.Value(-panelWidth));
  const [visible, setVisible] = useState(open);
  // Ouverture : la fenêtre apparaît tout de suite (l'animation d'entrée suit) ; elle ne disparaît qu'après la sortie.
  if (open && !visible) setVisible(true);
  const [choosingAvatar, setChoosingAvatar] = useState(false);
  // 'main' (profil, compte), 'settings' (page Réglages) ou 'language' (langue de l'appli) ;
  // une fois refermé, le menu se rouvre sur la page principale.
  const [page, setPage] = useState(initialPage);
  if (!open && !visible && page !== 'main') setPage('main');
  const { settings, update } = useSettings();
  const { cardLang, setCardLang } = useCardLang();
  const { appLang, setAppLang } = useI18n();
  const { items, refresh, refreshPrices } = useCollection();
  const total = useMemo(() => summarize(items), [items]);

  // Entrée depuis la gauche ; à la fermeture, sortie animée puis disparition de la fenêtre.
  useEffect(() => {
    if (open) {
      Animated.timing(x, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    } else {
      Animated.timing(x, { toValue: -panelWidth, duration: 180, useNativeDriver: true }).start(() => setVisible(false));
    }
  }, [open, panelWidth, x]);

  const pickPhoto = async (camera) => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return;
    const options = { quality: 0.7, allowsEditing: true, aspect: [1, 1] };
    const res = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync({ ...options, mediaTypes: 'images' });
    if (res.canceled) return;
    const uri = await keepAvatar(res.assets[0].uri).catch(() => res.assets[0].uri);
    update({ avatar: { type: 'photo', uri } });
    setChoosingAvatar(false);
  };

  const backTo = (title) => (
    <Pressable style={styles.back} onPress={() => setPage('main')} hitSlop={8}>
      <Ionicons name="chevron-back" size={22} color={colors.text} />
      <Text style={styles.pageTitle}>{title}</Text>
    </Pressable>
  );

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Conteneur plein écran : sans lui, Android ignore les touchers hors du menu (zone assombrie). */}
      <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Fermer le menu')} />
      <Animated.View style={[styles.panel, { width: panelWidth, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 8, transform: [{ translateX: x }] }]}>
        <ScrollView contentContainerStyle={{ gap: 18, paddingHorizontal: 18, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {page === 'main' ? (
          <>
          {/* Profil : avatar rond (touche pour le changer) et pseudo */}
          <View style={styles.profile}>
            <Pressable onPress={() => setChoosingAvatar((v) => !v)} accessibilityLabel={t('Changer d’avatar')}>
              <Avatar avatar={settings.avatar} pseudo={settings.pseudo} />
              <View style={styles.editBadge}><Ionicons name="camera" size={13} color="#1A1A1A" /></View>
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <TextInput
                style={styles.pseudo}
                value={settings.pseudo}
                onChangeText={(pseudo) => update({ pseudo })}
                placeholder={t('Ton pseudo')}
                placeholderTextColor={colors.muted}
                maxLength={24}
              />
              <Text style={styles.muted}>{plural(total.cards, '{n} carte', '{n} cartes')} · {formatPrice(total.value, 'EUR')}</Text>
            </View>
          </View>

          {choosingAvatar ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>{t('Choisir un avatar')}</Text>
              <View style={styles.row}>
                <Option icon="camera" label={t('Photo')} onPress={() => pickPhoto(true)} />
                <Option icon="images" label={t('Galerie')} onPress={() => pickPhoto(false)} />
                <Option icon="close-circle-outline" label={t('Aucun')} onPress={() => { update({ avatar: null }); setChoosingAvatar(false); }} />
              </View>
              <View style={styles.iconGrid}>
                {Object.keys(GAME_ICONS).map((id) => (
                  <Pressable key={id} onPress={() => { update({ avatar: { type: 'game', id } }); setChoosingAvatar(false); }}>
                    <Avatar avatar={{ type: 'game', id }} size={44} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <Section title={t('Compte')}>
            <AccountSection />
          </Section>

          <View style={{ gap: 8 }}>
            <NavRow icon="settings-outline" label={t('Réglages')} onPress={() => setPage('settings')} />
            <NavRow icon="language-outline" label={t('Langue')} value={APP_LANGS[appLang]} onPress={() => setPage('language')} />
          </View>
          </>
          ) : page === 'language' ? (
          <>
          {/* Page « Langue » : langue de toute l'appli (textes, dates, nombres) */}
          {backTo(t('Langue'))}
          <View style={{ gap: 8 }}>
            {Object.entries(APP_LANGS).map(([k, label]) => (
              <Pressable key={k} style={[styles.navRow, appLang === k && styles.navRowActive]} onPress={() => setAppLang(k)}>
                <Text style={[styles.navText, appLang === k && { color: colors.accent }]}>{label}</Text>
                {appLang === k ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
              </Pressable>
            ))}
          </View>
          </>
          ) : (
          <>
          {/* Page « Réglages » : prix, devise, langue des cartes, affichage des extensions */}
          {backTo(t('Réglages'))}

          <Section title={t('Prix')}>
            {/* Site(s) de prix : toute l'appli suit ce choix (fiches, moyennes, valeur de la collection). */}
            <Text style={styles.label}>{t('Prix pris en compte')}</Text>
            <View style={styles.row}>
              {Object.entries(PRICE_SOURCES).map(([k, label]) => (
                <Chip
                  key={k}
                  label={t(label)}
                  active={settings.priceSource === k}
                  onPress={() => {
                    if (settings.priceSource === k) return;
                    update({ priceSource: k });
                    if (!refresh) refreshPrices(); // valeur de la collection recalculée avec la nouvelle source
                  }}
                />
              ))}
            </View>
            <Text style={styles.label}>{t('Devise')}</Text>
            <View style={styles.row}>
              {Object.entries(CURRENCIES).map(([k, label]) => (
                <Chip key={k} label={t(label)} active={(settings.currency || 'EUR') === k} onPress={() => update({ currency: k })} />
              ))}
            </View>
            <Text style={styles.muted}>{t('Tous les prix sont convertis au taux de change du jour.')}</Text>
          </Section>

          <Section title={t('Cartes')}>
            <Text style={styles.label}>{t('Langue des cartes')}</Text>
            <View style={styles.row}>
              {CARD_LANGS.map((l) => <Chip key={l} label={t(LANG_NAMES[l])} active={cardLang === l} onPress={() => setCardLang(l)} />)}
            </View>
            <Text style={styles.label}>{t('Affichage des extensions')}</Text>
            <View style={styles.row}>
              <Chip label={t('Simplifié')} active={settings.setView !== 'master'} onPress={() => update({ setView: 'simple' })} />
              <Chip label={t('Master set')} active={settings.setView === 'master'} onPress={() => update({ setView: 'master' })} />
            </View>
          </Section>
          </>
          )}
        </ScrollView>
      </Animated.View>
      </View>
    </Modal>
  );
}

function NavRow({ icon, label, value, onPress }) {
  return (
    <Pressable style={styles.navRow} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={styles.navText} numberOfLines={1}>{label}</Text>
      {value ? <Text style={styles.navValue} numberOfLines={1}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Option({ icon, label, onPress }) {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

// Panneau légèrement transparent (couleurs du thème) pour voir l'écran derrière.
const PANEL_BG = 'rgba(35, 39, 51, 0.94)'; // colors.surfaceAlt
const ITEM_BG = 'rgba(25, 28, 35, 0.85)'; // colors.surface

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: PANEL_BG, borderTopRightRadius: 20, borderBottomRightRadius: 20 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.accent, overflow: 'hidden' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.accent, fontWeight: '800' },
  editBadge: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  pseudo: { color: colors.text, fontSize: 20, fontWeight: '800', paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  block: { backgroundColor: ITEM_BG, borderRadius: radius, padding: 12, gap: 10 },
  blockTitle: { color: colors.text, fontWeight: '700' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  label: { color: colors.text, fontWeight: '600', marginTop: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: ITEM_BG },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#1A1A1A' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ITEM_BG, borderRadius: radius, padding: 14 },
  navRowActive: { borderWidth: 1, borderColor: colors.accent },
  navText: { color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 },
  navValue: { color: colors.muted, fontWeight: '600', maxWidth: 120 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pageTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
});
