// Sources des sorties d'extensions (onglet « Sorties ») en plus de TCGplayer : sites officiels des éditeurs et
// références des communautés, pour avoir les annonces le plus tôt possible et le nom officiel dans chaque langue.
// Chaque source renvoie des entrées { tcg, names: { langue: nom }, dates: { langue: 'AAAA-MM-JJ' }, code, image,
// source } ; upcoming.mjs les rapproche entre elles (code d'extension, sinon nom anglais) et avec TCGplayer.
// Une source indisponible est ignorée (journal du jour), les autres continuent.
//
// Langues : fr, en, de, it, es, pt, ja, zh, ko (celles de l'appli et des cartes).
import { getJSON, getText, sleep } from './lib.mjs';

// ---------- Outils ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#039': "'", '#39': "'", '#8211': '–', '#8217': '’', rsquo: '’' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (ENTITIES[e.toLowerCase()] != null) return ENTITIES[e.toLowerCase()];
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return m;
});
// Texte visible d'une page, une ligne par bloc.
export const lines = (html) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n'))
  .split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

const MONTHS = {
  // en, fr, de, it, es (minuscules, sans accents)
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  januar: 1, februar: 2, marz: 3, juni: 6, juli: 7, oktober: 10, dezember: 12,
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, dicembre: 12,
  enero: 1, febrero: 2, abril: 4, mayo: 5, junio: 6, julio: 7, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const iso = (y, m, d) => (y && m && d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
// Date écrite dans une langue quelconque : « April 23, 2027 », « 23 avril 2027 », « 1er octobre 2027 »,
// « 28. Januar 2027 », « 28 de enero de 2027 », « 2027.04.24(土) », « 2027年11月27日 », « 2026-10-16 ».
export function parseDate(text) {
  if (!text) return null;
  const t = plain(String(text));
  let m = t.match(/(20\d\d)\s*[.\-/年]\s*(\d{1,2})\s*[.\-/月]\s*(\d{1,2})/);
  if (m) return iso(m[1], +m[2], +m[3]);
  m = t.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)/);
  if (m && MONTHS[m[1]]) return iso(m[3], MONTHS[m[1]], +m[2]);
  m = t.match(/(\d{1,2})(?:er|\.|º|°)?\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(20\d\d)/);
  if (m && MONTHS[m[2]]) return iso(m[3], MONTHS[m[2]], +m[1]);
  return null;
}

// Clé de rapprochement d'un nom : minuscules, sans accents ni ponctuation, sans « Magic: The Gathering », sans le
// code devant (« ME06: Delta Reign » → « deltareign »).
export const nameKey = (s) => plain(String(s || ''))
  .replace(/^[a-z]{1,4}\d{1,3}[a-z]?\s*:\s*/, '')
  .replace(/magic\s*:?\s*the gathering\s*[|—:-]?\s*/g, '')
  .replace(/[^a-z0-9]+/g, '');
// Code d'extension comparable : « OP-19 » = « OP19 », « [FB11] » = « FB11 ».
export const codeKey = (s) => (s ? String(s).toUpperCase().replace(/[^A-Z0-9]/g, '') : null);

async function safe(label, fn) {
  try {
    const out = await fn();
    console.log(`  sorties · ${label} : ${out.length}`);
    return out;
  } catch (e) {
    console.log(`  sorties · ${label} : indisponible (${e.message})`);
    return [];
  }
}

// ---------- One Piece : sites officiels Bandai (anglais, français, japonais, chinois de Taïwan) ----------
// Liste des produits avec « NOM [CODE] » puis la date de sortie propre à chaque région ; annonces des mois à l'avance.
const OP_SITES = { en: 'https://en.onepiece-cardgame.com/products/', fr: 'https://fr.onepiece-cardgame.com/products/', ja: 'https://www.onepiece-cardgame.com/products/', zh: 'https://asia-tw.onepiece-cardgame.com/products/' };
// Ligne « NOM [CODE] » ou « NOM【CODE】 » suivie de sa date de sortie dans les lignes suivantes.
function productsWithCodes(text, { dateLabel }) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const m = text[i].match(/^(.*?)\s*[[【]([A-Z]{1,4}-?[A-Z]?\d{1,3})[\]】]\s*$/);
    if (!m) continue;
    let date = null;
    for (let k = i + 1; k < Math.min(text.length, i + 5); k++) {
      if (/[[【][A-Z]{1,4}-?[A-Z]?\d{1,3}[\]】]/.test(text[k])) break; // produit suivant
      if (dateLabel.test(text[k])) { date = parseDate(text[k + 1]) || parseDate(text[k]); break; }
    }
    const name = m[1].replace(/^(BOOSTERS?|DECKS?|OTHERS|AUTRE|ブースター|デッキ|その他)\s*\|\s*/i, '').trim();
    if (name) out.push({ name, code: m[2], date });
  }
  return out;
}
async function onePiece() {
  const byCode = new Map();
  for (const [lang, url] of Object.entries(OP_SITES)) {
    const html = await getText(url).catch(() => null);
    if (!html) continue;
    for (const p of productsWithCodes(lines(html), { dateLabel: /release date|date de sortie|発売日|發售日期/i })) {
      const key = codeKey(p.code);
      if (!byCode.has(key)) byCode.set(key, { tcg: 'onepiece', code: p.code, names: {}, dates: {}, source: 'Bandai (sites officiels)' });
      const e = byCode.get(key);
      e.names[lang] = p.name;
      // Site de Taïwan : dates parfois décalées d'un an ; seul le nom est repris.
      if (p.date && lang !== 'zh') e.dates[lang] = p.date;
    }
    await sleep(300);
  }
  return [...byCode.values()].filter((e) => Object.keys(e.dates).length);
}

// ---------- Dragon Ball Super Fusion World et Masters : sites officiels Bandai ----------
async function dragonBall() {
  const out = [];
  const byCode = new Map();
  for (const [lang, url] of [['en', 'https://www.dbs-cardgame.com/fw/en/products/'], ['ja', 'https://www.dbs-cardgame.com/fw/jp/products/']]) {
    const html = await getText(url).catch(() => null);
    if (!html) continue;
    for (const p of productsWithCodes(lines(html), { dateLabel: /^release$|発売日/i })) {
      const key = codeKey(p.code);
      if (!byCode.has(key)) byCode.set(key, { tcg: 'dbsfw', code: p.code, names: {}, dates: {}, source: 'Bandai (site officiel Fusion World)' });
      const e = byCode.get(key);
      e.names[lang] = p.name.replace(/^(BOOSTER PACK|ブースターパック)\s*-?\s*/i, '').replace(/^-|-$/g, '').trim();
      if (p.date) e.dates[lang] = p.date;
    }
  }
  out.push(...[...byCode.values()].filter((e) => Object.keys(e.dates).length));
  // Masters : page « produit » du dernier booster (nom -X-, [CODE], date).
  const html = await getText('https://www.dbs-cardgame.com/us-en/product/').catch(() => null);
  if (html) {
    const t = lines(html);
    for (let i = 0; i < t.length; i++) {
      const code = t[i].match(/^\[([A-Z]{2,4}-[A-Z]?\d{1,3})\]$/)?.[1];
      if (!code) continue;
      const name = t[i - 1]?.replace(/^-|-$/g, '').trim();
      const k = t.slice(i, i + 4).findIndex((x) => /release date/i.test(x));
      const date = k >= 0 ? parseDate(t[i + k + 1]) : null;
      if (name && date) out.push({ tcg: 'dbsmasters', code, names: { en: name }, dates: { en: date }, source: 'Bandai (site officiel Masters)' });
    }
  }
  return out;
}

// ---------- Magic : site officiel de Wizards, dans chaque langue ----------
// Menu « Bientôt » (extensions annoncées, jusqu'à un an à l'avance) et « Maintenant disponible » : même adresse
// d'extension dans toutes les langues (/products/<slug>), nom officiel traduit ; date sur la page de l'extension.
const MTG_LOCALES = { en: 'en', fr: 'fr', de: 'de', it: 'it', es: 'es', pt: 'pt-br', ja: 'ja', ko: 'ko', zh: 'zh-hans' };
async function magic() {
  const bySlug = new Map();
  for (const [lang, loc] of Object.entries(MTG_LOCALES)) {
    const html = await getText(`https://magic.wizards.com/${loc}/products`).catch(() => null);
    if (!html) continue;
    // Les deux premières listes du menu « Produits » : bientôt, puis maintenant disponible.
    const menu = html.match(/<ul class="[^"]*"><li><span>[^<]+<\/span>[\s\S]*?<\/ul><\/li><li><span>[^<]+<\/span>[\s\S]*?<\/ul>/)?.[0] || '';
    for (const m of menu.matchAll(/href="https:\/\/magic\.wizards\.com\/[a-z-]+\/products\/([a-z0-9/-]+)">([^<]+)<\/a>/g)) {
      const slug = m[1];
      if (!bySlug.has(slug)) bySlug.set(slug, { tcg: 'magic', slug, names: {}, dates: {}, source: 'Wizards of the Coast (site officiel)' });
      bySlug.get(slug).names[lang] = decode(m[2]).replace(/^『(.*)』$/, '$1').trim();
    }
    await sleep(300);
  }
  // Date de sortie (page de l'extension, en anglais : « Release Date: … ») ; les pages françaises la donnent aussi.
  for (const e of bySlug.values()) {
    for (const [lang, loc] of [['en', 'en'], ['fr', 'fr']]) {
      const html = await getText(`https://magic.wizards.com/${loc}/products/${e.slug}`).catch(() => null);
      const line = html && lines(html).find((x) => /release date|date de sortie/i.test(x) && /20\d\d/.test(x));
      const date = line && parseDate(line.replace(/^.*?:\s*/, ''));
      if (date) e.dates[lang] = date;
      await sleep(200);
    }
  }
  // Sans date (page pas encore complète) : les noms servent quand même aux sorties déjà connues par Scryfall.
  return [...bySlug.values()];
}

// ---------- Yu-Gi-Oh! : site officiel Konami Europe (anglais, français, allemand, italien, espagnol) ----------
// Produits des catégories (première page = les plus récents et ceux à venir) ; même adresse dans toutes les langues.
const YGO_CATEGORIES = ['boosters', 'decks-de-structure', 'boites', 'decks-de-demarrage', 'autres'];
const YGO_LANGS = { en: '', fr: 'fr/', de: 'de/', it: 'it/', es: 'es/' };
async function yugioh() {
  const slugs = new Set();
  for (const cat of YGO_CATEGORIES) {
    const html = await getText(`https://www.yugioh-card.com/eu/fr/product-category/${cat}/`).catch(() => null);
    for (const m of (html || '').matchAll(/href="\/eu\/fr\/product\/([a-z0-9-]+)\/"/g)) slugs.add(m[1]);
    await sleep(300);
  }
  const out = [];
  for (const slug of slugs) {
    const e = { tcg: 'yugioh', slug, names: {}, dates: {}, source: 'Konami Europe (site officiel)' };
    for (const [lang, prefix] of Object.entries(YGO_LANGS)) {
      const html = await getText(`https://www.yugioh-card.com/eu/${prefix}product/${slug}/`).catch(() => null);
      if (!html) continue;
      const title = decode(html.match(/<title>([^<]+)<\/title>/)?.[1] || '').replace(/\s*[–-]\s*Yu-Gi-Oh!.*$/i, '').trim();
      if (title) e.names[lang] = title;
      const t = lines(html);
      const k = t.findIndex((x) => /^release date/i.test(x));
      const date = k >= 0 ? parseDate(t[k + 1]) || parseDate(t[k]) : null;
      if (date) e.dates[lang] = date;
      await sleep(150);
    }
    if (Object.keys(e.dates).length) out.push(e);
  }
  return out;
}

// ---------- Lorcana : LorcanaJSON (données officielles de l'appli Ravensburger), noms et dates par langue ----------
async function lorcana() {
  const bySet = new Map();
  for (const lang of ['en', 'fr', 'de', 'it']) {
    const d = await getJSON(`https://lorcanajson.org/files/current/${lang}/allCards.json`).catch(() => null);
    for (const [code, s] of Object.entries(d?.sets || {})) {
      if (!bySet.has(code)) bySet.set(code, { tcg: 'lorcana', code, names: {}, dates: {}, source: 'LorcanaJSON (Ravensburger)' });
      const e = bySet.get(code);
      e.names[lang] = s.name;
      const date = s.releaseDate || s.prereleaseDate;
      if (date) e.dates[lang] = date.slice(0, 10);
    }
  }
  return [...bySet.values()];
}

// ---------- Riftbound : galerie officielle de Riot (nom de chaque extension par langue) ----------
const RB_LOCALES = { en: 'en-us', fr: 'fr-fr', de: 'de-de', it: 'it-it', es: 'es-es', pt: 'pt-br', ja: 'ja-jp', ko: 'ko-kr', zh: 'zh-cn' };
async function riftbound() {
  const byCode = new Map();
  for (const [lang, loc] of Object.entries(RB_LOCALES)) {
    const html = await getText(`https://riftbound.leagueoflegends.com/${loc}/card-gallery/`).catch(() => null);
    const items = html?.match(/"sets":\{"items":(\[[^\]]*\])/)?.[1];
    if (!items) continue;
    for (const s of JSON.parse(items)) {
      if (!byCode.has(s.id)) byCode.set(s.id, { tcg: 'riftbound', code: s.id, names: {}, dates: {}, source: 'Riot Games (galerie officielle)' });
      byCode.get(s.id).names[lang] = s.name;
    }
    await sleep(300);
  }
  return [...byCode.values()];
}

// ---------- Star Wars Unlimited : base officielle (nom de chaque extension par langue) ----------
async function swu() {
  const byCode = new Map();
  for (const lang of ['en', 'fr', 'de', 'it', 'es']) {
    // Cartes les plus récentes d'abord : les extensions annoncées apparaissent dès les premières révélations.
    // Quelques pages suffisent à couvrir les extensions récentes et à venir.
    for (let page = 1; page <= 6; page++) {
      const d = await getJSON(`https://admin.starwarsunlimited.com/api/card-list?locale=${lang}&sort[0]=expansion.sortValue:desc&pagination%5Bpage%5D=${page}&pagination%5BpageSize%5D=250`).catch(() => null);
      for (const c of d?.data || []) {
        const x = c.attributes?.expansion?.data?.attributes;
        if (!x?.code) continue;
        if (!byCode.has(x.code)) byCode.set(x.code, { tcg: 'swu', code: x.code, names: {}, dates: {}, source: 'Fantasy Flight Games (base officielle)' });
        byCode.get(x.code).names[lang] = x.name;
      }
      if (!d || page >= (d.meta?.pagination?.pageCount || 1)) break;
      await sleep(250);
    }
  }
  return [...byCode.values()];
}

// ---------- Pokémon ----------
// Site officiel japonais : extensions japonaises (2 à 3 mois d'avance sur les internationales).
async function pokemonJapan() {
  const jp = await getJSON('https://www.pokemon-card.com/products/topList.php');
  const out = [];
  for (const p of jp?.products || []) {
    if (p.productType !== '拡張パック') continue;
    const date = parseDate(p.releaseDate);
    if (!date) continue;
    out.push({
      tcg: 'pokemon', region: 'JP', code: p.link_detailPage?.match(/\/ex\/([a-z0-9]+)\/?$/i)?.[1]?.toUpperCase() || null,
      names: { ja: p.productTitle.match(/「(.+)」/)?.[1] || p.productTitle }, dates: { ja: date },
      image: p.tumbsImg ? `https://www.pokemon-card.com${p.tumbsImg}` : null, source: 'The Pokémon Company (site officiel japonais)',
    });
  }
  return out;
}
// Noms officiels des extensions internationales dans chaque langue : Bulbapedia (liste de référence des noms
// européens) et TCGdex (données des cartes, par langue), rapprochés par le nom anglais.
// Colonnes des tableaux (leur ordre change d'une époque à l'autre : lu dans l'en-tête de chaque tableau).
const BULBA_LANGS = { English: 'en', Dutch: 'nl', French: 'fr', German: 'de', Italian: 'it', 'Brazilian Portuguese': 'pt', Portuguese: 'pt', Spanish: 'es' };
async function pokemonNames() {
  const out = new Map();
  const add = (en, lang, name) => {
    if (!en || !name || name === '—') return;
    const k = nameKey(en);
    if (!out.has(k)) out.set(k, { tcg: 'pokemon', names: { en }, dates: {}, source: 'Bulbapedia, TCGdex' });
    out.get(k).names[lang] ||= name.trim();
  };
  const wiki = await getJSON('https://bulbapedia.bulbagarden.net/w/api.php?action=parse&page=List_of_Pok%C3%A9mon_Trading_Card_Game_expansions_in_other_languages&prop=wikitext&format=json&formatversion=2').catch(() => null);
  const text = wiki?.parse?.wikitext || '';
  const english = text.split(/^==\s*Japanese sets/m)[0];
  for (const table of english.split(/^\{\|/m).slice(1)) {
    const body = table.split(/^\|\}/m)[0];
    // En-tête : « ! style=… | English » → ordre des langues de ce tableau (colonne 0 : symbole).
    const cols = body.split('\n').filter((l) => l.startsWith('!')).map((l) => BULBA_LANGS[l.split('|').pop().trim()] || null);
    if (!cols.includes('en')) continue;
    for (const row of body.split(/^\|-.*$/m).slice(1)) {
      const cells = row.split('\n').filter((l) => l.startsWith('|')).map((l) => l.slice(1).trim());
      let col = 0;
      let en = null;
      const values = [];
      for (const c of cells) {
        const span = Number(c.match(/colspan=(\d)/)?.[1] || 1); // « colspan=2 | X » : même nom pour 2 langues
        const value = c.replace(/^colspan=\d\s*\|\s*/, '').replace(/<br\s*\/?>.*$/, '').replace(/\[\[|\]\]|''/g, '').trim();
        for (let s = 0; s < span; s++, col++) {
          if (cols[col] === 'en') en = value.match(/\{\{TCG\|([^|}]+)/)?.[1]?.trim() || null;
          else if (cols[col]) values.push([cols[col], value]);
        }
      }
      if (en) for (const [lang, value] of values) if (!/\{\{/.test(value)) add(en, lang, value);
    }
  }
  const sets = {};
  for (const lang of ['en', 'fr', 'de', 'it', 'es', 'pt']) sets[lang] = await getJSON(`https://api.tcgdex.net/v2/${lang}/sets`).catch(() => []) || [];
  const enById = new Map(sets.en.map((s) => [s.id, s.name]));
  for (const lang of ['fr', 'de', 'it', 'es', 'pt']) for (const s of sets[lang]) add(enById.get(s.id), lang, s.name);
  return [...out.values()];
}

// ---------- Naruto Mythos : annonces du site officiel (absent de TCGplayer) ----------
// Date précise inconnue : `approx` (texte affiché à la place de la date) et `date` = début de la période. À mettre à
// jour à chaque annonce (https://www.narutotcgmythos.com/news, en anglais, français, italien et espagnol).
const NARUTO_ANNOUNCED = [
  // « Set 3 Akatsuki », sortie mondiale « Early 2027 » (annonce du 27 mai 2026)
  { tcg: 'naruto', code: 'S3', names: { en: 'Set 3 – Akatsuki', fr: 'Set 3 – Akatsuki', it: 'Set 3 – Akatsuki', es: 'Set 3 – Akatsuki' }, dates: { en: '2027-01-01' }, approx: 'Début 2027', image: null, source: 'Naruto Mythos TCG (site officiel)' },
];

// Toutes les sources, chacune isolée.
export async function officialReleases() {
  const groups = await Promise.all([
    safe('One Piece (Bandai)', onePiece),
    safe('Dragon Ball (Bandai)', dragonBall),
    safe('Magic (Wizards)', magic),
    safe('Yu-Gi-Oh! (Konami Europe)', yugioh),
    safe('Lorcana (LorcanaJSON)', lorcana),
    safe('Riftbound (Riot)', riftbound),
    safe('Star Wars Unlimited (FFG)', swu),
    safe('Pokémon Japon (officiel)', pokemonJapan),
    safe('Pokémon noms (Bulbapedia, TCGdex)', pokemonNames),
  ]);
  return [...groups.flat(), ...NARUTO_ANNOUNCED];
}
