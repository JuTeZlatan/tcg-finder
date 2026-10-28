import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../lib/i18n';
import { colors } from '../lib/theme';

export function Loading({ text }) {
  return (
    <View style={styles.row}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.muted}>{text ?? t('Chargement…')}</Text>
    </View>
  );
}

export function ErrorView({ error, onRetry }) {
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{t('Impossible de charger les données : {error}', { error: error?.message || String(error) })}</Text>
      {onRetry && (
        <Pressable onPress={onRetry}>
          <Text style={styles.retry}>{t('Réessayer')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  muted: { color: colors.muted },
  error: { backgroundColor: '#3A1D22', borderRadius: 10, padding: 12, gap: 8 },
  errorText: { color: colors.danger },
  retry: { color: colors.accent, fontWeight: '700' },
});
