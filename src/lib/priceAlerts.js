// Alertes de prix : sur n'importe quelle carte (possédée, recherchée ou simplement consultée), et sur toute la collection.
//
// Quatre règles par carte (settings.alerts, sauvegardées avec le compte) :
// - « below » : le prix passe sous un montant (achat) ;   - « above » : il passe au-dessus d'un montant (vente) ;
// - « drop »  : il baisse d'au moins N % ;                 - « rise »  : il monte d'au moins N %.
// Montant : en euros (comme tous les prix enregistrés). Pourcentage : par rapport au prix de référence (basePrice),
// pris à la création puis à chaque alerte envoyée — l'alerte se réarme ainsi d'elle-même au nouveau niveau.
// Un seuil atteint ne prévient qu'une fois, puis à nouveau seulement si le prix va encore plus loin (2 % au moins) ;
// repassé de l'autre côté du seuil, il est réarmé.
//
// Surveillance de la collection (settings.collectionWatch) : chaque carte possédée valant au moins `minPrice` € qui monte
// ou baisse d'au moins `percent` % depuis la dernière alerte (référence gardée sur le téléphone), et la valeur totale.
//
// Vérification : à l'ouverture de l'appli (au plus toutes les 6 h), après la mise à jour quotidienne des prix de la
// collection, sur demande (« Vérifier maintenant ») et en arrière-plan (src/lib/backgroundTasks.js), même appli fermée.
// Chaque alerte envoyée est gardée dans l'historique (100 dernières) affiché sur la page « Alertes de prix ».
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings, STORAGE_KEY } from './settings';
import { fetchCardInfo } from './collection';
import { formatPrice, setDisplayCurrency, setPreferredSource } from './prices';
import { notifyNow } from './notifications';
import { getTcg } from '../api';
import { locale, t } from './i18n';

export const ALERT_KINDS = ['below', 'above', 'drop', 'rise'];
export const isPercentKind = (kind) => kind === 'drop' || kind === 'rise';
const CHECK_EVERY = 6 * 3600 * 1000;
const AGAIN = 0.02; // nouvel avis seulement si le prix va encore 2 % plus loin
const LOG_KEY = 'alerts.log.v1';
const REFS_KEY = 'alerts.collectionRefs.v1';
const LOG_MAX = 100;

const pct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toLocaleString(locale(), { maximumFractionDigits: 0 })} %`;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const gameName = (tcg) => getTcg(tcg)?.name || '';

// Règle en clair : « Sous 12,00 € », « Hausse de 20 % »…
export function ruleText(a) {
  if (a.kind === 'below') return t('Sous {price}', { price: formatPrice(a.value, 'EUR') });
  if (a.kind === 'above') return t('Au-dessus de {price}', { price: formatPrice(a.value, 'EUR') });
  if (a.kind === 'drop') return t('Baisse de {n} %', { n: a.value });
  return t('Hausse de {n} %', { n: a.value });
}

// Seuil en euros que le prix doit franchir pour déclencher l'alerte (null si la référence manque).
export function thresholdOf(a) {
  if (a.kind === 'below' || a.kind === 'above') return a.value;
  if (a.basePrice == null) return null;
  return a.kind === 'drop' ? a.basePrice * (1 - a.value / 100) : a.basePrice * (1 + a.value / 100);
}

// Écart restant avant l'alerte, en part du prix actuel (0,08 = « encore 8 % »), 0 si le seuil est atteint.
export function distanceOf(a) {
  const threshold = thresholdOf(a);
  if (threshold == null || !a.price) return null;
  const down = a.kind === 'below' || a.kind === 'drop';
  const gap = down ? (a.price - threshold) / a.price : (threshold - a.price) / a.price;
  return Math.max(0, gap);
}

// Nouveau prix d'une alerte : { patch, message } (message : notification à envoyer, sinon null).
export function evaluate(a, price) {
  const base = { price, priceAt: Date.now() };
  if (price == null) return { patch: { priceAt: Date.now() }, message: null };
  const game = gameName(a.tcg);
  if (a.kind === 'below' || a.kind === 'above') {
    const down = a.kind === 'below';
    const met = down ? price <= a.value : price >= a.value;
    if (!met) return { patch: { ...base, triggered: false, notifiedPrice: null }, message: null };
    const further = a.notifiedPrice == null || (down ? price < a.notifiedPrice * (1 - AGAIN) : price > a.notifiedPrice * (1 + AGAIN));
    if (a.triggered && !further) return { patch: base, message: null };
    return {
      patch: { ...base, triggered: true, notifiedPrice: price, notifiedAt: Date.now() },
      message: {
        title: down ? t('Prix en baisse : {name}', { name: a.name }) : t('Prix en hausse : {name}', { name: a.name }),
        body: down
          ? t('{price} · sous ton seuil de {target} · {game}', { price: formatPrice(price, 'EUR'), target: formatPrice(a.value, 'EUR'), game })
          : t('{price} · au-dessus de ton seuil de {target} · {game}', { price: formatPrice(price, 'EUR'), target: formatPrice(a.value, 'EUR'), game }),
      },
    };
  }
  // Pourcentage : la référence est prise au premier prix connu, puis à chaque alerte envoyée.
  if (a.basePrice == null) return { patch: { ...base, basePrice: price }, message: null };
  const change = price / a.basePrice - 1;
  const met = a.kind === 'drop' ? change <= -a.value / 100 : change >= a.value / 100;
  if (!met) return { patch: base, message: null };
  return {
    patch: { ...base, basePrice: price, triggered: true, notifiedPrice: price, notifiedAt: Date.now() },
    message: {
      title: t('{name} : {change}', { name: a.name, change: pct(change) }),
      body: t('{from} → {to} · {game}', { from: formatPrice(a.basePrice, 'EUR'), to: formatPrice(price, 'EUR'), game }),
    },
  };
}

// ---------- Historique des alertes envoyées ----------
export async function readAlertLog() {
  try {
    return JSON.parse((await AsyncStorage.getItem(LOG_KEY)) || '[]');
  } catch {
    return [];
  }
}
async function logAlert(entry) {
  const log = await readAlertLog();
  log.unshift({ at: Date.now(), ...entry });
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, LOG_MAX))).catch(() => {});
}
export const clearAlertLog = () => AsyncStorage.removeItem(LOG_KEY).catch(() => {});

async function send(message, data) {
  await notifyNow(message.title, message.body, data);
  await logAlert({ title: message.title, body: message.body, data });
}

// ---------- Alertes par carte ----------
const cardKey = (a) => [a.tcg, a.lang, a.cardId, a.setId ?? '', a.finish ?? ''].join('|');

// Vérifie les alertes ; renvoie les alertes mises à jour (null si rien à faire). `force` : sans attendre 6 h.
// Une carte suivie par plusieurs alertes n'est chargée qu'une fois.
export async function checkAlerts(alerts, { force = false } = {}) {
  const due = Object.values(alerts || {}).filter((a) => !a.paused && (force || !a.priceAt || Date.now() - a.priceAt > CHECK_EVERY));
  if (!due.length) return null;
  const prices = new Map();
  for (const a of due) {
    const k = cardKey(a);
    if (prices.has(k)) continue;
    try {
      prices.set(k, (await fetchCardInfo(a.tcg, a.cardId, a.setId, a.lang, a.finish)).price);
    } catch {
      prices.set(k, undefined); // carte momentanément indisponible : nouvel essai à la prochaine vérification
    }
  }
  const next = { ...alerts };
  for (const a of due) {
    const price = prices.get(cardKey(a));
    if (price === undefined) continue;
    const { patch, message } = evaluate(a, price);
    next[a.id] = { ...a, ...patch };
    if (message) await send(message, { tcg: a.tcg, cardId: a.cardId, setId: a.setId, lang: a.lang, finish: a.finish ?? '' });
  }
  return next;
}

export function useAlerts() {
  const { settings, update } = useSettings();
  const alerts = settings.alerts || {};
  const save = useCallback((next) => update({ alerts: next }), [update]);
  return {
    alerts,
    list: Object.values(alerts).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    forCard: (tcg, lang, cardId, finish) => Object.values(alerts)
      .filter((a) => a.tcg === tcg && a.lang === lang && a.cardId === cardId && (a.finish ?? null) === (finish ?? null))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    // entry : { tcg, lang, cardId, setId, finish, finishName, name, image, number, kind, value, price }
    add: (entry) => {
      const id = newId();
      const percent = isPercentKind(entry.kind);
      save({
        ...alerts,
        [id]: {
          id, createdAt: Date.now(), paused: false, triggered: false, notifiedPrice: null,
          ...entry, basePrice: percent ? entry.price ?? null : null, priceAt: entry.price != null ? Date.now() : null,
        },
      });
      return id;
    },
    patch: (id, patch) => alerts[id] && save({ ...alerts, [id]: { ...alerts[id], ...patch } }),
    // Réactiver : le prix actuel redevient la référence des pourcentages (pas d'alerte pour la variation passée).
    setPaused: (id, paused) => alerts[id] && save({ ...alerts, [id]: { ...alerts[id], paused, ...(paused ? {} : { basePrice: isPercentKind(alerts[id].kind) ? alerts[id].price ?? null : null, triggered: false, notifiedPrice: null }) } }),
    remove: (id) => {
      const next = { ...alerts };
      delete next[id];
      save(next);
    },
  };
}

// Ne réécrit que les alertes encore présentes (une alerte supprimée pendant la vérification ne revient pas) ;
// les champs de réglage (seuil, pause) restent ceux de l'utilisateur.
const RESULT_FIELDS = ['price', 'priceAt', 'triggered', 'notifiedPrice', 'notifiedAt', 'basePrice'];
export function mergeAlertResults(current, checked) {
  return Object.fromEntries(Object.entries(current || {}).map(([id, a]) => {
    const c = checked?.[id];
    if (!c || c.value !== a.value || c.kind !== a.kind || c.paused !== a.paused) return [id, a];
    return [id, { ...a, ...Object.fromEntries(RESULT_FIELDS.filter((f) => f in c).map((f) => [f, c[f]])) }];
  }));
}

// ---------- Surveillance de toute la collection ----------
async function readRefs() {
  try {
    return JSON.parse((await AsyncStorage.getItem(REFS_KEY)) || '{}');
  } catch {
    return {};
  }
}

// items : cartes de la collection avec leur prix du jour (`price`, € l'unité). Première fois : les prix actuels
// deviennent la référence, sans alerte. Ensuite, toute carte qui a bougé d'au moins `percent` % est signalée
// (une notification, regroupée s'il y en a plusieurs) et prend son nouveau prix comme référence.
export async function checkCollection(items, watch) {
  if (!watch?.enabled) return;
  const refs = await readRefs();
  const limit = (watch.percent || 20) / 100;
  const moved = [];
  let total = 0;
  for (const i of items) {
    if (i.tcg === 'custom' || i.grading || i.price == null) continue;
    total += i.price * (i.qty || 1);
    if (i.price < (watch.minPrice ?? 0)) continue;
    const ref = refs[i.key];
    if (ref == null) {
      refs[i.key] = i.price;
      continue;
    }
    const change = i.price / ref - 1;
    if (Math.abs(change) >= limit) {
      moved.push({ item: i, change, from: ref });
      refs[i.key] = i.price;
    }
  }
  moved.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  if (moved.length === 1) {
    const { item, change, from } = moved[0];
    await send(
      { title: t('{name} : {change}', { name: item.name, change: pct(change) }), body: t('{from} → {to} · dans ta collection ({game})', { from: formatPrice(from, 'EUR'), to: formatPrice(item.price, 'EUR'), game: gameName(item.tcg) }) },
      { tcg: item.tcg, cardId: item.cardId, setId: item.setId, lang: item.lang, finish: item.finish ?? '' },
    );
  } else if (moved.length > 1) {
    await send(
      {
        title: t('{n} cartes de ta collection ont bougé', { n: moved.length }),
        body: moved.slice(0, 4).map((m) => `${m.item.name} ${pct(m.change)}`).join(' · '),
      },
      { url: '/collection/alerts' },
    );
  }
  // Valeur totale de la collection.
  if (total > 0) {
    const ref = refs.__total;
    if (ref == null) refs.__total = total;
    else if (Math.abs(total / ref - 1) >= limit) {
      await send(
        { title: t('Ta collection : {change}', { change: pct(total / ref - 1) }), body: t('{from} → {to}', { from: formatPrice(ref, 'EUR'), to: formatPrice(total, 'EUR') }) },
        { url: '/collection' },
      );
      refs.__total = total;
    }
  }
  await AsyncStorage.setItem(REFS_KEY, JSON.stringify(refs)).catch(() => {});
}

// Seuils changés : les prix actuels redeviennent la référence (pas d'alerte pour les variations passées).
export const resetCollectionRefs = () => AsyncStorage.removeItem(REFS_KEY).catch(() => {});

// ---------- Tâche de fond (appli fermée) : lit et réécrit les réglages directement ----------
const COLLECTION_KEY = 'collection.v1';
const BACKGROUND_MAX_CARDS = 150; // cartes de la collection rechargées au plus par passage (les plus chères)

export async function checkAlertsInBackground() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const settings = JSON.parse(raw);
  setPreferredSource(settings.priceSource || 'both');
  setDisplayCurrency(settings.currency || 'EUR');
  if (Object.keys(settings.alerts || {}).length) {
    const next = await checkAlerts(settings.alerts, { force: true });
    if (next) {
      const latest = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || '{}');
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...latest, alerts: mergeAlertResults(latest.alerts, next) }));
    }
  }
  if (settings.collectionWatch?.enabled) {
    const collection = JSON.parse((await AsyncStorage.getItem(COLLECTION_KEY)) || '{}');
    const items = Object.values(collection.items || {}).filter((i) => i.tcg !== 'custom' && !i.grading);
    const watched = items
      .filter((i) => (i.price ?? 0) >= (settings.collectionWatch.minPrice ?? 0))
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      .slice(0, BACKGROUND_MAX_CARDS);
    const fresh = new Map();
    for (const i of watched) {
      try {
        const info = await fetchCardInfo(i.tcg, i.cardId, i.setId, i.lang, i.finish);
        if (info.price != null) fresh.set(i.key, info.price);
      } catch {
        // carte momentanément indisponible
      }
    }
    await checkCollection(items.map((i) => (fresh.has(i.key) ? { ...i, price: fresh.get(i.key) } : i)), settings.collectionWatch);
  }
}

// Anciens « prix cibles » de la liste de souhaits : devenus des alertes « sous ce prix ».
export function migrateWishlistTargets(wishlist, alerts) {
  const moved = Object.values(wishlist || {}).filter((w) => w.target != null);
  if (!moved.length) return null;
  const nextAlerts = { ...(alerts || {}) };
  for (const w of moved) {
    const exists = Object.values(nextAlerts).some((a) => a.kind === 'below' && a.tcg === w.tcg && a.lang === w.lang && a.cardId === w.cardId);
    if (exists) continue;
    const id = newId() + w.cardId.slice(-3);
    nextAlerts[id] = {
      id, createdAt: w.addedAt || Date.now(), paused: false, kind: 'below', value: w.target,
      tcg: w.tcg, lang: w.lang, cardId: w.cardId, setId: w.setId ?? null, finish: null, name: w.name, image: w.image ?? null, number: w.number ?? null,
      price: w.price ?? null, priceAt: w.priceAt ?? null, basePrice: null,
      triggered: w.alertedPrice != null, notifiedPrice: w.alertedPrice ?? null,
    };
  }
  const nextWishlist = Object.fromEntries(Object.entries(wishlist).map(([k, w]) => [k, { ...w, target: null, alertedPrice: null }]));
  return { alerts: nextAlerts, wishlist: nextWishlist };
}
