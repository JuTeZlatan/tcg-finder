// Section « Compte » du menu : connexion (Google ou e-mail) pour sauvegarder la collection en ligne, et déconnexion.
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authErrorMessage, resendVerification, resetPassword, signInWithEmail, signInWithGoogle, signOut, signUpWithEmail } from '../lib/firebase';
import { useSync } from '../lib/sync';
import { colors, radius } from '../lib/theme';
import { locale, t } from '../lib/i18n';

const ITEM_BG = 'rgba(25, 28, 35, 0.85)'; // colors.surface, comme le reste du menu

function syncLabel(status) {
  if (status.state === 'syncing') return t('Sauvegarde en cours…');
  if (status.state === 'error') return t('Sauvegarde impossible : {0}', { 0: status.error });
  if (status.at) return t('Collection sauvegardée à {0}', { 0: new Date(status.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) });
  return t('Collection sauvegardée automatiquement');
}

export default function AccountSection() {
  const { user, verified, checkVerified, status, syncNow } = useSync();
  const [form, setForm] = useState(null); // null, 'signin' ou 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const attempt = async (fn) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ error: true, text: authErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  if (user === undefined) return null;

  const askSignOut = () => Alert.alert(t('Se déconnecter ?'), t('Ta collection reste sur ce téléphone et dans ton compte.'), [
    { text: t('Annuler'), style: 'cancel' },
    { text: t('Se déconnecter'), style: 'destructive', onPress: () => signOut() },
  ]);

  // Compte e-mail pas encore confirmé : la sauvegarde attend le clic sur le lien reçu.
  if (user && !verified) {
    return (
      <View style={styles.block}>
        <View style={styles.row}>
          <Ionicons name="mail-unread-outline" size={20} color={colors.accent} />
          <Text style={[styles.title, { flex: 1 }]}>{t('Confirme ton adresse e-mail')}</Text>
        </View>
        <Text style={styles.muted}>
          {t('Un lien a été envoyé à {email}. Ouvre-le (pense aux spams), puis reviens ici : la sauvegarde démarrera ensuite.', { email: user.email })}
        </Text>
        <Pressable
          style={styles.primary}
          disabled={busy}
          onPress={() => attempt(async () => {
            if (!(await checkVerified())) setMessage({ error: true, text: t('Adresse pas encore confirmée : ouvre le lien reçu par e-mail.') });
          })}
        >
          <Text style={styles.primaryText}>{t('J’ai confirmé mon adresse')}</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          disabled={busy}
          onPress={() => attempt(async () => {
            await resendVerification();
            setMessage({ text: t('Nouvel e-mail de confirmation envoyé.') });
          })}
        >
          <Ionicons name="refresh" size={18} color={colors.text} />
          <Text style={styles.secondaryText}>{t('Renvoyer l’e-mail')}</Text>
        </Pressable>
        <Pressable onPress={askSignOut}>
          <Text style={[styles.muted, { textAlign: 'center' }]}>{t('Se déconnecter')}</Text>
        </Pressable>
        {busy ? <ActivityIndicator color={colors.accent} /> : null}
        {message ? <Text style={[styles.muted, message.error && { color: colors.danger }]}>{message.text}</Text> : null}
      </View>
    );
  }

  if (user) {
    return (
      <View style={styles.block}>
        <View style={styles.row}>
          <Ionicons name="cloud-done" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{user.email || user.displayName || t('Compte connecté')}</Text>
            <Pressable onPress={syncNow} disabled={status.state === 'syncing'}>
              <Text style={[styles.muted, status.state === 'error' && { color: colors.danger }]}>{syncLabel(status)}</Text>
            </Pressable>
          </View>
          {status.state === 'syncing' ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        </View>
        <Pressable
          style={styles.secondary}
          onPress={askSignOut}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.text} />
          <Text style={styles.secondaryText}>{t('Se déconnecter')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={styles.muted}>{t('Connecte-toi pour sauvegarder ta collection et la retrouver sur un autre téléphone.')}</Text>
      {!form ? (
        <>
          <Pressable style={styles.primary} onPress={() => attempt(signInWithGoogle)} disabled={busy}>
            <Ionicons name="logo-google" size={18} color="#1A1A1A" />
            <Text style={styles.primaryText}>{t('Se connecter avec Google')}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setForm('signin')} disabled={busy}>
            <Ionicons name="mail-outline" size={18} color={colors.text} />
            <Text style={styles.secondaryText}>{t('Se connecter avec un e-mail')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={form === 'signup' ? t('Mot de passe (6 caractères min.)') : t('Mot de passe')}
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoComplete={form === 'signup' ? 'new-password' : 'current-password'}
          />
          <Pressable
            style={styles.primary}
            disabled={busy || !email || !password}
            onPress={() => attempt(() => (form === 'signup' ? signUpWithEmail : signInWithEmail)(email, password))}
          >
            <Text style={styles.primaryText}>{form === 'signup' ? t('Créer mon compte') : t('Se connecter')}</Text>
          </Pressable>
          <View style={styles.links}>
            <Pressable onPress={() => { setForm(form === 'signup' ? 'signin' : 'signup'); setMessage(null); }}>
              <Text style={styles.link}>{form === 'signup' ? t('J’ai déjà un compte') : t('Créer un compte')}</Text>
            </Pressable>
            {form === 'signin' ? (
              <Pressable
                onPress={() => (email
                  ? attempt(async () => {
                    await resetPassword(email);
                    setMessage({ text: t('Si un compte existe pour cette adresse, un e-mail vient d’être envoyé : suis son lien pour choisir un nouveau mot de passe (pense aux spams).') });
                  })
                  : setMessage({ error: true, text: t('Indique ton e-mail ci-dessus.') }))}
              >
                <Text style={styles.link}>{t('Mot de passe oublié')}</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={() => { setForm(null); setMessage(null); }}>
            <Text style={[styles.muted, { textAlign: 'center' }]}>{t('Retour')}</Text>
          </Pressable>
        </>
      )}
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
      {message ? <Text style={[styles.muted, message.error && { color: colors.danger }]}>{message.text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: ITEM_BG, borderRadius: radius, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 10 },
  primaryText: { color: '#1A1A1A', fontWeight: '800' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '700' },
  input: { color: colors.text, backgroundColor: 'rgba(15,17,21,0.9)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  link: { color: colors.accent, fontWeight: '700', fontSize: 13 },
});
