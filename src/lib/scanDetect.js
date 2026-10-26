// Détection des codes imprimés sur une carte à partir du texte lu par l'OCR (fonction pure, sans réseau).
// Chaque jeu a un format reconnaissable, ce qui permet de deviner le jeu sans le demander :
//   One Piece  OP09-119, ST15-001, EB01-012, PRB02-005, P-001
//   Riftbound  OGN-030/298
//   Lorcana    204/204 • FR • 1
//   Magic      0163 FDN • FR (et « U 0163 ») — ou 163/281 U, FDN • EN (2016-2022)
//   Yu-Gi-Oh!  LOB-FR001, MP24-EN123
//   Pokémon    004/084, TG05/TG30, SV001/SV122

// L'OCR confond souvent lettres et chiffres dans les numéros.
const toDigits = (s) => s.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/B/g, '8');
const D = '[0-9OQDILZSB]'; // « chiffre » tolérant

export function normalizeOcr(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[•·∙●◆*]/g, '•')
    .replace(/[–—−]/g, '-')
    .replace(/[ \t]+/g, ' ');
}

const POKEMON_PREFIXES = new Set(['TG', 'GG', 'SV', 'RC', 'SH', 'H', 'SWSH', 'SM', 'XY', 'BW', 'DP']);
const RIFT_SETS ='OGN|OGS|SFD|UNL|VEN|RAD|ARC|JDG|OPP|PR';
const YGO_LANGS = { EN: 'en', E: 'en', FR: 'fr', F: 'fr' };
const MAGIC_LANGS = new Set(['EN', 'FR', 'DE', 'IT', 'ES', 'PT', 'JA', 'KO', 'RU', 'ZHS', 'ZHT', 'PH']);

export function detectCodes(rawText) {
  const t = normalizeOcr(rawText);
  const found = [];
  const add = (d) => { if (!found.some((f) => f.game === d.game && f.code === d.code)) found.push(d); };

  // One Piece
  for (const m of t.matchAll(new RegExp(`\\b(OP|ST|EB|PRB)\\s?(${D}{2})\\s?-\\s?(${D}{3})\\b`, 'g'))) {
    add({ game: 'onepiece', code: `${m[1]}${toDigits(m[2])}-${toDigits(m[3])}` });
  }
  for (const m of t.matchAll(new RegExp(`\\bP\\s?-\\s?(${D}{3})\\b`, 'g'))) add({ game: 'onepiece', code: `P-${toDigits(m[1])}` });

  // Dragon Ball Super Fusion World : FB01-001, FS01-01, SB01-001, FP01-001
  for (const m of t.matchAll(new RegExp(`\\b(FB|FS|SB|FP)\\s?(${D}{2})\\s?-\\s?(${D}{2,3})\\b`, 'g'))) {
    add({ game: 'dbsfw', code: `${m[1]}${toDigits(m[2])}-${toDigits(m[3])}` });
  }
  // Dragon Ball Super Masters : BT1-001, TB1-001, SD1-01, EX01-01, DB1-001, XD1-01
  for (const m of t.matchAll(new RegExp(`\\b(BT|TB|SD|EX|DB|XD|BE)\\s?(${D}{1,2})\\s?-\\s?(${D}{2,3})\\b`, 'g'))) {
    add({ game: 'dbsmasters', code: `${m[1]}${toDigits(m[2])}-${toDigits(m[3])}` });
  }

  // Riftbound
  for (const m of t.matchAll(new RegExp(`\\b(${RIFT_SETS})\\s?-\\s?(${D}{3}[A-Z]?)\\s?\\/\\s?(${D}{3})\\b`, 'g'))) {
    const num = toDigits(m[2].slice(0, 3)) + m[2].slice(3).toLowerCase();
    add({ game: 'riftbound', set: m[1], code: `${m[1]}-${num}`, total: toDigits(m[3]) });
  }

  // Lorcana : numéro/total • langue • extension
  for (const m of t.matchAll(new RegExp(`\\b(${D}{1,3})\\s?\\/\\s?(${D}{2,3})\\s*[•.\\-]\\s*(EN|FR|DE|IT|ES|JA|ZH)\\s*[•.\\-]\\s*(${D}{1,2}|Q${D})\\b`, 'g'))) {
    const set = m[4].startsWith('Q') ? `Q${toDigits(m[4].slice(1))}` : String(parseInt(toDigits(m[4]), 10));
    add({ game: 'lorcana', number: String(parseInt(toDigits(m[1]), 10)), total: toDigits(m[2]), lang: m[3].toLowerCase(), set, code: `${parseInt(toDigits(m[1]), 10)}/${set}` });
  }
  const isLorcana = found.some((f) => f.game === 'lorcana');

  // Magic : code d'extension (au moins une lettre) • langue, + numéro de collection
  if (!isLorcana) {
    const setLang = [...t.matchAll(/\b([A-Z0-9]{3,5})\s*[•.\-]\s*(EN|FR|DE|IT|ES|PT|JA|KO|RU|ZHS|ZHT|PH)\b/g)]
      .find((m) => /[A-Z]/.test(m[1]) && MAGIC_LANGS.has(m[2]));
    if (setLang) {
      const num =
        t.match(new RegExp(`\\b[CURMSLTP]\\s?(${D}{3,4})\\b`))?.[1] ||
        t.match(new RegExp(`\\b(${D}{1,4})\\s?\\/\\s?${D}{2,4}\\s+[CURMSLTP]\\b`))?.[1] ||
        t.match(/\b(\d{3,4})\b/)?.[1];
      if (num) {
        const number = String(parseInt(toDigits(num), 10));
        add({ game: 'magic', set: setLang[1].toLowerCase(), number, lang: setLang[2].toLowerCase(), code: `${setLang[1]} ${number}` });
      }
    }
  }

  // Yu-Gi-Oh! (ignoré si un code One Piece / Riftbound a déjà été trouvé : formats voisins)
  if (!found.some((f) => ['onepiece', 'riftbound', 'dbsfw', 'dbsmasters'].includes(f.game))) {
    for (const m of t.matchAll(new RegExp(`\\b([A-Z0-9]{2,5})-(EN|FR|DE|IT|PT|SP|JP|KR|E|F|G|I|S|P)?(${D}{3})\\b`, 'g'))) {
      if (!/[A-Z]/.test(m[1]) || /^(OP|ST|EB|PRB)\d*$/.test(m[1])) continue;
      const langCode = m[2] || '';
      add({ game: 'yugioh', prefix: m[1], num: toDigits(m[3]), lang: YGO_LANGS[langCode] || 'en', code: `${m[1]}-${langCode}${toDigits(m[3])}` });
    }
  }

  // Pokémon : numéro/total (si aucun format plus précis n'a été trouvé)
  if (!found.some((f) => ['lorcana', 'riftbound', 'magic'].includes(f.game))) {
    for (const m of t.matchAll(new RegExp(`\\b([A-Z]{0,3}${D}{1,3})\\s?\\/\\s?([A-Z]{0,3}${D}{2,3})\\b`, 'g'))) {
      // Préfixe de lettres seulement s'il existe chez Pokémon (TG05, SV001…) ; sinon « O04 » est un « 004 » mal lu.
      const fix = (s) => {
        const [, p, n] = s.match(/^([A-Z]*)(.*)$/);
        return POKEMON_PREFIXES.has(p) ? p + toDigits(n) : toDigits(s);
      };
      const number = fix(m[1]);
      const total = fix(m[2]);
      const numericTotal = /^\d+$/.test(total) ? parseInt(total, 10) : null;
      if (numericTotal && numericTotal < 10) continue; // ex. « 1/2 » dans un texte
      add({ game: 'pokemon', number, total, code: `${number}/${total}` });
    }
  }
  return found;
}

// Lignes susceptibles d'être le nom de la carte (en haut, surtout des lettres).
export function nameCandidates(lines) {
  return lines
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 40 && /[A-Za-zÀ-ÿ]{3}/.test(l) && !/\d{2,}/.test(l))
    // Filigrane des images officielles One Piece (« SAMPLE », souvent mal lu : SAMPIE, SAMPLF…)
    .filter((l) => similarity(l, 'SAMPLE') < 0.6)
    // Types de carte imprimés (« SPELL », « LEADER »…) : ce ne sont pas des noms.
    .filter((l) => !CARD_TYPE_WORDS.has(fold(l)))
    .slice(0, 4);
}

const CARD_TYPE_WORDS = new Set([
  'spell', 'unit', 'gear', 'rune', 'legend', 'battlefield', 'champion', 'leader', 'character', 'event', 'stage',
  'personnage', 'evenement', 'lieu', 'instant', 'sorcery', 'creature', 'artifact', 'enchantment', 'land', 'planeswalker',
  'ephemere', 'rituel', 'trainer', 'dresseur', 'supporter', 'item', 'objet', 'energy', 'energie', 'action', 'chanson',
  'song', 'location', 'basic', 'base', 'niveau', 'stage', 'pokemon', 'spell card', 'trap card', 'carte magie', 'carte piege',
]);

// Part des mots significatifs d'un texte de carte (effet, types…) retrouvés dans le texte lu.
// Sert à départager plusieurs cartes de même nom (ex. les nombreuses versions de Luffy).
export function textOverlap(cardText, ocrText) {
  const words = [...new Set(fold(cardText).split(' ').filter((w) => w.length >= 5))];
  if (words.length < 3) return 0;
  const text = ` ${fold(ocrText)} `;
  return words.filter((w) => text.includes(w)).length / words.length;
}

// Similarité de deux textes (coefficient de Dice sur les paires de lettres) : tolère les fautes de lecture
// de l'OCR (« Lufiy » ≈ « Luffy »). 1 = identiques, 0 = rien en commun.
export function similarity(a, b) {
  const pairs = (s) => {
    const f = fold(s).replace(/ /g, '');
    const out = new Map();
    for (let i = 0; i < f.length - 1; i++) {
      const p = f.slice(i, i + 2);
      out.set(p, (out.get(p) || 0) + 1);
    }
    return out;
  };
  const pa = pairs(a);
  const pb = pairs(b);
  let inter = 0;
  let total = 0;
  for (const n of pa.values()) total += n;
  for (const [p, n] of pb) {
    total += n;
    inter += Math.min(n, pa.get(p) || 0);
  }
  return total ? (2 * inter) / total : 0;
}

const fold =(s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Part des mots du nom de la carte présents dans le texte lu (0 → 1).
export function nameScore(cardName, ocrText) {
  const words = fold(cardName).split(' ').filter((w) => w.length >= 3);
  if (!words.length) return 0;
  const text = ` ${fold(ocrText)} `;
  return words.filter((w) => text.includes(` ${w} `) || text.includes(w)).length / words.length;
}
