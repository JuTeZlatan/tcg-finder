// Magic: The Gathering via Scryfall (https://scryfall.com/docs/api) : prix TCGplayer (USD), Cardmarket (EUR), MTGO.
// Les prix n'existent que sur les impressions anglaises : on liste donc l'anglais, et en français
// la fiche récupère en plus l'impression française (nom, texte, image) quand elle existe.
import { versionsOfCard } from '../lib/masterSet';
import { getJSON, memo, num, clean, sleep } from './http';
import { loadBundledFile } from './bundledData';
import { loadData } from './dataSource';

const BASE = 'https://api.scryfall.com';
// Codes de langue Scryfall : chinois simplifié = « zhs ».
const SCRYFALL_LANG = { zh: 'zhs' };
const EXCLUDED_TYPES = new Set(['token', 'memorabilia', 'minigame', 'alchemy', 'treasure_chest']);

const fullCards = new Map();
const imageOf = (c, size = 'normal') => c.image_uris?.[size] ?? c.card_faces?.[0]?.image_uris?.[size] ?? null;

function summary(c, withSet) {
  fullCards.set(c.id, c);
  return { id: c.id, name: c.name, number: c.collector_number, image: imageOf(c), subtitle: withSet ? c.set_name : undefined };
}

async function fetchAllPages(url, maxPages = 20) {
  const out = [];
  let next = url;
  for (let i = 0; next && i < maxPages; i++) {
    if (i > 0) await sleep(100); // Scryfall demande environ 10 requêtes/s max
    const page = await getJSON(next, { allowMissing: true });
    if (!page) break;
    out.push(...page.data);
    next = page.has_more ? page.next_page : null;
  }
  return out;
}

const priceItems = (rows, currency) =>
  rows.map(([variant, v]) => ({ label: 'price', variant, value: num(v), currency })).filter((i) => i.value);

// Prix Scryfall d'une impression (Cardmarket en euros, TCGplayer en dollars, par finition).
function pricesOf(c) {
  const p = c.prices || {};
  const prices = [];
  const cm = priceItems([['normal', p.eur], ['foil', p.eur_foil]], 'EUR');
  const tcg = priceItems([['normal', p.usd], ['foil', p.usd_foil], ['etched', p.usd_etched]], 'USD');
  const ref = (items) => items[0] && { value: items[0].value, currency: items[0].currency };
  if (cm.length) prices.push({ source: 'Cardmarket', items: cm, ref: ref(cm) });
  if (tcg.length) prices.push({ source: 'TCGplayer', items: tcg, ref: ref(tcg) });
  if (num(p.tix)) prices.push({ source: 'MTGO', items: [{ label: 'tickets', value: num(p.tix), currency: 'TIX' }] });
  return prices;
}

// Planeswalkers collectés (Scryfall) : [nom, illustration, nombre d'impressions].
const planeswalkerList = memo(async () => {
  try {
    return await loadData(`magic/planeswalkers.json`, () => loadBundledFile('magic-planeswalkers'));
  } catch {
    return [];
  }
});

const adapter = {
  id: 'magic',
  name: 'Magic',
  tagline: 'Magic: The Gathering',
  color: '#C77D2B',
  languages: ['fr', 'en', 'ja', 'zh'],
  source: { name: 'Scryfall', url: 'https://scryfall.com' },

  getSets: memo(async () => {
    const { data } = await getJSON(`${BASE}/sets`);
    return data
      .filter((s) => !s.digital && s.card_count > 0 && !EXCLUDED_TYPES.has(s.set_type))
      .sort((a, b) => (b.released_at || '').localeCompare(a.released_at || '')) // plus récente d'abord
      .map((s) => ({
        id: s.code,
        name: s.name,
        count: s.card_count,
        subtitle: `${s.code.toUpperCase()} · ${s.released_at ?? ''}`,
        date: s.released_at || '',
        // Symbole officiel de l'extension (SVG noir) : recoloré à l'affichage pour le fond sombre.
        logo: s.icon_svg_uri,
        logoTint: true,
      }));
  }),

  // Master set : chaque finition (normale, foil, etched) de chaque impression de l'extension.
  getVersions: memo(async (setCode) => {
    const q = encodeURIComponent(`e:${setCode}`);
    const cards = await fetchAllPages(`${BASE}/cards/search?q=${q}&order=set&unique=prints&include_extras=true&include_variations=true`);
    return cards.flatMap((c) => versionsOfCard(summary(c, false), pricesOf(c)));
  }),

  getCards: memo(async (setCode) => {
    const q = encodeURIComponent(`e:${setCode}`);
    const cards = await fetchAllPages(`${BASE}/cards/search?q=${q}&order=set&unique=prints&include_extras=true&include_variations=true`);
    return cards.map((c) => summary(c, false));
  }),

  searchCards: memo(async (query) => {
    const cards = await fetchAllPages(`${BASE}/cards/search?q=${encodeURIComponent(query)}&order=released&unique=prints`, 2);
    return cards.map((c) => summary(c, true));
  }),

  getCard: memo(async (id, _setId, lang) => {
    const c = fullCards.get(id) ?? (await getJSON(`${BASE}/cards/${encodeURIComponent(id)}`));
    const local = lang !== 'en'
      ? await getJSON(`${BASE}/cards/${c.set}/${encodeURIComponent(c.collector_number)}/${SCRYFALL_LANG[lang] || lang}`, { allowMissing: true }).catch(() => null)
      : null;
    const shown = local || c;
    const faces = shown.card_faces?.length ? shown.card_faces : [shown];
    const prices = pricesOf(c);

    const power = c.power != null ? c : (c.card_faces?.[0] ?? c);

    return {
      name: shown.printed_name || c.name,
      setId: c.set,
      setName: c.set_name,
      image: imageOf(shown, 'large') || imageOf(c, 'large') || imageOf(c),
      details: clean([
        ['set', `${c.set_name} (${c.set.toUpperCase()})`],
        ['number', c.collector_number],
        ['rarity', c.rarity],
        ['type', shown.printed_type_line || c.type_line],
        ['manaCost', faces.map((f) => f.mana_cost).filter(Boolean).join(' // ')],
        ['powerToughness', power.power != null ? `${power.power} / ${power.toughness}` : null],
        ['loyalty', c.loyalty],
        ['releaseDate', c.released_at],
        ['finishes', c.finishes?.join(', ')],
        ['illustrator', c.artist],
        ['legalFormats', Object.entries(c.legalities || {}).filter(([, v]) => v === 'legal').map(([k]) => k).join(', ')],
      ]),
      translateValues: ['rarity'],
      texts: faces
        .map((f) => ({
          title: faces.length > 1 ? f.printed_name || f.name : null,
          titleKey: faces.length > 1 ? null : 'text',
          body: [f.printed_text || f.oracle_text, f.flavor_text && `« ${f.flavor_text} »`].filter(Boolean).join('\n\n'),
        }))
        .filter((t) => t.body),
      prices,
      links: [
        { label: 'Scryfall', url: c.scryfall_uri },
        c.purchase_uris?.cardmarket && { label: 'Cardmarket', url: c.purchase_uris.cardmarket },
        c.purchase_uris?.tcgplayer && { label: 'TCGplayer', url: c.purchase_uris.tcgplayer },
      ].filter(Boolean),
    };
  }),

  // Onglet « Planeswalkers » : Jace, Chandra, Liliana… ; icône = illustration de l'impression la plus récente.
  charactersLabel: 'Planeswalkers',
  getCharacters: memo(async () =>
    (await planeswalkerList()).map(([name, image, count]) => ({ id: name, name, image, count }))),
  // Toutes les impressions d'un planeswalker, de la plus récente à la plus ancienne.
  getCharacterCards: memo(async (name) => {
    const q = encodeURIComponent(`t:planeswalker t:"${name}" game:paper`);
    const cards = await fetchAllPages(`${BASE}/cards/search?q=${q}&unique=prints&order=released&dir=desc`);
    return cards.map((c) => ({ ...summary(c, false), setId: c.set, subtitle: [c.set_name, c.released_at].filter(Boolean).join(' · ') }));
  }),
};

export default adapter;
