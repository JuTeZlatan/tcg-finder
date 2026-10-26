// Identification d'une carte à partir du texte lu par l'OCR : codes imprimés → cartes candidates, classées.
import { getTcg, dataLang } from '../api';
import { getJSON } from '../api/http';
import { detectCodes, nameCandidates, nameScore, similarity, textOverlap } from './scanDetect';

const SCRYFALL = 'https://api.scryfall.com';
const YGO = 'https://db.ygoprodeck.com/api/v7';

// candidat : { tcgId, lang, setId, id, name, number, image, score, why }
const cand = (tcgId, lang, c, score, why) => ({
  tcgId, lang, setId: c.setId ?? null, id: c.id, name: c.name, number: c.number, image: c.image, setName: c.setName, score, why,
});

// Langue à essayer en premier : celle imprimée sur la carte si connue, sinon le réglage « Cartes en ».
const langOrder = (preferred) => (preferred === 'en' ? ['en', 'fr'] : ['fr', 'en']);

async function onePiece(d, text, preferred) {
  const tcg = getTcg('onepiece');
  for (const lang of langOrder(preferred)) {
    const rows = await tcg.findCards((r) => r.number === d.code, lang);
    if (rows.length) return rows.map((r) => cand('onepiece', lang, r, 0.9 + 0.1 * (r.id.includes('_') ? 0 : 1), d.code));
  }
  return [];
}

async function riftbound(d, text, preferred) {
  const tcg = getTcg('riftbound');
  for (const lang of langOrder(preferred)) {
    const rows = await tcg.findCards((r) => r.number.toUpperCase().startsWith(d.code.toUpperCase()), lang);
    if (rows.length) return rows.map((r) => cand('riftbound', lang, r, 0.9 + 0.1 * nameScore(r.name, text), d.code));
  }
  return [];
}

async function lorcana(d, text) {
  const tcg = getTcg('lorcana');
  const lang = d.lang === 'fr' ? 'fr' : 'en';
  const rows = await tcg.findCards((r) => String(r.setId) === d.set && r.number === d.number, lang);
  return rows.map((r) => cand('lorcana', lang, r, 1, `${d.number}/${d.total} • ${d.lang.toUpperCase()} • ${d.set}`));
}

async function magic(d, text, preferred) {
  // Les prix sont sur l'impression anglaise : on vise celle-ci, la fiche affichera la version française si elle existe.
  const c = await getJSON(`${SCRYFALL}/cards/${d.set}/${encodeURIComponent(d.number)}`, { allowMissing: true }).catch(() => null);
  if (!c) return [];
  const lang = d.lang === 'fr' || d.lang === 'en' ? d.lang : preferred;
  const image = c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal;
  return [cand('magic', lang, { id: c.id, name: c.name, number: c.collector_number, image, setId: c.set, setName: c.set_name }, 1, d.code)];
}

async function yugioh(d) {
  const tries = [`${d.prefix}-EN${d.num}`, `${d.prefix}-${d.num}`];
  for (const code of tries) {
    const r = await getJSON(`${YGO}/cardsetsinfo.php?setcode=${encodeURIComponent(code)}`, { allowMissing: true }).catch(() => null);
    if (r?.id) {
      return [cand('yugioh', d.lang, {
        id: String(r.id), name: r.name, number: d.code, setId: r.set_name, setName: r.set_name,
        image: `https://images.ygoprodeck.com/images/cards_small/${r.id}.jpg`,
      }, 1, `${d.code} · ${r.set_rarity}`)];
    }
  }
  return [];
}

async function pokemon(d, text, preferred) {
  const tcg = getTcg('pokemon');
  const lang = dataLang(tcg, preferred);
  const total = /^\d+$/.test(d.total) ? parseInt(d.total, 10) : null;
  const sameNumber = (a, b) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? parseInt(a, 10) === parseInt(b, 10) : a.toUpperCase() === b.toUpperCase());
  const sets = (await tcg.getSets(lang)).filter((s) => (total ? s.count === total : true)).slice(0, total ? 12 : 0);
  const out = [];
  for (const s of sets) {
    const cards = await tcg.getCards(s.id, lang).catch(() => []);
    for (const c of cards.filter((c) => sameNumber(String(c.number), d.number))) {
      out.push(cand('pokemon', lang, { ...c, setId: s.id, setName: s.name }, 0.6 + 0.4 * nameScore(c.name, text), `${d.code} · ${s.name}`));
    }
  }
  // Numéro introuvable par le total (ex. cartes secrètes) : recherche par nom + numéro.
  if (!out.length) {
    for (const name of nameCandidates(text.split('\n')).slice(0, 2)) {
      const res = await tcg.searchCards(name, lang).catch(() => []);
      for (const c of res.filter((c) => sameNumber(String(c.number), d.number))) out.push(cand('pokemon', lang, { ...c, setId: c.id.split('-')[0] }, 0.7, `${d.code} · ${name}`));
      if (out.length) break;
    }
  }
  return out;
}

// Dragon Ball Super (Fusion World, Masters) : catalogue anglais sur le téléphone, recherche par numéro exact.
const dragonBall = (tcgId) => async (d, text) => {
  const rows = await getTcg(tcgId).findCards((r) => r.number.toUpperCase() === d.code, 'en');
  return rows.map((r) => cand(tcgId, 'en', r, 0.9 + 0.1 * nameScore(r.name, text), d.code));
};

const BY_GAME = { onepiece: onePiece, riftbound, lorcana, magic, yugioh, pokemon, dbsfw: dragonBall('dbsfw'), dbsmasters: dragonBall('dbsmasters') };

// Dernier recours : le nom seul, dans chaque jeu (moins fiable, l'utilisateur choisit).
async function byName(text, preferred) {
  const out = [];
  for (const name of nameCandidates(text.split('\n')).slice(0, 2)) {
    const c = await getJSON(`${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(name)}`, { allowMissing: true }).catch(() => null);
    if (c?.id) out.push(cand('magic', preferred, { id: c.id, name: c.name, number: c.collector_number, image: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal, setId: c.set, setName: c.set_name }, 0.4 + 0.3 * nameScore(c.name, text), `nom « ${name} »`));
    for (const id of ['pokemon', 'yugioh']) {
      const tcg = getTcg(id);
      const lang = dataLang(tcg, preferred);
      const res = await tcg.searchCards(name, lang).catch(() => []);
      for (const r of res.slice(0, 6)) out.push(cand(id, lang, { ...r, setId: r.setId ?? (id === 'pokemon' ? r.id.split('-')[0] : null) }, 0.3 + 0.4 * nameScore(r.name, text), `nom « ${name} »`));
    }
    // Jeux dont tout le catalogue est sur le téléphone : recherche tolérante aux fautes de lecture.
    // On compare au nom complet et à sa première partie (« Ariel » pour « Ariel - Chanteuse exceptionnelle »).
    for (const id of ['onepiece', 'lorcana', 'riftbound']) {
      const tcg = getTcg(id);
      for (const lang of langOrder(preferred)) {
        // Un nom très court ressemble à beaucoup d'autres : on exige alors une correspondance quasi exacte.
        const minSim = name.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 6 ? 0.95 : 0.72;
        const scored = (await tcg.findCards(() => true, lang))
          .map((r) => ({ r, sim: Math.max(similarity(name, r.name), similarity(name, r.name.split(/ - |, /)[0])) }))
          .filter((x) => x.sim >= minSim)
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 100);
        // Les deux langues sont gardées : la comparaison du texte de la carte (rerankByText) retrouve la bonne.
        const langBonus = lang === preferred ? 0.01 : 0;
        for (const { r, sim } of scored) out.push(cand(id, lang, r, 0.25 + 0.35 * sim + 0.2 * nameScore(r.name, text) + langBonus, `nom « ${name} »`));
      }
    }
  }
  return out;
}

// Plusieurs cartes du même nom (ex. une dizaine de Luffy) : on départage avec le texte de la carte
// (effet, types, caractéristiques) comparé au texte lu. Pour les jeux dont les données sont sur le téléphone.
async function rerankByText(candidates, text) {
  const local = new Set(['onepiece', 'lorcana', 'riftbound']);
  await Promise.all(candidates.filter((c) => local.has(c.tcgId)).slice(0, 250).map(async (c) => {
    try {
      const card = await getTcg(c.tcgId).getCard(c.id, c.setId, c.lang);
      const cardText = [...card.texts.map((t) => t.body), ...card.details.map(([, v]) => v)].join(' ');
      c.score += 0.6 * textOverlap(cardText, text) + (c.id.includes('_') ? 0 : 0.02); // à égalité, la version de base
      // … et l'extension d'origine plutôt qu'une réédition (OP09-119 → extension OP-09).
      if (c.tcgId === 'onepiece' && String(c.setId).replace(/-/g, '').startsWith(String(c.number).split('-')[0])) c.score += 0.03;
    } catch {
      // carte introuvable : score inchangé
    }
  }));
  return candidates;
}

export async function identify(text, preferredLang) {
  const detections = detectCodes(text);
  let candidates = [];
  for (const d of detections) {
    try {
      candidates.push(...(await BY_GAME[d.game](d, text, preferredLang)));
    } catch {
      // source indisponible : on continue avec les autres détections
    }
  }
  if (!candidates.length) candidates = await byName(text, preferredLang);
  // Plusieurs versions possibles (même code ou même nom) : le texte de la carte aide à choisir.
  if (candidates.length > 1) await rerankByText(candidates, text);
  const seen = new Set();
  return {
    detections,
    candidates: candidates
      .sort((a, b) => b.score - a.score)
      .filter((c) => {
        const k = `${c.tcgId}|${c.lang}|${c.id}`;
        return !seen.has(k) && seen.add(k);
      })
      .slice(0, 12),
  };
}
