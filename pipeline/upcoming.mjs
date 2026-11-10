// Sorties des extensions (onglet « Sorties » de l'appli) : extensions annoncées par TCGplayer (qui les liste souvent
// des mois avant, pour les précommandes) et par Scryfall pour Magic, des 30 derniers jours aux 6 prochains mois.
// Sortie : pipeline/out/upcoming.json = [{ tcg, name, date, code, image }], de la plus ancienne à la plus lointaine.
import { getJSON, groupImage, tcgcsvGroups, writeJSON } from './lib.mjs';

// Naruto Mythos : absent de TCGplayer (sa catégorie « Naruto Card Game » est un autre jeu) → annonces officielles ci-dessous.
const CATEGORIES = { pokemon: 3, yugioh: 2, onepiece: 68, lorcana: 71, riftbound: 89, dbsfw: 80, dbsmasters: 27, swu: 79, cyberpunk: 92 };
// Sorties annoncées sur le site officiel d'un jeu absent de TCGplayer. Date précise inconnue : `approx` (texte affiché
// à la place de la date, ex. « Début 2027 ») et `date` = début de la période, pour le classement. À mettre à jour à
// chaque annonce (source : actualités du site officiel).
const OFFICIAL_ANNOUNCED = [
  // https://www.narutotcgmythos.com/news — « Set 3 Akatsuki », sortie mondiale « Early 2027 » (annonce du 27 mai 2026)
  { tcg: 'naruto', name: 'Set 3 – Akatsuki', date: '2027-01-01', approx: 'Début 2027', code: 'S3', image: null },
];
// Magic : vraies extensions seulement (pas les cartes d'art, jetons, promos…).
const MAGIC_TYPES = new Set(['expansion', 'core', 'masters', 'commander', 'draft_innovation', 'starter', 'duel_deck', 'from_the_vault', 'premium_deck', 'spellbook', 'arsenal', 'box']);
const PAST_DAYS = 30;
const HORIZON_DAYS = 183;
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export async function build(outDir) {
  console.log('Sorties des extensions…');
  const from = day(-PAST_DAYS);
  const until = day(HORIZON_DAYS);
  const inRange = (date) => date >= from && date <= until;
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
      out.push({ tcg, name: g.name, date, code: g.abbreviation || null, image });
    }
  }
  // Magic : Scryfall (plus complet que TCGplayer), sans les extensions numériques, jetons et lots d'une carte.
  for (const s of (await getJSON('https://api.scryfall.com/sets')).data) {
    if (inRange(s.released_at) && !s.digital && MAGIC_TYPES.has(s.set_type) && s.card_count > 5) {
      out.push({ tcg: 'magic', name: s.name, date: s.released_at, code: s.code.toUpperCase(), image: s.icon_svg_uri, imageTint: true });
    }
  }
  // Pokémon : extensions japonaises annoncées sur le site officiel japonais (elles sortent 2 à 3 mois avant les
  // internationales, que TCGplayer ne liste qu'au dernier moment). Marquées « Japon » dans l'appli.
  const jp = await getJSON('https://www.pokemon-card.com/products/topList.php').catch(() => null);
  for (const p of jp?.products || []) {
    if (p.productType !== '拡張パック') continue;
    const m = String(p.releaseDate).match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (!m) continue;
    const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if (!inRange(date)) continue;
    const name = p.productTitle.match(/「(.+)」/)?.[1] || p.productTitle;
    const code = p.link_detailPage?.match(/\/ex\/([a-z0-9]+)\/?$/i)?.[1]?.toUpperCase() || null;
    if (out.some((u) => u.tcg === 'pokemon' && u.region === 'JP' && u.name === name)) continue;
    out.push({ tcg: 'pokemon', name, date, code, region: 'JP', image: p.tumbsImg ? `https://www.pokemon-card.com${p.tumbsImg}` : null });
  }
  // Annonces officielles, tant qu'elles ne sont pas passées depuis plus de 30 jours.
  for (const r of OFFICIAL_ANNOUNCED) if (r.date >= from) out.push(r);
  out.sort((a, b) => a.date.localeCompare(b.date) || a.tcg.localeCompare(b.tcg));
  await writeJSON(`${outDir}/upcoming.json`, out);
  console.log(`  ${out.filter((u) => u.date > day(0)).length} sorties annoncées, ${out.filter((u) => u.date <= day(0)).length} sorties récentes`);
}
