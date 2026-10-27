// Compte et sauvegarde en ligne (Firebase) : connexion Google ou e-mail, données rangées dans Firestore sous users/{uid}.
// La configuration vient de google-services.json (fichier du projet Firebase, à la racine) : rien d'autre à renseigner.
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, getReactNativePersistence, initializeAuth,
  onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signOut as fbSignOut,
} from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import services from '../../google-services.json';

const client = services.client.find((c) => c.client_info.android_client_info.package_name === 'com.tcgfinder.app') || services.client[0];
const projectId = services.project_info.project_id;

const app = initializeApp({
  apiKey: client.api_key[0].current_key,
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: services.project_info.storage_bucket,
  messagingSenderId: services.project_info.project_number,
  appId: client.client_info.mobilesdk_app_id,
});

// Session gardée sur le téléphone : on reste connecté d'un lancement à l'autre.
export const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
// E-mails de Firebase (confirmation d'adresse, mot de passe oublié) en français.
auth.languageCode = 'fr';
// Sur React Native, le canal temps réel par défaut de Firestore passe mal : on force le « long polling ».
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });

// Identifiant « web » (client OAuth de type 3) : c'est lui que Firebase attend pour vérifier le jeton Google.
const webClientId = client.oauth_client?.find((o) => o.client_type === 3)?.client_id
  || client.services?.appinvite_service?.other_platform_oauth_client?.find((o) => o.client_type === 3)?.client_id;
GoogleSignin.configure({ webClientId });

export const onUser = (cb) => onAuthStateChanged(auth, cb);

// Renvoie null si l'utilisateur a fermé la fenêtre de choix du compte Google.
export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (res.type !== 'success') return null;
  const credential = GoogleAuthProvider.credential(res.data.idToken);
  return (await signInWithCredential(auth, credential)).user;
}

export const signInWithEmail = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
// Nouveau compte e-mail : un lien de confirmation est envoyé ; la sauvegarde démarre une fois l'adresse confirmée.
export async function signUpWithEmail(email, password) {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await sendEmailVerification(user).catch(() => {});
  return user;
}
export const resendVerification = () => sendEmailVerification(auth.currentUser);

// Adresse confirmée ? (relit le compte : le lien a pu être ouvert depuis un autre appareil). Google l'est d'office.
export async function isVerified(user, reload) {
  if (!user) return false;
  if (user.providerData.some((p) => p.providerId === 'google.com')) return true;
  if (reload) await user.reload().catch(() => {});
  return auth.currentUser?.emailVerified ?? user.emailVerified;
}
export const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim());

export async function signOut() {
  await GoogleSignin.signOut().catch(() => {});
  await fbSignOut(auth);
}

// Messages d'erreur Firebase en clair.
export function authErrorMessage(e) {
  const code = e?.code || '';
  if (code.includes('invalid-email')) return 'Adresse e-mail invalide.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'E-mail ou mot de passe incorrect. Mot de passe perdu ? Touche « Mot de passe oublié ».';
  if (code.includes('email-already-in-use')) return 'Un compte existe déjà avec cet e-mail : connecte-toi.';
  if (code.includes('weak-password')) return 'Mot de passe trop court (6 caractères minimum).';
  if (code.includes('too-many-requests')) return 'Trop d’essais : réessaie dans quelques minutes.';
  if (code.includes('network')) return 'Pas de connexion internet.';
  if (code.includes('DEVELOPER_ERROR') || String(e?.message).includes('DEVELOPER_ERROR')) return 'Connexion Google mal configurée (empreinte SHA de l’appli manquante dans Firebase).';
  return e?.message || 'Erreur inconnue.';
}
