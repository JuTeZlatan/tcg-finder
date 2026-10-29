// Ordre des cartes d'une extension d'après leur numéro, quel qu'en soit le format :
// « OP18-060 », « 086/166 », « RAD-SP1/005 », « PR-159A/298 », « 041a/166 », « TG01 », « 216 », « TB3-047 »…
// Les cartes de l'extension elle-même (préfixe le plus courant) d'abord, puis les rééditions d'autres extensions
// (deck de démarrage, promos) groupées par préfixe ; numéros normaux avant les numéros spéciaux (SP1, T03) ;
// cartes sans numéro à la fin.

// « RAD-SP1/005 » → { prefix: 'RAD', num: Infinity, rest: 'SP1' } ; « 041a/166 » → { prefix: '', num: 41, rest: 'a' }.
export function parseNumber(number) {
  const s = String(number ?? '').trim().replace(/\/\s*\d+\s*$/, ''); // sans le total « /166 »
  if (!s) return null;
  const dash = s.lastIndexOf('-');
  let prefix = dash > 0 ? s.slice(0, dash) : '';
  let main = dash > 0 ? s.slice(dash + 1) : s;
  // Lettres collées au numéro (« TG01 », « SV001 », « LOB-EN001 », « RAD-SP1 », « SFD-T03 ») : rattachées au préfixe,
  // ce qui range les séries spéciales (galerie, SP, jetons) après la série principale.
  const glued = main.match(/^([A-Za-z]+)(\d+)([A-Za-z]*)$/);
  if (glued) {
    prefix = prefix ? `${prefix}-${glued[1]}` : glued[1];
    main = glued[2] + glued[3];
  }
  const m = main.match(/^(\d+)(.*)$/);
  return { prefix: prefix.toUpperCase(), num: m ? Number(m[1]) : Infinity, rest: m ? m[2] : main };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Préfixe de l'extension elle-même : celui qui reprend son code (« ST-28 » → ST28), sinon le plus courant.
export function mainPrefix(numbers, setId) {
  const code = String(setId ?? '').replace(/^tcg-/i, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const counts = new Map();
  for (const n of numbers) {
    const p = parseNumber(n);
    if (p) counts.set(p.prefix, (counts.get(p.prefix) || 0) + 1);
  }
  if (code && counts.has(code)) return code;
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

// Trie une liste de cartes (copie) ; `numberOf` lit le numéro d'une carte, `setId` aide à reconnaître ses propres numéros.
export function sortByNumber(cards, numberOf = (c) => c.number, setId = null) {
  const own = mainPrefix(cards.map(numberOf), setId);
  const keyed = cards.map((c, i) => ({ c, i, p: parseNumber(numberOf(c)) }));
  keyed.sort((a, b) => {
    if (!a.p || !b.p) return (!a.p - !b.p) || a.i - b.i;
    return ((a.p.prefix !== own) - (b.p.prefix !== own))
      || collator.compare(a.p.prefix, b.p.prefix)
      || a.p.num - b.p.num
      || (a.p.num === Infinity ? collator.compare(a.p.rest, b.p.rest) : 0)
      || collator.compare(a.p.rest, b.p.rest)
      || a.i - b.i; // même numéro (versions) : ordre d'origine
  });
  return keyed.map((k) => k.c);
}
