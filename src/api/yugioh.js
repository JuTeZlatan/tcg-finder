// Yu-Gi-Oh! via YGOPRODeck (https://ygoprodeck.com/api-guide/) : données FR/EN, prix Cardmarket, TCGplayer, eBay…
// Les noms d'extensions restent en anglais (c'est la clé utilisée par l'API).
import { versionsOfCard } from '../lib/masterSet';
import { finishName } from '../lib/finishes';
import { getJSON, memo, num, clean } from './http';
import { loadBundledFile } from './bundledData';
import { loadData } from './dataSource';

const BASE = 'https://db.ygoprodeck.com/api/v7';

// Prix Cardmarket par édition, collectés chaque jour (pipeline/yugioh.mjs) :
// { "LOB-EN001|Ultra Rare": [idProduct, réf, tendance, plus bas, moy. 30 j] }
const cardmarketByEdition = memo(async () => {
  try {
    return await loadData(`yugioh/cardmarket.json`, () => loadBundledFile('yugioh-cardmarket'));
  } catch {
    return {};
  }
});
// Prix TCGplayer par impression et par tirage (1re édition, Unlimited, Limited), collectés chaque jour.
const tcgplayerByEdition = memo(async () => {
  try {
    return await loadData(`yugioh/tcgplayer.json`, () => loadBundledFile('yugioh-tcgplayer'));
  } catch {
    return {};
  }
});
const PRINTINGS = { '1st Edition': 'firstEdition', Unlimited: 'unlimited', Limited: 'limited' };
// [[tirage, marché, plus bas], …] → lignes de prix par tirage.
const printingItems = (entries) => entries.flatMap(([sub, market, low]) => [
  num(market) && { label: 'market', variant: PRINTINGS[sub] || sub, value: num(market), currency: 'USD' },
  num(low) && { label: 'low', variant: PRINTINGS[sub] || sub, value: num(low), currency: 'USD' },
]).filter(Boolean);

// Prix TCGplayer des impressions d'une carte dans une extension. Une seule impression : versions par tirage
// (1re édition, Unlimited…). Plusieurs (même carte en Ultra Rare et en Secret Rare…) : une version par rareté ET
// par tirage, chacune étant une carte différente à collectionner ; la première impression en Unlimited d'abord
// (version de référence).
async function printingsBlock(inSet) {
  const byEdition = await tcgplayerByEdition();
  const multi = inSet.length > 1;
  const rows = [];
  let productId = null;
  for (const e of inSet) {
    const entry = byEdition[`${e.set_code}|${e.set_rarity}`];
    if (!entry) {
      // Impression absente de TCGplayer (ex. LOB-E, européenne) : elle existe quand même, à collectionner,
      // avec le prix YGOPRODeck de l'impression s'il est connu.
      if (multi) rows.push({ label: 'price', variant: `${e.set_code}|${e.set_rarity}`, name: `${e.set_rarity} (${e.set_code})`, value: num(e.set_price), currency: 'USD' });
      continue;
    }
    productId ??= entry[0];
    for (const it of printingItems(entry[1])) {
      rows.push(multi ? { ...it, variant: `${e.set_code}|${e.set_rarity}|${it.variant}`, name: `${e.set_rarity} (${e.set_code}) · ${finishName(it.variant)}` } : it);
    }
  }
  const first = inSet[0] && `${inSet[0].set_code}|${inSet[0].set_rarity}|unlimited`;
  rows.sort((a, b) => Number(b.variant === first) - Number(a.variant === first));
  return { items: rows, productId };
}

// Cartes d'une requête (extension, archétype) : liste anglaise complète, avec la version traduite quand elle existe.
// YGOPRODeck ne renvoie dans une autre langue que les cartes déjà traduites (4 sur 24 pour certaines extensions).
async function queryCards(param, lang) {
  const url = (l) => `${BASE}/cardinfo.php?${param}${langParam(l)}`;
  const [en, local] = await Promise.all([
    getJSON(url('en'), { allowMissing: true }),
    lang === 'en' ? null : getJSON(url(lang), { allowMissing: true }).catch(() => null),
  ]);
  const byId = new Map((local?.data || []).map((c) => [c.id, c]));
  return (en?.data || []).map((c) => byId.get(c.id) || c);
}

const langParam = (lang) => (lang === 'en' ? '' : `&language=${lang}`);
const fullCards = new Map();

function summary(c, setName, lang) {
  fullCards.set(`${lang}:${c.id}`, c);
  const entry = setName ? c.card_sets?.find((s) => s.set_name === setName) : null;
  return {
    id: String(c.id),
    name: c.name,
    number: entry?.set_code,
    subtitle: entry ? entry.set_rarity : c.type,
    image: c.card_images?.[0]?.image_url_small,
  };
}

// Archétypes collectés : [nom, id de la carte phare, nombre de cartes].
const archetypeList = memo(async () => {
  try {
    return await loadData(`yugioh/archetypes.json`, () => loadBundledFile('yugioh-archetypes'));
  } catch {
    return [];
  }
});

const adapter = {
  id: 'yugioh',
  name: 'Yu-Gi-Oh!',
  tagline: 'Yu-Gi-Oh! Trading Card Game',
  color: '#7B4FD6',
  languages: ['fr', 'en'],
  source: { name: 'YGOPRODeck', url: 'https://ygoprodeck.com' },

  getSets: memo(async () => {
    const sets = await getJSON(`${BASE}/cardsets.php`);
    return sets
      .filter((s) => s.num_of_cards > 0)
      .sort((a, b) => (b.tcg_date || '').localeCompare(a.tcg_date || ''))
      .map((s) => ({
        id: s.set_name,
        name: s.set_name,
        logo: s.set_image,
        count: s.num_of_cards,
        subtitle: `${s.set_code}${s.tcg_date ? ` · ${s.tcg_date}` : ''}`,
        date: s.tcg_date || '',
      }));
  }),

  getCards: memo(async (setName, lang) => {
    return (await queryCards(`cardset=${encodeURIComponent(setName)}`, lang))
      .map((c) => summary(c, setName, lang))
      .sort((a, b) => (a.number || '').localeCompare(b.number || '', undefined, { numeric: true }));
  }),

  // Master set : chaque rareté et chaque tirage (1re édition, Unlimited, Limited) des cartes de l’extension.
  getVersions: memo(async (setName, lang) => {
    const cards = await queryCards(`cardset=${encodeURIComponent(setName)}`, lang);
    const rows = await Promise.all(cards.map(async (c) => {
      const { items } = await printingsBlock((c.card_sets || []).filter((s) => s.set_name === setName));
      return { card: summary(c, setName, lang), prices: items.length ? [{ source: 'TCGplayer', items }] : [] };
    }));
    return rows
      .sort((a, b) => (a.card.number || '').localeCompare(b.card.number || '', undefined, { numeric: true }))
      .flatMap(({ card, prices }) => versionsOfCard(card, prices));
  }),

  searchCards: memo(async (query, lang) => {
    const res = await getJSON(`${BASE}/cardinfo.php?fname=${encodeURIComponent(query)}&num=120&offset=0${langParam(lang)}`, { allowMissing: true });
    return (res?.data || []).map((c) => summary(c, null, lang));
  }),

  getCard: memo(async (id, setName, lang) => {
    let c = fullCards.get(`${lang}:${id}`);
    // Carte pas encore traduite : version anglaise.
    if (!c) c = (await getJSON(`${BASE}/cardinfo.php?id=${encodeURIComponent(id)}${langParam(lang)}`, { allowMissing: true }).catch(() => null))?.data?.[0];
    if (!c) c = (await getJSON(`${BASE}/cardinfo.php?id=${encodeURIComponent(id)}`)).data[0];
    const p = c.card_prices?.[0] || {};
    const market = [
      ['eBay', p.ebay_price, 'USD'],
      ['Amazon', p.amazon_price, 'USD'],
      ['CoolStuffInc', p.coolstuffinc_price, 'USD'],
    ].map(([text, v, currency]) => ({ text, value: num(v), currency })).filter((i) => i.value);

    const sets = c.card_sets || [];
    const inSet = setName ? sets.filter((s) => s.set_name === setName) : [];
    const editions = (inSet.length ? inSet : sets).slice(0, 40)
      .map((s) => ({ text: `${s.set_code} · ${s.set_rarity}`, value: num(s.set_price), currency: 'USD' }))
      .filter((i) => i.value);

    // Moyenne : on compare la même chose sur les deux sites.
    // - Édition connue (ouverte depuis son extension) : prix Cardmarket de cette édition (collecté chaque jour)
    //   + prix TCGplayer de cette édition.
    // - Sinon : prix le plus bas de la carte, toutes éditions confondues, sur les deux sites.
    // Les prix eBay/Amazon de YGOPRODeck sont des annonces, pas des ventes : affichés mais exclus de la moyenne.
    const prices = [];
    const edition = inSet[0];
    const cmEdition = edition && (await cardmarketByEdition())[`${edition.set_code}|${edition.set_rarity}`];
    const tcgEdition = edition && num(edition.set_price);
    if (edition && (cmEdition || tcgEdition)) {
      if (cmEdition) {
        const [, ref, trend, low, avg30] = cmEdition;
        prices.push({
          source: 'Cardmarket',
          items: [['trend', trend], ['low', low], ['avg30', avg30]].map(([label, v]) => ({ label, value: num(v), currency: 'EUR' })).filter((i) => i.value),
          ref: { value: ref, currency: 'EUR' },
        });
      }
      // TCGplayer : prix par rareté et par tirage si collecté (référence : première impression, Unlimited).
      const { items, productId } = await printingsBlock(inSet);
      const mainMarket = items.find((i) => i.label === 'market' && /(^||)unlimited$/.test(i.variant)) || items.find((i) => i.label === 'market');
      if (mainMarket) {
        prices.push({ source: 'TCGplayer', items, ref: { value: mainMarket.value, currency: 'USD' }, url: `https://www.tcgplayer.com/product/${productId}` });
      } else if (tcgEdition) {
        prices.push({ source: 'TCGplayer', items: [{ label: 'price', value: tcgEdition, currency: 'USD' }], ref: { value: tcgEdition, currency: 'USD' } });
      }
      const lowest = [['Cardmarket', p.cardmarket_price, 'EUR'], ['TCGplayer', p.tcgplayer_price, 'USD']]
        .map(([text, v, currency]) => ({ text, value: num(v), currency })).filter((i) => i.value);
      if (lowest.length) prices.push({ sourceKey: 'lowestAnyEdition', items: lowest });
    } else {
      const cmPrice = num(p.cardmarket_price);
      const tcgPrice = num(p.tcgplayer_price);
      if (cmPrice) prices.push({ source: 'Cardmarket', items: [{ label: 'low', value: cmPrice, currency: 'EUR' }], ref: { value: cmPrice, currency: 'EUR' } });
      if (tcgPrice) prices.push({ source: 'TCGplayer', items: [{ label: 'low', value: tcgPrice, currency: 'USD' }], ref: { value: tcgPrice, currency: 'USD' } });
    }
    if (market.length) prices.push({ sourceKey: 'lowestMarket', items: market });
    if (editions.length) prices.push({ sourceKey: inSet.length ? 'thisEdition' : 'byEdition', items: editions });

    // Ajoutée depuis la recherche (sans extension) : on la range dans sa première édition.
    const ownSet = setName || sets[0]?.set_name || null;
    return {
      name: c.name,
      setId: ownSet,
      setName: ownSet,
      subtitle: c.name_en && c.name_en !== c.name ? c.name_en : null,
      image: c.card_images?.[0]?.image_url,
      details: clean([
        ['set', setName],
        ['codes', inSet.map((s) => s.set_code).join(', ')],
        ['rarity', [...new Set(inSet.map((s) => s.set_rarity))].join(', ')],
        ['type', c.type],
        ['monsterType', c.race],
        ['attribute', c.attribute],
        [c.type?.includes('XYZ') ? 'rank' : 'level', c.level],
        ['pendulumScale', c.scale],
        ['link', c.linkval],
        ['atk', c.atk],
        ['def', c.def],
        ['archetype', c.archetype],
        ['editionCount', sets.length || null],
      ]),
      texts: c.desc ? [{ titleKey: 'text', body: c.desc }] : [],
      prices,
      links: [{ label: 'YGOPRODeck', url: c.ygoprodeck_url }].filter((l) => l.url),
    };
  }),

  // Onglet « Archétypes » : icône = illustration de la carte phare de l'archétype.
  charactersLabel: 'Archétypes',
  getCharacters: memo(async () =>
    (await archetypeList()).map(([name, cardId, count]) => ({
      id: name, name, count, image: `https://images.ygoprodeck.com/images/cards_cropped/${cardId}.jpg`,
    }))),
  // Chaque impression (code, rareté) des cartes de l'archétype, de la plus récente à la plus ancienne.
  getCharacterCards: memo(async (archetype, lang) => {
    const [res, sets] = await Promise.all([
      queryCards(`archetype=${encodeURIComponent(archetype)}`, lang),
      adapter.getSets(lang),
    ]);
    const dateOf = new Map(sets.map((s) => [s.name, s.date]));
    return res
      .flatMap((c) => {
        fullCards.set(`${lang}:${c.id}`, c);
        return (c.card_sets || []).map((e) => ({
          id: String(c.id), name: c.name, number: e.set_code, image: c.card_images?.[0]?.image_url_small,
          setId: e.set_name, date: dateOf.get(e.set_name) || '', subtitle: `${e.set_rarity} · ${e.set_name}`,
        }));
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }),
};

export default adapter;
