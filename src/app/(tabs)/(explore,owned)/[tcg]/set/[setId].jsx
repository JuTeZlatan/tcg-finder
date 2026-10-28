import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { colors } from '../../../../../lib/theme';
import { useSettings } from '../../../../../lib/settings';
import { getTcg, dataLang } from '../../../../../api';
import { useCardLang } from '../../../../../lib/cardLang';
import CardGrid from '../../../../../components/CardGrid';
import { t } from '../../../../../lib/i18n';

export default function SetScreen() {
  const { tcg: tcgId, setId, name } = useLocalSearchParams();
  const tcg = getTcg(tcgId);
  const lang = dataLang(tcg, useCardLang().cardLang);
  // « Simplifié » : une carte par numéro. « Master set » : chaque version (normale, reverse, foil, motifs, raretés…).
  const { settings } = useSettings();
  const [mode, setMode] = useState(settings.setView === 'master' ? 'master' : 'simple');
  const master = mode === 'master' && !!tcg.getVersions;
  const toggle = tcg.getVersions ? (
    <View style={styles.chips}>
      {[['simple', t('Simplifié')], ['master', t('Master set')]].map(([k, label]) => (
        <Pressable key={k} onPress={() => setMode(k)} style={[styles.chip, mode === k && styles.chipActive]}>
          <Text style={[styles.chipText, mode === k && styles.chipTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  ) : null;
  return (
    <>
      <Stack.Screen options={{ title: name || setId }} />
      <CardGrid
        tcg={tcg}
        lang={lang}
        load={() => (master ? tcg.getVersions(setId, lang) : tcg.getCards(setId, lang))}
        deps={[tcg.id, setId, lang, master]}
        setId={setId}
        headerExtra={toggle}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#1A1A1A' },
});
