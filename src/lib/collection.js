// Collection personnelle, enregistrée sur le téléphone (AsyncStorage).
// Chaque carte garde sa langue, son extension et son dernier prix connu : la collection s'affiche sans réseau,
// et « Mettre à jour les prix » rafraîchit les valeurs depuis les mêmes sources que la recherche.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTcg, dataLang } from '../api';
import { averagePrice, getUsdToEur } from './prices';

const STORAGE_KEY = 'collection.v1';
// `deleted` : cartes retirées (clé → date), pour que la sauvegarde en ligne ne les fasse pas revenir.
const EMPTY = { items: {}, history: [], pricesUpdatedAt: null, deleted: {} };
const today = () => new Date().toISOString().slice(0, 10);

// `finish` : version de la carte (foil, reverse…) quand ce n'est pas la version de référence.
export const itemKey = (tcgId, lang, setId, cardId, finish) => `${tcgId}|${lang}|${setId ?? ''}|${cardId}${finish ? `|${finish}` : ''}`;
// Exemplaire gradé (« PSA 9 », « PCA 8.5 ») : rangé à part de la carte brute, avec sa propre valeur.
export const gradingLabel = (g) => (g ? `${g.company} ${g.grade}` : null);
const gradingSuffix = (g) => (g ? `|g:${g.company}-${g.grade}` : '');

// Prix moyen (EUR) + infos d'extension d'une carte, depuis le même connecteur que la recherche.
export async function fetchCardInfo(tcgId, cardId, setId, lang, finish) {
  const tcg = getTcg(tcgId);
  const l = dataLang(tcg, lang);
  const [card, fx] = await Promise.all([tcg.getCard(cardId, setId || null, l), getUsdToEur()]);
  const resolvedSetId = setId || card.setId || null;
  let setCount = null;
  let setName = card.setName || null;
  try {
    const set = (await tcg.getSets(l)).find((s) => String(s.id) === String(resolvedSetId));
    setCount = set?.count ?? null;
    setName = setName || set?.name || null;
  } catch {
    // liste des extensions indisponible : la complétion sera calculée plus tard
  }
  const avg = averagePrice(card.prices, fx, { finish });
  return {
    name: card.name,
    image: card.image,
    rarity: card.details?.find(([k]) => k === 'rarity')?.[1] ?? null,
    setId: resolvedSetId,
    setName,
    setCount,
    price: avg ? Math.round(avg.value * 100) / 100 : null,
    divergent: !!avg?.divergent,
  };
}

const CollectionContext = createContext(null);

export function CollectionProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [refresh, setRefresh] = useState(null); // { done, total } pendant une mise à jour des prix
  // Dernier état connu, lu par les actions (add, refreshPrices) sans les recréer à chaque changement.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setState({ ...EMPTY, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Sauvegarde + point d'historique du jour (valeur totale) à chaque changement.
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);

  const update = useCallback((fn) => {
    setState((prev) => {
      const next = fn(prev);
      const value = Object.values(next.items).reduce((s, i) => s + (i.price || 0) * i.qty, 0);
      const history = next.history.filter((h) => h.date !== today());
      history.push({ date: today(), value: Math.round(value * 100) / 100 });
      return { ...next, history: history.slice(-365) };
    });
  }, []);

  const patchItem = useCallback((key, patch) => {
    update((prev) => (prev.items[key] ? { ...prev, items: { ...prev.items, [key]: { ...prev.items[key], ...patch } } } : prev));
  }, [update]);

  // Ajoute `delta` exemplaires d'une carte (summary = ce qu'on connaît déjà : nom, image, numéro…).
  const add = useCallback((tcgId, lang, setId, summary, delta = 1) => {
    // Depuis la recherche, l'extension n'est pas toujours connue : on reprend alors l'exemplaire déjà possédé.
    const existingKey = !setId
      ? Object.values(stateRef.current.items).find((i) => i.tcg === tcgId && i.lang === lang && i.cardId === summary.id && (i.finish ?? null) === (summary.finish ?? null) && gradingLabel(i.grading) === gradingLabel(summary.grading))?.key
      : null;
    const key = existingKey || itemKey(tcgId, lang, setId, summary.id, summary.finish) + gradingSuffix(summary.grading);
    const isNew = !stateRef.current.items[key];
    update((prev) => {
      const existing = prev.items[key];
      const item = existing
        ? { ...existing, qty: existing.qty + delta, updatedAt: Date.now() }
        : {
          key, tcg: tcgId, lang, cardId: summary.id, setId: setId ?? summary.setId ?? null, setName: summary.setName ?? null,
          setCount: null, name: summary.name, number: summary.number ?? null, image: summary.image ?? null,
          rarity: null, qty: delta, price: summary.price ?? null, priceAt: null, purchase: null, finish: summary.finish ?? null, finishName: summary.finishName ?? null,
          grading: summary.grading ?? null,
          addedAt: Date.now(), updatedAt: Date.now(),
        };
      return { ...prev, items: { ...prev.items, [key]: item } };
    });
    // Complète en arrière-plan : prix moyen, extension, nombre de cartes de l'extension.
    if (isNew) {
      fetchCardInfo(tcgId, summary.id, setId ?? summary.setId, lang, summary.finish)
        // Exemplaire gradé : sa valeur est celle saisie ; le prix de la carte brute est gardé à côté (rawPrice).
        .then((info) => patchItem(key, summary.grading
          ? { ...info, price: summary.price ?? null, rawPrice: info.price, image: summary.image || info.image, priceAt: Date.now() }
          : { ...info, image: summary.image || info.image, priceAt: Date.now() }))
        .catch(() => {});
    }
    return key;
  }, [update, patchItem]);

  const setQty = useCallback((key, qty) => {
    update((prev) => {
      if (!prev.items[key]) return prev;
      const items = { ...prev.items };
      let deleted = prev.deleted;
      if (qty <= 0) {
        delete items[key];
        deleted = { ...prev.deleted, [key]: Date.now() };
      } else items[key] = { ...items[key], qty, updatedAt: Date.now() };
      return { ...prev, items, deleted };
    });
  }, [update]);

  const setPurchase = useCallback((key, purchase) => patchItem(key, { purchase, updatedAt: Date.now() }), [patchItem]);
  // Valeur saisie à la main (exemplaire gradé).
  const setPrice = useCallback((key, price) => patchItem(key, { price, updatedAt: Date.now() }), [patchItem]);

  // Sauvegarde en ligne (src/lib/sync.js) : lecture de l'état complet et fusion avec celui du compte.
  const getState = useCallback(() => stateRef.current, []);
  const applySync = useCallback((fn) => update(fn), [update]);

  // Carte « Autres » (absente des catalogues) : toutes les informations sont saisies à la main, prix compris ;
  // elle n'est jamais mise à jour automatiquement. (`category` : cartes enregistrées avant sa suppression du formulaire.)
  const saveCustom = useCallback((fields, existingKey) => {
    const key = existingKey || `custom|en|${fields.series || ''}|c${Date.now()}`;
    const series = [fields.category, fields.series].filter(Boolean).join(' · ') || 'Sans série';
    update((prev) => {
      const old = prev.items[key];
      const item = {
        ...(old || { key, tcg: 'custom', lang: 'en', cardId: key.split('|').pop(), addedAt: Date.now(), purchase: null }),
        name: fields.name,
        number: fields.number || null,
        image: fields.image || null,
        rarity: fields.year ? String(fields.year) : null,
        setId: series,
        setName: series,
        setCount: null,
        qty: Math.max(1, fields.qty || 1),
        price: fields.price ?? null,
        purchase: fields.purchase ?? old?.purchase ?? null,
        custom: { category: fields.category, series: fields.series, year: fields.year, notes: fields.notes },
        priceAt: Date.now(),
        updatedAt: Date.now(),
      };
      return { ...prev, items: { ...prev.items, [key]: item } };
    });
    return key;
  }, [update]);

  const remove = useCallback((key) => setQty(key, 0), [setQty]);

  const refreshPrices = useCallback(async () => {
    // Les cartes personnelles gardent leur prix saisi à la main.
    const items = Object.values(stateRef.current.items).filter((i) => i.tcg !== 'custom');
    if (!items.length) return;
    let done = 0;
    setRefresh({ done, total: items.length });
    const queue = [...items];
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        try {
          const info = await fetchCardInfo(it.tcg, it.cardId, it.setId, it.lang, it.finish);
          // Langue sans version officielle (cartes affichées en anglais) : nom officiel anglais repris.
          const fallback = dataLang(getTcg(it.tcg), it.lang) !== it.lang ? { name: info.name, officialName: true } : {};
          patchItem(it.key, { ...fallback, ...(it.grading ? { rawPrice: info.price } : { price: info.price, divergent: info.divergent }), priceAt: Date.now(), setCount: info.setCount ?? it.setCount, setName: it.setName || info.setName, rarity: it.rarity || info.rarity });
        } catch {
          // carte momentanément indisponible : on garde l'ancien prix
        }
        done++;
        setRefresh({ done, total: items.length });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    update((prev) => ({ ...prev, pricesUpdatedAt: Date.now() }));
    setRefresh(null);
  }, [patchItem, update]);

  // Prix vieux de plus d'un jour : mise à jour automatique dès le démarrage de l'appli (une fois par jour),
  // avec les données publiées chaque matin — pas besoin d'ouvrir « Ma collection » ni de bouton.
  const autoRefreshed = useRef(false);
  useEffect(() => {
    if (!loaded || autoRefreshed.current) return;
    autoRefreshed.current = true;
    const stale = !state.pricesUpdatedAt || Date.now() - state.pricesUpdatedAt > 24 * 3600 * 1000;
    // Cartes dont la langue n'a plus de version (traduction maison retirée) : nom officiel à reprendre tout de suite.
    const renamed = Object.values(state.items).some((i) => i.tcg !== 'custom' && getTcg(i.tcg) && dataLang(getTcg(i.tcg), i.lang) !== i.lang && !i.officialName);
    if (Object.keys(state.items).length && (stale || renamed)) refreshPrices();
  }, [loaded, state.items, state.pricesUpdatedAt, refreshPrices]);

  const items = useMemo(() => Object.values(state.items), [state.items]);
  const value = useMemo(
    () => ({ loaded, items, state, history: state.history, pricesUpdatedAt: state.pricesUpdatedAt, refresh, add, setQty, setPurchase, setPrice, saveCustom, remove, refreshPrices, getState, applySync }),
    [loaded, items, state, refresh, add, setQty, setPurchase, setPrice, saveCustom, remove, refreshPrices, getState, applySync],
  );
  // stateRef n’est lu que dans les actions (add, refreshPrices), jamais pendant le rendu.
  // eslint-disable-next-line react-hooks/refs
  return createElement(CollectionContext.Provider, { value }, children);
}

export const useCollection = () => useContext(CollectionContext);

// Quantité possédée d'une carte (toutes langues confondues si lang est omis).
export function ownedQty(items, tcgId, cardId, lang) {
  return items
    .filter((i) => i.tcg === tcgId && i.cardId === cardId && (!lang || i.lang === lang))
    .reduce((s, i) => s + i.qty, 0);
}

// ---------- Statistiques ----------
export function summarize(items) {
  const s = { cards: 0, unique: 0, value: 0, invested: 0, investedValue: 0, priced: 0 };
  for (const i of items) {
    s.cards += i.qty;
    s.unique++;
    if (i.price != null) { s.value += i.price * i.qty; s.priced++; }
    if (i.purchase != null) {
      s.invested += i.purchase * i.qty;
      s.investedValue += (i.price ?? 0) * i.qty;
    }
  }
  s.gain = s.invested ? s.investedValue - s.invested : null;
  s.gainPct = s.invested ? (s.gain / s.invested) * 100 : null;
  return s;
}

export function groupBy(items, keyFn) {
  const map = new Map();
  for (const i of items) {
    const k = keyFn(i);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  return map;
}

// Extensions possédées d'un jeu : cartes, complétion (cartes distinctes / taille de l'extension), valeur.
export function setsSummary(items) {
  return [...groupBy(items, (i) => i.setId ?? '?')].map(([setId, list]) => {
    const distinct = new Set(list.map((i) => i.cardId)).size;
    const setCount = Math.max(0, ...list.map((i) => i.setCount || 0)) || null;
    return {
      setId,
      setName: list.find((i) => i.setName)?.setName || setId,
      setCount,
      distinct,
      completion: setCount ? Math.min(1, distinct / setCount) : null,
      langs: [...new Set(list.map((i) => i.lang))],
      lastAdded: Math.max(...list.map((i) => i.addedAt || 0)),
      ...summarize(list),
    };
  });
}
