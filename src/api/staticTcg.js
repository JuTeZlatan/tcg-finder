// Jeux servis par le script de collecte (pipeline/) :
// données du jour publiées en ligne (EXPO_PUBLIC_DATA_URL, GitHub Pages), gardées sur le téléphone, avec repli
// sur les données intégrées à l'appli au moment de la compilation (assets/data) — voir ./dataSource.js.
import { memo } from './http';
import { loadBundled } from './bundledData';
import { loadData } from './dataSource';
import { versionsOfCard } from '../lib/masterSet';
import { mainPrefix, parseNumber, sortByNumber } from '../lib/cardOrder';

const fileId = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');

export function createStaticTcg(meta) {

  const path = (lang, p) => `${meta.id}/${lang}/${p}`;
  const loadSets = memo((lang) => loadData(path(lang, 'sets.json'), () => loadBundled(meta.id, lang).then((d) => d.sets)));

  // Cartes d'une extension, rangées par numéro (les fichiers suivent l'ordre des sources, pas toujours celui-là).
  const loadSet = memo(async (setId, lang) => sortByNumber(
    await loadData(path(lang, `sets/${fileId(setId)}.json`), () => loadBundled(meta.id, lang).then((d) => d.cards[setId] || [])),
    (c) => c.number,
    setId,
  ));

  // Lignes [id, nom, extension, numéro, image, nom anglais officiel si le nom est traduit]
  const loadSearch = memo(async (lang) => {
    return loadData(path(lang, 'search.json'), async () => {
      const d = await loadBundled(meta.id, lang);
      return Object.entries(d.cards).flatMap(([setId, cards]) => cards.map((c) => [c.id, c.name, setId, c.number ?? '', c.thumb || c.image, c.nameEn ?? '']));
    });
  });

  return {
    ...meta,
    languages: meta.languages || ['fr', 'en'],

    getSets: loadSets,

    // Master set : chaque version de chaque carte de l'extension.
    getVersions: memo(async (setId, lang) =>
      (await loadSet(setId, lang)).flatMap((c) =>
        versionsOfCard({ id: c.id, name: c.name, number: c.number, image: c.thumb || c.image }, c.prices)),
    ),

    getCards: memo(async (setId, lang) =>
      (await loadSet(setId, lang)).map((c) => ({
        id: c.id, name: c.name, number: c.number, subtitle: c.subtitle, image: c.thumb || c.image,
      })),
    ),

    searchCards: memo(async (query, lang) => {
      const q = query.trim().toLowerCase();
      const rows = await loadSearch(lang);
      return rows
        .filter(([, name, , number, , nameEn]) => name.toLowerCase().includes(q) || nameEn?.toLowerCase().includes(q) || String(number).toLowerCase() === q)
        .slice(0, 200)
        .map(([id, name, setId, number, image]) => ({ id, name, number, subtitle: setId, image, setId }));
    }),

    // Recherche par critères (utilisée par le scanner) : test(row) avec row = { id, name, setId, number }.
    findCards: async (test, lang) =>
      (await loadSearch(lang))
        .map(([id, name, setId, number, image]) => ({ id, name, setId, number: String(number), image, subtitle: setId }))
        .filter(test),

    getCard: memo(async (id, setId, lang) => {
      const card = (await loadSet(setId, lang)).find((c) => c.id === id);
      if (!card) throw new Error('Carte introuvable');
      const set = (await loadSets(lang)).find((s) => s.id === setId);
      return { ...card, setId, setName: set?.name };
    }),

    ...(meta.characters ? characterMethods(meta.characters, loadSets, loadSet) : {}),
  };
}

// Onglet « personnages » d'un jeu collecté (One Piece, Lorcana, Riftbound, Dragon Ball) : calculé sur les cartes
// intégrées. `of(card)` donne le personnage d'une carte (ou null) ; `keyLang` : langue des noms qui servent à
// regrouper quand ceux de la langue choisie ne le permettent pas (Riftbound en chinois : noms anglais).
// Clé de regroupement : sans accents, ponctuation ni espaces (« Monkey.D.Luffy » = « Monkey D. Luffy »).
const groupKey = (name) => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, '');

// Extensions qui regroupent des cartes sorties sur des années (promos, tournois, juges, jeu organisé).
const UMBRELLA = /promo|judge|organized play|tournament cards/i;
const isUmbrella = (s) => UMBRELLA.test(s.name || '') && !/release event/i.test(s.name || '');
// N° de produit TCGplayer d'une carte (« tcg723038 » ou « 191783 »), sinon null.
const productId = (c) => {
  const m = String(c.id).match(/^(?:tcg)?(\d{5,})$/);
  return m ? Number(m[1]) : null;
};

function characterMethods({ label, of, keyLang, resolveSuffix }, loadSets, loadSet) {
  // Toutes les cartes de toutes les extensions, avec leur personnage, de la plus récente à la plus ancienne.
  const allCards = memo(async (lang) => {
    const sets = [...(await loadSets(lang))].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const keySets = keyLang && keyLang !== lang ? await loadSets(keyLang) : null;
    const keyById = new Map();
    if (keySets) for (const s of keySets) for (const c of await loadSet(s.id, keyLang)) keyById.set(c.id, of(c));
    const out = [];
    // Repères de dates pour les cartes des extensions « fourre-tout » (promos, tournois…), datées de leur première
    // sortie (ou d'une mise à jour TCGplayer) alors que leurs cartes s'étalent sur des années :
    // date de l'extension dont la carte porte le code (« OP06-022 » → OP06), sinon n° de produit TCGplayer
    // (attribué dans l'ordre de création) comparé au premier n° de chaque extension.
    const prefixDate = new Map();
    const productStarts = [];
    const totalDates = new Map(); // nombre de cartes → dates des extensions de cette taille
    for (const s of sets) {
      const cards = await loadSet(s.id, lang);
      for (const c of cards) {
        const key = keySets ? keyById.get(c.id) : of(c);
        if (key) out.push({ key, card: c, set: s, date: s.date || '' });
      }
      if (isUmbrella(s) || !s.date) continue;
      if (s.count) totalDates.set(s.count, [...(totalDates.get(s.count) || []), s.date]);
      const prefix = mainPrefix(cards.map((c) => c.number), s.id);
      if (prefix && !(prefixDate.get(prefix) <= s.date)) prefixDate.set(prefix, s.date);
      // repère fiable seulement si l'extension vient surtout de TCGplayer (sinon n° ajoutés après coup, dans le désordre)
      const ids = cards.map(productId).filter(Boolean);
      if (ids.length >= 10 && ids.length >= cards.length / 2) productStarts.push([Math.min(...ids), s.date]);
    }
    productStarts.sort((a, b) => a[0] - b[0]);
    let latest = '';
    for (const p of productStarts) p[1] = latest = p[1] > latest ? p[1] : latest; // date atteinte à ce n° de produit
    for (const x of out) {
      if (!isUmbrella(x.set)) continue;
      const byCode = prefixDate.get(parseNumber(x.card.number)?.prefix);
      const id = productId(x.card);
      const byProduct = id ? productStarts.filter(([start]) => start <= id).pop()?.[1] : null;
      // total imprimé (« PR-066/298 ») d'une seule extension de cette taille : sortie avec elle
      const total = Number(String(x.card.number || '').match(/\/\s*(\d+)\s*$/)?.[1]);
      const byTotal = totalDates.get(total)?.length === 1 ? totalDates.get(total)[0] : null;
      x.date = byCode || byProduct || byTotal || x.date;
    }
    out.sort((a, b) => b.date.localeCompare(a.date)); // tri stable : à date égale, ordre des extensions et des numéros
    // Noms « Titre + Nom » sans séparateur (vieilles cartes Dragon Ball : « Abrupt Breakthrough Son Goku ») :
    // rattachés au nom connu le plus long qui les termine (« Son Goku »), s'il existe.
    // Noms de référence : ceux portés par au moins 3 cartes (« Son Goku », « Vegeta »…), du plus long au plus court.
    if (resolveSuffix) {
      const counts = new Map();
      for (const x of out) counts.set(x.key, (counts.get(x.key) || 0) + 1);
      // Le plus court d'au moins deux mots d'abord (« Ultra Instinct Son Goku » → « Son Goku »), puis un mot seul.
      const known = [...counts].filter(([, n]) => n >= 3).map(([k]) => k)
        .sort((a, b) => (b.includes(' ') - a.includes(' ')) || a.length - b.length);
      const knownSet = new Set(known);
      for (const x of out) {
        if (knownSet.has(x.key) && x.key.split(' ').length === 2) continue; // vrai nom (« Son Goku », « Goku Black »)
        const match = known.find((k) => k !== x.key && x.key.endsWith(` ${k}`));
        if (match) x.key = match;
      }
    }
    return out;
  });

  return {
    charactersLabel: label,
    // [{ id, name, image, count }] par ordre alphabétique ; image : carte la plus récente du personnage.
    getCharacters: memo(async (lang) => {
      const groups = new Map();
      for (const { key, card } of await allCards(lang)) {
        const id = groupKey(key);
        if (!groups.has(id)) groups.set(id, { id, image: card.thumb || card.image, count: 0, spellings: new Map() });
        const g = groups.get(id);
        g.count++;
        g.spellings.set(key, (g.spellings.get(key) || 0) + 1);
      }
      // Nom affiché : l'orthographe la plus fréquente (« Monkey D. Luffy » plutôt que « Monkey.D.Luffy »).
      return [...groups.values()]
        .map(({ spellings, ...g }) => ({ ...g, name: [...spellings].sort((a, b) => b[1] - a[1])[0][0] }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }),
    // Toutes les cartes d'un personnage, de la plus récente à la plus ancienne.
    getCharacterCards: memo(async (id, lang) =>
      (await allCards(lang))
        .filter((x) => groupKey(x.key) === id)
        .map(({ card: c, set: s, date }) => ({
          id: c.id, name: c.name, number: c.number, image: c.thumb || c.image, setId: s.id,
          subtitle: [s.name, date].filter(Boolean).join(' · '),
        }))),
  };
}
