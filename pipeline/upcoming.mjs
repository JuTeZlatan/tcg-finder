// Sorties des extensions (onglet « Sorties » de l'appli), des 30 derniers jours aux 13 prochains mois.
// Sources : TCGplayer (toutes les extensions mises en précommande, nom anglais), Scryfall pour Magic, et les sites
// officiels des éditeurs et références des communautés (upcomingSources.mjs) : annonces plus précoces, nom officiel et
// date de sortie dans chaque langue. Une même extension vue par plusieurs sources est rapprochée par son code, sinon
// par son nom anglais ; une annonce officielle absente de TCGplayer est ajoutée.
// Sortie : pipeline/out/upcoming.json = [{ tcg, name (anglais), names: { langue: nom }, date, dates: { langue: date },
// code, image, region?, approx?, sources }], de la plus ancienne à la plus lointaine.
import { getJSON, groupImage, similarity, tcgcsvGroups, writeJSON } from './lib.mjs';
import { codeKey, nameKey, officialReleases } from './upcomingSources.mjs';

// Naruto Mythos : absent de TCGplayer (sa catégorie « Naruto Card Game » est un autre jeu) → annonces officielles.
const CATEGORIES = { pokemon: 3, yugioh: 2, onepiece: 68, lorcana: 71, riftbound: 89, dbsfw: 80, dbsmasters: 27, swu: 79, cyberpunk: 92 };
// Magic : vraies extensions seulement (pas les cartes d'art, jetons, promos…).
const MAGIC_TYPES = new Set(['expansion', 'core', 'masters', 'commander', 'draft_innovation', 'starter', 'duel_deck', 'from_the_vault', 'premium_deck', 'spellbook', 'arsenal', 'box']);
const PAST_DAYS = 30;
const HORIZON_DAYS = 400; // les éditeurs annoncent jusqu'à un an à l'avance
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// Annonce officielle ↔ sortie TCGplayer / Scryfall : même jeu et même région, même code, sinon même nom anglais
// (ou presque : « Star Trek » n'est pas « Star Trek Commander »), à moins de 5 mois d'écart (un nom réutilisé des années plus tard n'est pas la même extension).
function matches(o, r) {
  if (o.tcg !== r.tcg || (o.region || null) !== (r.region || null)) return false;
  const od = o.dates?.en || Object.values(o.dates || {})[0];
  if (od && r.date && Math.abs(Date.parse(od) - Date.parse(r.date)) > 150 * 86400000) return false;
  if (o.code && r.code && codeKey(o.code) === codeKey(r.code)) return true;
  const en = o.names?.en;
  if (!en) return false;
  const a = nameKey(en);
  const b = nameKey(r.name);
  return !!a && (a === b || similarity(en, r.name) >= 0.86);
}

export async function build(outDir) {
  console.log('Sorties des extensions…');
  const from = day(-PAST_DAYS);
  const until = day(HORIZON_DAYS);
  const inRange = (date) => !!date && date >= from && date <= until;
  const out = [];
  for (const [tcg, categoryId] of Object.entries(CATEGORIES)) {
    const groups = await tcgcsvGroups(categoryId);
    // TCGplayer redate parfois de vieilles extensions (POP Series de 2005 « publiée » aujourd'hui) : on ne garde que les
    // groupes créés récemment, c.-à-d. dont le numéro (croissant à la création) dépasse 95 % de ceux des extensions
    // sorties il y a plus d'un an.
    const oldIds = groups.filter((g) => (g.publishedOn || '').slice(0, 10) < day(-365)).map((g) => g.groupId).sort((a, b) => a - b);
    const cutoff = oldIds.length ? oldIds[Math.floor(oldIds.length * 0.95)] : 0;
    for (const g of groups) {
      const date = (g.publishedOn || '').slice(0, 10);
      if (!inRange(date) || g.groupId <= cutoff) continue;
      // Visuel : image du booster (ou du produit scellé) chez TCGplayer, quand elle existe déjà.
      const image = (await groupImage(categoryId, g.groupId).catch(() => null)) || null;
      out.push({ tcg, name: g.name, date, code: g.abbreviation || null, image, sources: ['TCGplayer'] });
    }
  }
  // Magic : Scryfall (plus complet que TCGplayer), sans les extensions numériques, jetons et lots d'une carte.
  for (const s of (await getJSON('https://api.scryfall.com/sets')).data) {
    if (inRange(s.released_at) && !s.digital && MAGIC_TYPES.has(s.set_type) && s.card_count > 5) {
      out.push({ tcg: 'magic', name: s.name, date: s.released_at, code: s.code.toUpperCase(), image: s.icon_svg_uri, imageTint: true, sources: ['Scryfall'] });
    }
  }

  // Sites officiels et références : noms et dates par langue des sorties déjà listées, et annonces en plus.
  const official = await officialReleases();
  let named = 0;
  let added = 0;
  for (const o of official) {
    const found = out.filter((r) => matches(o, r));
    for (const r of found) {
      r.names = { ...o.names, ...(r.names || {}) };
      r.names.en ||= r.name;
      r.dates = { ...(r.dates || {}), ...o.dates };
      if (o.image && !r.image) r.image = o.image;
      if (o.approx) r.approx = o.approx;
      if (o.source && !r.sources.includes(o.source)) r.sources.push(o.source);
    }
    if (found.length) {
      named++;
      continue;
    }
    // Annonce absente de TCGplayer / Scryfall : ajoutée si sa date (anglaise, sinon la première connue) est dans la fenêtre.
    const date = o.dates?.en || Object.values(o.dates || {}).sort()[0];
    if (!inRange(date) && !(o.approx && date >= from)) continue;
    const name = o.names.en || o.names.fr || Object.values(o.names)[0];
    out.push({ tcg: o.tcg, name, names: o.names, date, dates: o.dates, code: o.code || null, image: o.image || null, region: o.region, approx: o.approx, sources: [o.source] });
    added++;
  }
  // Date principale : celle de TCGplayer / Scryfall, sinon la date anglaise officielle.
  for (const r of out) if (!r.date) r.date = r.dates?.en || Object.values(r.dates || {}).sort()[0];
  out.sort((a, b) => a.date.localeCompare(b.date) || a.tcg.localeCompare(b.tcg));
  await writeJSON(`${outDir}/upcoming.json`, out);
  console.log(`  sorties : ${named} annonces officielles rapprochées, ${added} ajoutées (absentes de TCGplayer)`);
  console.log(`  ${out.filter((u) => u.date > day(0)).length} sorties annoncées, ${out.filter((u) => u.date <= day(0)).length} sorties récentes`);
}
