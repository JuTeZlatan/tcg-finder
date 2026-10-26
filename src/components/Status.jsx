import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

export function Loading({ text = 'Chargement…' }) {
  return (
    <View style={styles.row}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

export function ErrorView({ error, onRetry }) {
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>Impossible de charger les données : {error?.message || String(error)}</Text>
      {onRetry && (
        <Pressable onPress={onRetry}>
          <Text style={styles.retry}>Réessayer</Text>
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
