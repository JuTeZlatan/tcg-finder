// Liste les textes à traduire : arguments de t('…') et plural(n, '…', '…'), plus les libellés rangés dans des tables
// (labels, versions, langues, sources de prix, accroches des jeux, notes…). Sortie : JSON trié sur stdout.
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const req = (m) => require(require.resolve(m, { paths: [root] }));
const parser = req('@babel/parser');
const traverse = req('@babel/traverse').default;

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(js|jsx)$/.test(e.name) ? [path.join(d, e.name)] : []));
const files = walk(path.join(root, 'src')).filter((f) => !f.includes(`${path.sep}translations${path.sep}`));
// Tables dont les valeurs sont traduites à l'affichage.
const TABLE_FILES = ['src/lib/labels.js', 'src/lib/finishes.js', 'src/lib/cardLang.js', 'src/lib/prices.js'];
const TABLE_NAMES = new Set(['SORTS', 'FILTERS', 'MODES', 'FINISH_NAMES', 'LANG_NAMES', 'PRICE_SOURCES', 'CURRENCIES', 'FIELD', 'PRICE', 'VARIANT', 'SOURCE', 'TEXT', 'RARITY']);
const PROP_NAMES = new Set(['tagline', 'charactersLabel', 'characterOrder']);

const keys = new Set();
const lit = (n) => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null);
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type !== 'Identifier') return;
      if (c.name === 't') { const v = lit(p.node.arguments[0]); if (v) keys.add(v); }
      if (c.name === 'plural') for (const a of p.node.arguments.slice(1, 3)) { const v = lit(a); if (v) keys.add(v); }
    },
    VariableDeclarator(p) {
      if (!TABLE_NAMES.has(p.node.id.name) || (!TABLE_FILES.includes(rel) && !rel.startsWith('src/app'))) return;
      p.traverse({
        StringLiteral(s) {
          const par = s.parent;
          if (par.type === 'ObjectProperty' && par.key === s.node) return;
          // [clé, libellé] : seul le libellé (2e élément) est un texte
          if (par.type === 'ArrayExpression' && par.elements.length === 2 && par.elements[0] === s.node) return;
          if (/[A-Za-zÀ-ÿ]/.test(s.node.value)) keys.add(s.node.value);
        },
      });
    },
    ObjectProperty(p) {
      const k = p.node.key.name ?? p.node.key.value;
      if (PROP_NAMES.has(k)) { const v = lit(p.node.value); if (v) keys.add(v); }
      // notes par langue de cartes : note: { fr: '…', ja: '…' } ou tcg.note = { … }
      if (k === 'note' && p.node.value.type === 'ObjectExpression') for (const q of p.node.value.properties) { const v = lit(q.value); if (v) keys.add(v); }
    },
    AssignmentExpression(p) {
      const l = p.node.left;
      if (l.type === 'MemberExpression' && l.property.name === 'note' && p.node.right.type === 'ObjectExpression') {
        for (const q of p.node.right.properties) { const v = lit(q.value); if (v) keys.add(v); }
      }
    },
  });
}
// textes sans lettres (×, A → Z…) : rien à traduire
const out = [...keys].filter((k) => /[A-Za-zÀ-ÿ]{2}/.test(k)).sort((a, b) => a.localeCompare(b, 'fr'));
process.stdout.write(JSON.stringify(out, null, 1));
