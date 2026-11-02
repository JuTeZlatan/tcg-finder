// Naruto Mythos TCG : galerie officielle (narutotcgmythos.com), en anglais et en français (cartes publiées en
// français seulement). Aucune place de marché publique ne liste encore ses cartes (ni TCGplayer, ni Cardmarket) :
// pas de prix pour l'instant.
import { getJSON, htmlToText, clean, writeTcg, sleep } from './lib.mjs';

// Adresse appelée par la galerie officielle elle-même (une requête par langue).
const GALLERY = 'https://services.agenziamarketingcarpi.it/proxy/naruto/proxy.php';
const OFFICIAL = 'https://www.narutotcgmythos.com/card-gallery';
const LANGS = ['en', 'fr'];
const RARITY = { C: 'Common', UC: 'Uncommon', R: 'Rare', RA: 'Rare Art', S: 'Secret', SV: 'Secret V', L: 'Legendary', M: 'Mission', H: 'Holo', MV: 'Mythos', SP: 'Special', P: 'Promo' };

// « NM-S1E1-L133V1 » → extension « S1 »
const setOf = (sku) => sku.match(/^NM-(S\d+)/)?.[1] || 'PR';
const numberKey = (c) => {
  const [n, total] = String(c.ID).split('/');
  return [parseInt(n, 10) || 0, total ? 0 : 1];
};

function toCard(c) {
  const name = c.Version ? `${c.Title} - ${c.Version}` : c.Title;
  return {
    id: c.SKU,
    name,
    number: c.ID,
    subtitle: [RARITY[c.Rarity] || c.Rarity, c.Edition].filter(Boolean).join(' · '),
    image: c.Image || null,
    thumb: c.Image || null,
    details: clean([
      ['set', c.Set],
      ['number', c.ID],
      ['rarity', RARITY[c.Rarity] || c.Rarity],
      ['type', c.CardType],
      ['edition', c.Edition],
      ['chakra', c.Chakra === '' || c.Chakra == null ? null : String(c.Chakra)],
      ['power', c.Power === '' || c.Power == null ? null : String(c.Power)],
      ['points', c.Points],
      ['group', c.Group],
      ['keywords', [c.Keyword1, c.Keyword2].filter(Boolean).join(', ')],
      ['artwork', c.Illustration !== 'Standard' ? c.Illustration : null],
      ['variant', c.Variant],
      ['stamp', c.Stamp],
      ['obtain', c.Obtain && htmlToText(c.Obtain)],
    ]),
    texts: c.Text ? [{ titleKey: 'effect', body: htmlToText(c.Text) }] : [],
    prices: [],
    links: [{ label: 'Naruto Mythos', url: OFFICIAL }],
  };
}

export async function build(outDir) {
  console.log('Naruto Mythos…');
  for (const lang of LANGS) {
    const data = await getJSON(`${GALLERY}?lang=${lang}`);
    // Une langue ne garde que les cartes publiées dans cette langue.
    const cards = (data?.[0]?.Cards || []).filter((c) => c.SKU && (c.Langs || []).includes(lang));
    const bySet = new Map();
    for (const c of cards) {
      const id = setOf(c.SKU);
      if (!bySet.has(id)) bySet.set(id, { id, name: c.Set || id, cards: [] });
      bySet.get(id).cards.push(c);
    }
    const sets = [...bySet.values()]
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })) // la plus récente d'abord
      .map((s) => {
        s.cards.sort((a, b) => {
          const [na, ta] = numberKey(a);
          const [nb, tb] = numberKey(b);
          return ta - tb || na - nb || a.SKU.localeCompare(b.SKU);
        });
        return { id: s.id, name: s.name, subtitle: `${s.cards.length} cartes`, date: '', cards: s.cards.map(toCard) };
      });
    await writeTcg(outDir, 'naruto', lang, sets);
    await sleep(500);
  }
}
