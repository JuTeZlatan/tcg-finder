// Pokémon via TCGdex (https://tcgdex.dev) : données FR/EN et prix Cardmarket.
// Les prix TCGplayer (que TCGdex ne fournit plus pour la plupart des extensions) viennent du script de collecte
// (pipeline/pokemon.mjs), intégrés à l'appli ou publiés chaque jour.
import { getJSON, memo, num, clean } from './http';
import { loadBundledFile } from './bundledData';
import { loadData } from './dataSource';
import { cardmarketRef } from '../lib/priceRef';
import { versionsOfCard } from '../lib/masterSet';
import { parseNumber, sortByNumber } from '../lib/cardOrder';
import { historyFile } from '../lib/priceHistory';

// Chinois : édition traditionnelle (la plus complète chez TCGdex, avec images).
const TCGDEX_LANG = { zh: 'zh-tw' };
const base = (lang) => `https://api.tcgdex.net/v2/${TCGDEX_LANG[lang] || lang}`;
const img = (url, quality = 'low') => (url ? `${url}/${quality}.webp` : null);
// Image TCGdex, sinon photo TCGplayer de la même carte (beaucoup d'extensions récentes, japonaises et chinoises n'ont pas d'image TCGdex).
const tcgplayerImage = (entry, size) => (entry ? `https://tcgplayer-cdn.tcgplayer.com/product/${entry[0]}_${size}.jpg` : null);
// En dernier recours : la même carte dans une autre langue (pokemon/images.json, collecté chaque jour).
let imageFallback = {};
const imageOf = (c, collected, quality = 'low', lang = null) => img(c.image, quality)
  || tcgplayerImage(collected?.[c.id], quality === 'high' ? 'in_1000x1000' : '400w')
  || fallbackImage(imageFallback[lang]?.[c.id], quality);
// Adresse TCGdex (sans extension : on ajoute la qualité) ou image complète d'un site officiel.
const fallbackImage = (url, quality) => (url && /\.(png|jpe?g|webp)$/i.test(url) ? url : img(url, quality));

// Clés Cardmarket de TCGdex → [clé de prix, variante]
const CM_KEYS = {
  trend: ['trend'], avg: ['avg'], low: ['low'], avg7: ['avg7'], avg30: ['avg30'],
  'trend-holo': ['trend', 'holo'], 'avg-holo': ['avg', 'holo'], 'low-holo': ['low', 'holo'],
  'avg7-holo': ['avg7', 'holo'], 'avg30-holo': ['avg30', 'holo'],
};
const TCP_VARIANTS = {
  normal: 'normal', holofoil: 'holo', 'reverse-holofoil': 'reverse', '1st-edition': 'firstEdition',
  '1st-edition-holofoil': 'firstEditionHolo', unlimited: 'unlimited', 'unlimited-holofoil': 'unlimitedHolo',
};

// La liste REST des extensions n'a ni dates ni série : on les récupère en une requête via l'API GraphQL de TCGdex.
// Les extensions de Pokémon TCG Pocket (série « tcgp », jeu mobile, cartes numériques sans prix) sont écartées.
const setsMeta = memo(async () => {
  try {
    const res = await fetch('https://api.tcgdex.net/v2/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ sets { id releaseDate serie { id } } }' }),
    });
    const { data } = await res.json();
    return {
      dates: new Map(data.sets.map((s) => [s.id, s.releaseDate])),
      pocket: new Set(data.sets.filter((s) => s.serie?.id === 'tcgp').map((s) => s.id)),
    };
  } catch {
    return { dates: new Map(), pocket: new Set() };
  }
});
const setIdOf = (cardId) => cardId.slice(0, cardId.lastIndexOf('-'));

// Dates de sortie des extensions japonaises et chinoises : { ja: { id: date }, zh: { … } }
const collectedSetLogos = memo(async () => {
  try {
    return await loadData(`pokemon/setlogos.json`, () => loadBundledFile('pokemon-setlogos'));
  } catch {
    return {};
  }
});

const asianSetDates = memo(async () => {
  try {
    return await loadData(`pokemon/setdates.json`, () => loadBundledFile('pokemon-setdates'));
  } catch {
    return {};
  }
});

// { [id carte TCGdex]: [productId, [[finition, marché, plus bas], …]] }
// Cartes japonaises : catalogue TCGplayer « Pokemon Japan » ; cartes chinoises : pas de prix TCGplayer.
// Cartes chinoises : même numérotation que les japonaises → prix et photo de la carte japonaise équivalente.
const TCGPLAYER_FILE = { fr: 'tcgplayer', en: 'tcgplayer', ja: 'tcgplayer-ja', zh: 'tcgplayer-ja' };
const loadImageFallback = memo(async () => {
  imageFallback = await loadData('pokemon/images.json', async () => ({})).catch(() => ({}));
  return imageFallback;
});

// (charge aussi les images de remplacement, lues par imageOf)
const tcgplayerPrices = memo(async (lang) => {
  await loadImageFallback();
  const file = TCGPLAYER_FILE[lang];
  if (!file) return {};
  try {
    return await loadData(`pokemon/${file}.json`, () => loadBundledFile(`pokemon-${file}`));
  } catch {
    return {};
  }
});

// Autres versions vendues à part (tampons, motif Master Ball, Shadowless, decks…), cartes internationales.
const tcgplayerVersions = memo(async () => {
  try {
    return await loadData(`pokemon/tcgplayer-versions.json`, () => loadBundledFile('pokemon-tcgplayer-versions'));
  } catch {
    return {};
  }
});

// Produit Cardmarket de chaque carte, associé par le script de collecte (nom + prix le plus proche de TCGplayer).
// TCGdex relie parfois plusieurs versions au même produit (Lysandre normal et Full Art) : on préfère le nôtre.
const cardmarketProducts = memo(async () => {
  try {
    return await loadData(`pokemon/cardmarket.json`, () => loadBundledFile('pokemon-cardmarket'));
  } catch {
    return {};
  }
});
function withOwnCardmarket(pricing, own) {
  if (!own || own[0] === pricing?.cardmarket?.idProduct) return pricing;
  return { ...pricing, cardmarket: { unit: 'EUR', idProduct: own[0], ...own[1] } };
}

// Versions vendues à part, à choisir à l'ajout comme les autres versions (chacune est une carte à collectionner).
// Un produit peut regrouper plusieurs tirages (Shadowless : 1re édition et Unlimited) : une version par tirage,
// au prix du marché, sinon de l'annonce la moins chère (1re édition rarement vendue).
const PRINTING_NAMES = { '1st Edition Holofoil': '1re édition', '1st Edition': '1re édition', 'Unlimited Holofoil': 'Unlimited', Unlimited: 'Unlimited', 'Reverse Holofoil': 'Reverse' };
function versionsBlock(list) {
  const items = (list || []).flatMap(([productId, label, entries]) => {
    const priced = entries.filter(([, m, low]) => num(m) || num(low));
    return priced.map(([sub, market, low]) => ({
      label: num(market) ? 'market' : 'low',
      variant: priced.length > 1 ? `v${productId}-${sub}` : `v${productId}`,
      name: priced.length > 1 ? `${label} · ${PRINTING_NAMES[sub] || sub}` : label,
      value: num(market) || num(low),
      currency: 'USD',
    }));
  });
  return items.length ? [{ source: 'TCGplayer', versions: true, items }] : [];
}

const versionsOf = (list) => (list || []).map(([productId, label, entries]) => {
  const market = entries.find(([sub, m]) => sub === 'Normal' && num(m)) ?? entries.find(([, m]) => num(m));
  return {
    label,
    price: market ? { value: num(market[1]), currency: 'USD' } : null,
    image: tcgplayerImage([productId], '400w'),
    url: `https://www.tcgplayer.com/product/${productId}`,
  };
}).sort((a, b) => (b.price?.value ?? 0) - (a.price?.value ?? 0));

const variantOf = (subType) => {
  const k = String(subType).toLowerCase().replace(/ /g, '-');
  return TCP_VARIANTS[k] || k;
};

// `variants` : versions de la carte selon TCGdex (normal, reverse, holo…).
function prices(pricing, collected, variants) {
  const out = [];
  const tp = pricing?.tcgplayer;
  let tpItems = [];
  let tpUpdated = tp?.updated;
  let tpUrl = null;
  if (tp) {
    for (const [key, p] of Object.entries(tp)) {
      if (!p || typeof p !== 'object') continue;
      const variant = TCP_VARIANTS[key] || key;
      if (num(p.marketPrice)) tpItems.push({ label: 'market', variant, value: num(p.marketPrice), currency: tp.unit || 'USD' });
      if (num(p.lowPrice)) tpItems.push({ label: 'low', variant, value: num(p.lowPrice), currency: tp.unit || 'USD' });
    }
  }
  // TCGdex sans prix TCGplayer : prix collectés chaque jour (TCGCSV).
  if (!tpItems.some((i) => i.label === 'market') && collected) {
    const [productId, entries] = collected;
    tpItems = [];
    for (const [sub, market, low] of entries) {
      const variant = variantOf(sub);
      if (num(market)) tpItems.push({ label: 'market', variant, value: num(market), currency: 'USD' });
      if (num(low)) tpItems.push({ label: 'low', variant, value: num(low), currency: 'USD' });
    }
    tpUpdated = null;
    tpUrl = `https://www.tcgplayer.com/product/${productId}`;
  }
  // Prix de référence : la version normale, sinon le tirage courant (Unlimited) plutôt que la 1re édition,
  // comme la version proposée par défaut sur la fiche (src/lib/finishes.js).
  const tpMain = ['normal', 'unlimited', 'unlimitedHolo']
    .map((v) => tpItems.find((i) => i.label === 'market' && i.variant === v)).find(Boolean)
    || tpItems.find((i) => i.label === 'market');
  // Carte uniquement en version holo chez TCGplayer : on compare avec le prix holo de Cardmarket.
  const foilOnly = tpItems.length > 0 && !tpItems.some((i) => i.variant === 'normal');

  const cm = pricing?.cardmarket;
  if (cm) {
    // Champs « -holo » de Cardmarket : version reverse de la carte. Les autres : la version principale
    // (holo si la carte n'existe pas en normale chez TCGplayer), pour comparer les mêmes versions entre sites.
    const items = Object.entries(CM_KEYS)
      .map(([k, [label, variant]]) => ({ label, variant: variant ? 'reverse' : foilOnly ? 'holo' : undefined, value: num(cm[k]), currency: cm.unit || 'EUR' }))
      .filter((i) => i.value)
      // Carte sans version reverse (Full Art, secrètes…) : les champs « -holo » de Cardmarket n'ont pas de sens.
      .filter((i) => !(i.variant === 'reverse' && variants?.reverse === false && !tpItems.some((t) => t.variant === 'reverse')));
    // Référence : les champs principaux (les champs « -holo » sont la reverse chez Pokémon, jamais la carte elle-même).
    const ref = cardmarketRef(cm);
    if (items.length) out.push({ source: 'Cardmarket', updated: cm.updated, items, ref: ref && { value: ref, currency: cm.unit || 'EUR' } });
  }
  if (tpItems.length) {
    out.push({ source: 'TCGplayer', updated: tpUpdated, items: tpItems, ref: tpMain && { value: tpMain.value, currency: 'USD' }, url: tpUrl });
  }
  return out;
}

// Espèces de Pokémon collectées (PokeAPI) : [n°, nom fr, en, ja, zh].
const speciesList = memo(async () => {
  try {
    return await loadData(`pokemon/species.json`, () => loadBundledFile('pokemon-species'));
  } catch {
    return [];
  }
});
const SPECIES_LANG = { fr: 1, en: 2, ja: 3, zh: 4 };

// Promos « Black Star » (SVP, SWSH…) : une seule extension datée de son début, numérotée au fil des sorties sur
// plusieurs années. Date estimée d'une carte : sa place dans la numérotation, entre le début de cette série
// et celui de la suivante (ou aujourd'hui pour la série en cours).
function promoDate(set, localId, sets) {
  if (!/promo/i.test(set.name || '') || !set.date) return null;
  const n = parseNumber(localId)?.num;
  if (!Number.isFinite(n) || !set.count) return null;
  const next = sets.filter((s) => /promo/i.test(s.name || '') && s.date > set.date).map((s) => s.date).sort()[0];
  const start = Date.parse(set.date);
  const end = next ? Date.parse(next) : Date.now();
  const at = start + Math.min(1, n / set.count) * (end - start);
  return new Date(at).toISOString().slice(0, 10);
}

// Historique des prix : fichiers par extension, internationaux (fr/en) ou japonais (ja/zh, mêmes codes).
const loadHistory = memo((key, setId) => loadData(historyFile(`pokemon/${key}`, setId), async () => null).catch(() => null));

const adapter = {
  getPriceHistory: async (cardId, setId, lang) => {
    const key = lang === 'ja' || lang === 'zh' ? 'ja' : 'intl';
    const h = await loadHistory(key, cardId.slice(0, cardId.lastIndexOf('-')));
    return h?.cards?.[cardId] ? { days: h.days, points: h.cards[cardId] } : null;
  },
  id: 'pokemon',
  name: 'Pokémon',
  tagline: 'Pokémon Trading Card Game',
  color: '#E3350D',
  languages: ['fr', 'en', 'ja', 'zh'],
  source: { name: 'TCGdex', url: 'https://tcgdex.dev' },

  getSets: memo(async (lang) => {
    const [sets, { dates: intlDates, pocket }, localDates, setLogos] = await Promise.all([
      getJSON(`${base(lang)}/sets`), setsMeta(), asianSetDates(), collectedSetLogos(),
    ]);
    // Extensions japonaises / chinoises : dates collectées chaque jour (l'API GraphQL ne couvre que l'international).
    const asian = lang === 'ja' || lang === 'zh';
    const dates = asian ? new Map(Object.entries(localDates[lang] || {})) : intlDates;
    // Sans logo ni symbole TCGdex : image du booster TCGplayer (le chinois reprend les codes japonais).
    const fallbackLogos = (asian ? setLogos.ja : setLogos.intl) || {};
    return sets
      .filter((s) => !pocket.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        logo: s.logo ? `${s.logo}.png` : s.symbol ? `${s.symbol}.png` : fallbackLogos[s.id] || null,
        count: s.cardCount?.official ?? s.cardCount?.total,
        date: dates.get(s.id) || '',
        subtitle: dates.get(s.id) ? `${s.id} · ${dates.get(s.id)}` : s.id,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)); // de la plus récente à la plus ancienne
  }),

  getCards: memo(async (setId, lang) => {
    const set = await getJSON(`${base(lang)}/sets/${encodeURIComponent(setId)}`);
    const collected = await tcgplayerPrices(lang);
    return sortByNumber(set.cards || [], (c) => c.localId, setId).map((c) => ({ id: c.id, name: c.name, number: c.localId, image: imageOf(c, collected, 'low', lang) }));
  }),

  // Master set : versions de chaque carte d'après les prix collectés (TCGplayer, Cardmarket, versions vendues à part),
  // les mêmes que la fiche propose à l'ajout — sans charger chaque carte une à une.
  getVersions: memo(async (setId, lang) => {
    const intl = TCGPLAYER_FILE[lang] === 'tcgplayer';
    const [set, collected, versions, ownCm] = await Promise.all([
      getJSON(`${base(lang)}/sets/${encodeURIComponent(setId)}`),
      tcgplayerPrices(lang),
      intl ? tcgplayerVersions() : {},
      intl ? cardmarketProducts() : {},
    ]);
    return sortByNumber(set.cards || [], (c) => c.localId, setId).flatMap((c) => {
      const pricing = ownCm[c.id] ? { cardmarket: { unit: 'EUR', ...ownCm[c.id][1] } } : null;
      const cardPrices = [...prices(pricing, collected[c.id]), ...versionsBlock(versions[c.id])];
      return versionsOfCard({ id: c.id, name: c.name, number: c.localId, image: imageOf(c, collected, 'low', lang) }, cardPrices);
    });
  }),

  searchCards: memo(async (query, lang) => {
    const cards = await getJSON(
      `${base(lang)}/cards?name=${encodeURIComponent(query)}&pagination:itemsPerPage=120`,
      { allowMissing: true },
    );
    const [{ pocket }, collected] = await Promise.all([setsMeta(), tcgplayerPrices(lang)]);
    return (cards || [])
      .filter((c) => !pocket.has(setIdOf(c.id)))
      .map((c) => ({ id: c.id, name: c.name, number: c.localId, subtitle: c.id, image: imageOf(c, collected, 'low', lang) }));
  }),

  getCard: memo(async (id, _setId, lang) => {
    const intl = TCGPLAYER_FILE[lang] === 'tcgplayer';
    const [c, collected, versions, ownCm] = await Promise.all([
      getJSON(`${base(lang)}/cards/${encodeURIComponent(id)}`),
      tcgplayerPrices(lang),
      intl ? tcgplayerVersions() : {},
      intl ? cardmarketProducts() : {},
    ]);
    const total = c.set?.cardCount?.official;

    const texts = [];
    for (const a of c.abilities || []) texts.push({ title: `${a.type || ''} ${a.name}`.trim(), body: a.effect });
    for (const a of c.attacks || []) {
      const cost = a.cost?.length ? ` [${a.cost.join(', ')}]` : '';
      texts.push({ title: `${a.name}${cost}${a.damage ? ` · ${a.damage}` : ''}`, body: a.effect });
    }
    if (c.effect) texts.push({ titleKey: 'effect', body: c.effect });
    if (c.description) texts.push({ titleKey: 'description', body: c.description });

    const legal = c.legal ? [c.legal.standard && 'Standard', c.legal.expanded && 'Expanded'].filter(Boolean).join(', ') : null;

    return {
      name: c.name,
      setId: c.set?.id,
      setName: c.set?.name,
      image: imageOf(c, collected, 'high', lang),
      details: clean([
        ['set', c.set?.name],
        ['number', total ? `${c.localId} / ${total}` : c.localId],
        ['category', c.category],
        ['rarity', c.rarity],
        ['hp', c.hp],
        ['types', c.types?.join(', ')],
        ['stage', c.stage],
        ['evolveFrom', c.evolveFrom],
        ['trainerType', c.trainerType],
        ['weakness', c.weaknesses?.map((w) => `${w.type} ${w.value || ''}`.trim()).join(', ')],
        ['resistance', c.resistances?.map((w) => `${w.type} ${w.value || ''}`.trim()).join(', ')],
        ['retreat', c.retreat],
        ['illustrator', c.illustrator],
        ['format', legal],
      ]),
      variants: Object.entries(c.variants || {}).filter(([, v]) => v).map(([k]) => k),
      texts,
      prices: [...prices(withOwnCardmarket(c.pricing, ownCm[id]), collected[id], c.variants), ...versionsBlock(versions[id])],
      versions: versionsOf(versions[id]),
      links: [
        { label: 'Cardmarket', url: `https://www.cardmarket.com/${lang === 'fr' ? 'fr' : 'en'}/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name)}` },
        collected[id] && { label: 'TCGplayer', url: `https://www.tcgplayer.com/product/${collected[id][0]}` },
      ].filter(Boolean),
    };
  }),

  // Onglet « Pokémon » : une entrée par espèce (n° du Pokédex national), illustration officielle, nom dans la langue des cartes.
  charactersLabel: 'Pokémon',
  characterOrder: 'Pokédex',
  getCharacters: memo(async (lang) =>
    (await speciesList()).map((row) => ({
      id: String(row[0]), number: row[0], name: row[SPECIES_LANG[lang] ?? 2] || row[2],
      image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${row[0]}.png`,
    }))),
  // Toutes les cartes d'une espèce (TCGdex filtre par n° de Pokédex), de la plus récente à la plus ancienne.
  getCharacterCards: memo(async (dexId, lang) => {
    const [cards, sets, collected] = await Promise.all([
      getJSON(`${base(lang)}/cards?dexId=eq:${encodeURIComponent(dexId)}`, { allowMissing: true }),
      adapter.getSets(lang),
      tcgplayerPrices(lang),
    ]);
    const setById = new Map(sets.map((s) => [s.id, s]));
    return (cards || [])
      .map((c) => ({ c, set: setById.get(c.id.slice(0, c.id.lastIndexOf('-'))) }))
      .filter(({ set }) => set) // extensions TCG Pocket et inconnues écartées
      .map((x) => ({ ...x, date: promoDate(x.set, x.c.localId, sets) || x.set.date || '' }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(({ c, set, date }) => ({
        id: c.id, name: c.name, number: c.localId, image: imageOf(c, collected, 'low', lang), setId: set.id,
        subtitle: [set.name, date].filter(Boolean).join(' · '),
      }));
  }),
};

export default adapter;
