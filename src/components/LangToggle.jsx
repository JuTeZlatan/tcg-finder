import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CARD_LANGS, LANG_NAMES, useCardLang } from '../lib/cardLang';
import { t } from '../lib/i18n';
import { colors } from '../lib/theme';

// `langs` : langues proposées (dans l'écran d'un jeu, seulement celles qui existent pour ce jeu) ; par défaut toutes.
// Si la langue choisie n'y est pas, c'est la langue réellement affichée (`shown`, l'anglais) qui est mise en avant.
export default function LangToggle({ note, langs = CARD_LANGS, shown }) {
  const { cardLang, setCardLang } = useCardLang();
  const active = langs.includes(cardLang) ? cardLang : shown;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{t('Cartes en')}</Text>
        <View style={styles.segment}>
          {langs.map((l) => (
            <Pressable key={l} onPress={() => setCardLang(l)} style={[styles.option, active === l && styles.active]}>
              <Text style={[styles.optionText, active === l && styles.activeText]}>{t(LANG_NAMES[l])}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {note ? <Text style={styles.note}>{t(note)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  label: { color: colors.muted },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 999, padding: 3 },
  option: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999 },
  active: { backgroundColor: colors.accent },
  optionText: { color: colors.muted, fontWeight: '600' },
  activeText: { color: '#1A1A1A' },
  note: { color: colors.muted, fontSize: 12, fontStyle: 'italic' },
});
