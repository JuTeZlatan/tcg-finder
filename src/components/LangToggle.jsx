import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CARD_LANGS, LANG_NAMES, useCardLang } from '../lib/cardLang';
import { colors } from '../lib/theme';

export default function LangToggle({ note }) {
  const { cardLang, setCardLang } = useCardLang();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>Cartes en</Text>
        <View style={styles.segment}>
          {CARD_LANGS.map((l) => (
            <Pressable key={l} onPress={() => setCardLang(l)} style={[styles.option, cardLang === l && styles.active]}>
              <Text style={[styles.optionText, cardLang === l && styles.activeText]}>{LANG_NAMES[l]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
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
