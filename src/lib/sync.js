// Sauvegarde de la collection et du profil sur le compte (Firestore), dans les deux sens :
// - à la connexion, la collection du téléphone et celle du compte sont fusionnées (pour chaque carte, la modification
//   la plus récente l'emporte ; une carte retirée reste retirée) ;
// - ensuite, chaque changement est envoyé quelques secondes après.
// Données : users/{uid} (profil, réglages, historique de valeur), users/{uid}/items/{carte},
// users/{uid}/photos/{id} (photos des cartes « Autres » et de l'avatar, réduites, en base64 : sans Firebase Storage).
// Les prix des cartes du catalogue ne sont pas envoyés : chaque téléphone les recalcule.
import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { db, isVerified, onUser } from './firebase';
import { useCollection } from './collection';
import { useSettings } from './settings';

const PUSH_DELAY = 3000;
const SYNCED_SETTINGS = ['pseudo', 'avatar', 'setView', 'priceSource', 'currency', 'followed', 'updatedAt'];
const PRICE_FIELDS = ['price', 'priceAt', 'divergent'];

const docId = (key) => encodeURIComponent(key);
const isLocalFile = (uri) => typeof uri === 'string' && uri.startsWith('file:');
const fileName = (uri) => uri.split('/').pop();
// JSON aux clés triées : pour comparer une carte du téléphone avec sa copie en ligne.
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

// Ce qui part en ligne pour une carte : sans les prix du catalogue ni le chemin local de la photo.
function payloadOf(item) {
  const out = { ...item };
  if (item.tcg !== 'custom') for (const f of PRICE_FIELDS) delete out[f];
  if (isLocalFile(item.image)) {
    out.photo = fileName(item.image);
    delete out.image;
  }
  return JSON.parse(JSON.stringify(out)); // Firestore refuse les `undefined`
}

function profilePayload(settings) {
  const out = {};
  for (const k of SYNCED_SETTINGS) out[k] = settings[k] ?? null;
  if (out.avatar?.type === 'photo') out.avatar = { type: 'photo', photo: fileName(out.avatar.uri) };
  return JSON.parse(JSON.stringify(out));
}

// Photo réduite (500 px de large, JPEG) : tient largement dans un document Firestore (1 Mo maximum).
async function photoBase64(uri) {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 500 }).renderAsync();
  const res = await ref.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return res.base64;
}

// Photo téléchargée du compte, rangée avec les autres photos de l'appli (même nom de fichier que sur l'autre téléphone).
async function restorePhoto(uid, name, folder) {
  const dir = new Directory(Paths.document, folder);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, name);
  if (file.exists) return file.uri;
  const snap = await getDoc(doc(db, 'users', uid, 'photos', docId(name)));
  if (!snap.exists()) return null;
  file.write(snap.data().data, { encoding: 'base64' });
  return file.uri;
}

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const collectionApi = useCollection();
  const { loaded, state, getState, applySync, refreshPrices } = collectionApi;
  const { settings, loaded: settingsLoaded, update: updateSettings } = useSettings();
  const [user, setUser] = useState(undefined); // undefined = pas encore connu
  const [status, setStatus] = useState({ state: 'idle', at: null, error: null });
  const ready = useRef(false); // fusion initiale terminée : les envois peuvent commencer
  const sent = useRef({ items: {}, profile: null, photos: new Set() }); // dernier état envoyé
  const timer = useRef(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Compte e-mail : rien n'est sauvegardé tant que l'adresse n'est pas confirmée.
  const [verified, setVerified] = useState(false);
  useEffect(() => onUser((u) => {
    setUser(u || null);
    isVerified(u).then(setVerified);
  }), []);
  const checkVerified = useCallback(async () => {
    const ok = await isVerified(user, true);
    setVerified(ok);
    return ok;
  }, [user]);

  // Envoie ce qui a changé depuis le dernier envoi.
  const push = useCallback(async (uid) => {
    const s = getState();
    const writes = [];
    const nextItems = { ...sent.current.items };
    for (const item of Object.values(s.items)) {
      const id = docId(item.key);
      const json = stable(payloadOf(item));
      if (nextItems[id] !== json) {
        writes.push([doc(db, 'users', uid, 'items', id), payloadOf(item)]);
        nextItems[id] = json;
      }
      if (isLocalFile(item.image)) writes.push(['photo', item.image]);
    }
    for (const [key, at] of Object.entries(s.deleted || {})) {
      const id = docId(key);
      if (s.items[key] || nextItems[id] === `deleted:${at}`) continue;
      writes.push([doc(db, 'users', uid, 'items', id), { key, deleted: true, updatedAt: at }]);
      nextItems[id] = `deleted:${at}`;
    }
    const profile = { ...profilePayload(settingsRef.current), history: s.history };
    const profileJson = JSON.stringify(profile);
    if (profileJson !== sent.current.profile) writes.push([doc(db, 'users', uid), profile]);
    if (settingsRef.current.avatar?.type === 'photo') writes.push(['photo', settingsRef.current.avatar.uri]);

    // Photos : envoyées une seule fois chacune (le nom du fichier change quand la photo change).
    const photos = writes.filter(([w, uri]) => w === 'photo' && !sent.current.photos.has(fileName(uri)));
    for (const [, uri] of photos) {
      try {
        const data = await photoBase64(uri);
        await setDoc(doc(db, 'users', uid, 'photos', docId(fileName(uri))), { data });
      } catch {
        // photo illisible : la carte est quand même sauvegardée
      }
      sent.current.photos.add(fileName(uri));
    }
    const docs = writes.filter(([w]) => w !== 'photo');
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const [ref, data] of docs.slice(i, i + 400)) batch.set(ref, data);
      await batch.commit();
    }
    sent.current.items = nextItems;
    sent.current.profile = profileJson;
  }, [getState]);

  const run = useCallback(async (uid, job) => {
    setStatus((s) => ({ ...s, state: 'syncing', error: null }));
    try {
      await job();
      setStatus({ state: 'ok', at: Date.now(), error: null });
    } catch (e) {
      setStatus({ state: 'error', at: Date.now(), error: e?.code === 'permission-denied' ? 'Accès refusé par Firebase (règles Firestore).' : e?.message || 'Erreur' });
    }
  }, []);

  // Connexion : fusion du téléphone et du compte, puis premier envoi.
  useEffect(() => {
    ready.current = false;
    sent.current = { items: {}, profile: null, photos: new Set() };
    if (!user || !verified || !loaded || !settingsLoaded) return;
    const uid = user.uid;
    let cancelled = false;
    run(uid, async () => {
      const [profileSnap, itemsSnap, photosSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(collection(db, 'users', uid, 'items')),
        getDocs(collection(db, 'users', uid, 'photos')),
      ]);
      if (cancelled) return;
      for (const p of photosSnap.docs) sent.current.photos.add(decodeURIComponent(p.id));

      // Cartes : la version la plus récente de chaque carte l'emporte.
      const remote = itemsSnap.docs.map((d) => [d.id, d.data()]);
      const local = getState();
      const incoming = [];
      for (const [id, r] of remote) {
        const key = r.key;
        const mine = local.items[key];
        const mineAt = mine ? mine.updatedAt || mine.addedAt || 0 : local.deleted?.[key] || 0;
        if ((r.updatedAt || 0) > mineAt) incoming.push(r);
        // ce qui est identique en ligne n'a pas besoin d'être renvoyé
        sent.current.items[id] = r.deleted ? `deleted:${r.updatedAt}` : stable(r);
      }
      // Photos des cartes reçues : téléchargées avant d'afficher les cartes.
      for (const r of incoming) {
        if (r.photo) r.image = (await restorePhoto(uid, r.photo, 'cards').catch(() => null)) || null;
      }
      if (incoming.length) {
        applySync((prev) => {
          const items = { ...prev.items };
          const deleted = { ...prev.deleted };
          for (const r of incoming) {
            if (r.deleted) {
              delete items[r.key];
              deleted[r.key] = r.updatedAt;
            } else {
              const { photo, ...rest } = r;
              const old = items[r.key];
              // prix du catalogue gardés s'ils sont déjà connus, sinon recalculés plus bas
              items[r.key] = { ...rest, price: rest.price ?? old?.price ?? null, priceAt: old?.priceAt ?? null };
              delete deleted[r.key];
            }
          }
          return { ...prev, items, deleted };
        });
      }

      // Profil : réglages les plus récents ; historique de valeur complété avec les jours manquants.
      const profile = profileSnap.exists() ? profileSnap.data() : null;
      if (profile) {
        if ((profile.updatedAt || 0) > (settingsRef.current.updatedAt || 0)) {
          const patch = {};
          for (const k of SYNCED_SETTINGS) if (k in profile) patch[k] = profile[k];
          if (profile.avatar?.type === 'photo') {
            const uri = await restorePhoto(uid, profile.avatar.photo, 'profile').catch(() => null);
            patch.avatar = uri ? { type: 'photo', uri } : null;
          }
          updateSettings(patch, { fromSync: true });
          settingsRef.current = { ...settingsRef.current, ...patch };
        }
        if (profile.history?.length) {
          applySync((prev) => {
            const byDate = new Map(profile.history.map((h) => [h.date, h]));
            for (const h of prev.history) byDate.set(h.date, h);
            return { ...prev, history: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-365) };
          });
        }
      }
      if (incoming.some((r) => !r.deleted && r.tcg !== 'custom')) refreshPrices();
      // laisse React appliquer la fusion avant le premier envoi
      await new Promise((r) => setTimeout(r, 300));
      if (cancelled) return;
      await push(uid);
      ready.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [user, verified, loaded, settingsLoaded, getState, applySync, updateSettings, refreshPrices, push, run]);

  // Chaque changement (collection ou profil) : envoi groupé quelques secondes plus tard.
  useEffect(() => {
    if (!user || !ready.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(user.uid, () => push(user.uid)), PUSH_DELAY);
    return () => clearTimeout(timer.current);
  }, [user, state, settings, push, run]);

  const syncNow = useCallback(() => user && ready.current && run(user.uid, () => push(user.uid)), [user, push, run]);

  // ready n’est lu que dans syncNow (au toucher), jamais pendant le rendu.
  // eslint-disable-next-line react-hooks/refs
  return createElement(SyncContext.Provider, { value: { user, verified, checkVerified, status, syncNow } }, children);
}

export const useSync = () => useContext(SyncContext);
