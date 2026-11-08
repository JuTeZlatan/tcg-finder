// Dragon Ball Super Card Game : Fusion World (2024+) et Masters (2017-2024), deux jeux distincts.
// Catalogue et prix TCGplayer via TCGCSV, prix Cardmarket via ses fichiers publics (jeu 13 : « Dragon Ball Super »).
// Fusion World existe aussi en japonais : noms et images du site officiel japonais, reliés aux cartes anglaises par
// leur code (mêmes prix). Masters n'existe qu'en anglais.
import { normName, getText, sleep, writeTcg } from './lib.mjs';
import { buildTcgcsvGame } from './tcgcsvGame.mjs';

const CARDMARKET_GAME = 13;
const cmUrl = (name) => `https://www.cardmarket.com/fr/DragonBallSuper/Products/Search?searchString=${encodeURIComponent(name)}`;

// « Son Goku // Son Goku (FB11-001) [Fusion World] » → « FB11-001 »
const fwCode = (s) => s.match(/\(([A-Z]{2,4}\d{0,2}-\d{2,3})\)/)?.[1];
// Masters : par nom, sans les mentions entre parenthèses / crochets ni le code TCGplayer.
const mastersName = (s) => normName(s.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').replace(/\s+-\s+[A-Z0-9_]+-[A-Z0-9]+$/i, ''));

const FW_SITE = 'https://www.dbs-cardgame.com/fw';
const FW_LISTS = { en: `${FW_SITE}/en/cardlist/`, ja: `${FW_SITE}/jp/cardlist/` };
const FW_IMAGES = { en: `${FW_SITE}/images/cards/card/en/`, ja: `${FW_SITE}/images/cards/card/jp/` };

// Cartes du site officiel (anglais ou japonais) : code → [{ name, image, variant }] (« _p1 », « _p2 » : versions
// alternatives).
async function fwOfficial(lang) {
  const FW_JP = FW_LISTS[lang];
  const home = await getText(FW_JP);
  const categories = [...home.matchAll(/data-val="(\d+)"/g)].map((m) => m[1]);
  const byCode = new Map();
  for (const cat of categories) {
    const html = await getText(`${FW_JP}?search=true&category%5B%5D=${cat}`);
    await sleep(400);
    for (const m of html.matchAll(/data-src="detail\.php\?card_no=([A-Z0-9-]+)(?:&p=(_p\d+))?"[^>]*>\s*<img[^>]*data-src="[^"]*\/(?:jp|en)\/([^"]+)"[^>]*alt="[A-Z0-9-]+ ([^"]*)"/g)) {
      const [, code, variant = '', file, name] = m;
      if (!byCode.has(code)) byCode.set(code, []);
      const list = byCode.get(code);
      if (!list.some((x) => x.variant === variant)) list.push({ name: name.trim(), image: FW_IMAGES[lang] + file, variant });
    }
  }
  for (const list of byCode.values()) list.sort((a, b) => a.variant.localeCompare(b.variant, undefined, { numeric: true }));
  return byCode;
}

// Version japonaise : chaque carte anglaise prend le nom et l'image japonais de même code ; une carte anglaise marquée
// (Alternate Art, SPR…) prend la n-ième version alternative japonaise, dans l'ordre des numéros TCGplayer.
// Cartes du site officiel absentes de TCGplayer (ex. FB10-067) : ajoutées à leur extension (même préfixe de code), sans
// prix, pour que chaque extension soit complète.
function addOfficialMissing(sets, official, lang) {
  const known = new Set(sets.flatMap((s) => s.cards.map((c) => String(c.number).toUpperCase())));
  const setOf = (code) => sets.find((s) => s.cards.some((c) => String(c.number).toUpperCase().startsWith(`${code.split('-')[0]}-`)));
  let added = 0;
  for (const [code, list] of official) {
    if (known.has(code)) continue;
    const set = setOf(code);
    if (!set) continue;
    const base = list.find((x) => !x.variant) || list[0];
    set.cards.push({
      id: `fw-${code}`, name: base.name, number: code, image: base.image, thumb: base.image,
      details: [['set', set.name], ['number', code]], texts: [], prices: [],
      links: [{ label: 'Dragon Ball Super Card Game', url: `${FW_LISTS[lang]}?search=true&q=${code}` }],
    });
    added++;
  }
  for (const s of sets) s.cards.sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
  if (added) console.log(`  dbsfw/${lang} : ${added} carte(s) du site officiel absentes de TCGplayer ajoutées`);
  return added;
}

async function writeFusionWorldJapanese(outDir, sets) {
  const jp = await fwOfficial('ja');
  let matched = 0;
  const jaSets = sets.map((set) => {
    const altRank = new Map();
    const cards = set.cards.map((card) => {
      const list = jp.get(String(card.number).toUpperCase());
      if (!list?.length) return { ...card };
      const alt = /\(/.test(card.name);
      let pick = list[0];
      if (alt) {
        const n = (altRank.get(card.number) || 0) + 1;
        altRank.set(card.number, n);
        pick = list.filter((x) => x.variant)[n - 1] || list[list.length - 1];
      }
      matched++;
      const tag = card.name.match(/\s*\([^)]*\)\s*$/)?.[0] || '';
      return { ...card, name: `${pick.name}${tag}`, nameEn: card.name, image: pick.image, thumb: pick.image };
    });
    return { ...set, cards };
  });
  const total = sets.reduce((n, s) => n + s.cards.length, 0);
  console.log(`  dbsfw/ja : ${matched}/${total} cartes avec leur version japonaise officielle`);
  await writeTcg(outDir, 'dbsfw', 'ja', jaSets);
}

export async function build(outDir) {
  const fwSets = await buildTcgcsvGame(outDir, {
    id: 'dbsfw',
    label: 'Dragon Ball Super Fusion World',
    categoryId: 80,
    cardmarketGame: CARDMARKET_GAME,
    cmKey: (p) => (/\[Fusion World\]/i.test(p.name) ? fwCode(p.name) : null),
    cardKey: (p) => p.number.toUpperCase(),
    cmUrl: (name, number) => cmUrl(number),
  });
  // Anglais complété avec la liste officielle (cartes absentes de TCGplayer), puis le japonais.
  const en = await fwOfficial('en').catch((e) => { console.error(`✗ dbsfw liste officielle : ${e.message}`); return null; });
  if (en && addOfficialMissing(fwSets, en, 'en')) await writeTcg(outDir, 'dbsfw', 'en', fwSets);
  await writeFusionWorldJapanese(outDir, fwSets).catch((e) => console.error(`✗ dbsfw/ja : ${e.message}`));
  await buildTcgcsvGame(outDir, {
    id: 'dbsmasters',
    label: 'Dragon Ball Super Masters',
    categoryId: 27,
    cardmarketGame: CARDMARKET_GAME,
    cmKey: (p) => (/\[Fusion World\]/i.test(p.name) ? null : mastersName(p.name)),
    cardKey: (p) => mastersName(p.name),
    cmUrl,
  });
}
