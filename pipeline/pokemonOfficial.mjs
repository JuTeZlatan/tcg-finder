// Images des cartes Pokémon japonaises et chinoises absentes de TCGdex, prises sur les sites officiels :
// - japonais : www.pokemon-card.com (API de recherche : nom + image, dans l'ordre des numéros) ;
// - chinois traditionnel : asia.pokemon-card.com/tw (liste par extension ; numéro lu sur la fiche de la carte).
// Les correspondances trouvées sont gardées d'un jour à l'autre (fichier publié la veille) : seules les cartes
// encore sans image sont recherchées.
import { getJSON, getText, sleep } from './lib.mjs';

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (TCG Finder data collector)' } };
const normJa = (s) => String(s || '').normalize('NFKC').replace(/[\s・･]/g, '').toLowerCase();
const localNum = (s) => String(s || '').split('/')[0].replace(/^0+(?=\d)/, '').toUpperCase();

// Liste officielle japonaise d'une extension : [{ name, image }] dans l'ordre du site (celui des numéros).
async function jaOfficialList(code) {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const url = `https://www.pokemon-card.com/card-search/resultAPI.php?keyword=&se_ta=&regulation_sidebar_form=all&pg=${encodeURIComponent(code)}&illust=&sm_and_keyword=true&page=${page}`;
    const res = await getJSON(url, UA).catch(() => null);
    for (const c of res?.cardList || []) out.push({ name: normJa(c.cardNameAltText), image: `https://www.pokemon-card.com${c.cardThumbFile}` });
    if (!res || page >= (res.maxPage || 0)) break;
    await sleep(150);
  }
  return out;
}

// Associe les cartes TCGdex (dans l'ordre des numéros) aux cartes du site de même nom, en avançant dans l'ordre :
// deux cartes de même nom (version normale puis illustration rare) prennent les images dans le même ordre.
function matchByNameInOrder(cards, official) {
  const used = new Set();
  const out = {};
  for (const c of cards) {
    const name = normJa(c.name);
    const i = official.findIndex((o, k) => !used.has(k) && o.name === name);
    if (i < 0) continue;
    used.add(i);
    out[c.id] = official[i].image;
  }
  return out;
}

// Liste officielle chinoise (Taïwan) : [{ detailId, image }] dans l'ordre du site.
async function twOfficialList(code) {
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const html = await getText(`https://asia.pokemon-card.com/tw/card-search/list/?expansionCodes=${encodeURIComponent(code)}&pageNo=${page}`, UA).catch(() => '');
    const items = [...html.matchAll(/detail\/(\d+)\/[\s\S]*?data-original="([^"]+card-img\/[^"]+)"/g)];
    for (const m of items) out.push({ detailId: m[1], image: m[2] });
    const pages = Number(html.match(/共\s*(\d+)\s*頁/)?.[1] || 1);
    if (!items.length || page >= pages) break;
    await sleep(150);
  }
  return out;
}

const twNumber = async (detailId) => {
  const html = await getText(`https://asia.pokemon-card.com/tw/card-search/detail/${detailId}/`, UA).catch(() => '');
  return localNum(html.replace(/<[^>]+>/g, ' ').match(/\b(\d{1,3}\/\d{1,3})\b/)?.[1]);
};

// Chinois : même nombre de cartes que TCGdex → appariement dans l'ordre, vérifié sur la première, celle du milieu et la dernière ;
// sinon numéro lu sur la fiche de chaque carte du site.
async function matchTw(cards, official) {
  const out = {};
  const byNum = new Map(cards.map((c) => [localNum(c.localId), c]));
  if (official.length === cards.length && official.length > 1) {
    const checks = [0, Math.floor(cards.length / 2), cards.length - 1];
    let same = true;
    for (const i of checks) same = same && (await twNumber(official[i].detailId)) === localNum(cards[i].localId);
    if (same) {
      official.forEach((o, i) => { out[cards[i].id] = o.image; });
      return out;
    }
  }
  for (const o of official) {
    const card = byNum.get(await twNumber(o.detailId));
    if (card && !out[card.id]) out[card.id] = o.image;
    await sleep(100);
  }
  return out;
}

// sets : [{ id, cards: [{ id, localId, name }] }] (cartes dans l'ordre des numéros) ; missing : Set des cartes sans image ;
// known : correspondances de la veille. Renvoie { idCarte: urlImage } pour les cartes manquantes.
export async function officialImages(lang, sets, missing, known = {}) {
  const out = {};
  for (const id of missing) if (known[id]) out[id] = known[id];
  for (const s of sets) {
    const todo = s.cards.filter((c) => missing.has(c.id) && !out[c.id]);
    if (!todo.length) continue;
    try {
      const official = lang === 'ja' ? await jaOfficialList(s.id) : await twOfficialList(s.id);
      if (!official.length) continue;
      const found = lang === 'ja' ? matchByNameInOrder(s.cards, official) : await matchTw(s.cards, official);
      for (const c of todo) if (found[c.id]) out[c.id] = found[c.id];
    } catch {
      // site indisponible pour cette extension : on réessaiera demain
    }
    await sleep(200);
  }
  return out;
}
