// Fait passer les textes affichés par t('…') en gardant la mise en forme du code (remplacements à la position exacte).
// Usage : node i18n-wrap.cjs <projet> <fichier>... [--dry]
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const dry = process.argv.includes('--dry');
const files = process.argv.slice(3).filter((a) => a !== '--dry');
const req = (m) => require(require.resolve(m, { paths: [root] }));
const parser = req('@babel/parser');
const traverse = req('@babel/traverse').default;

const FRENCH_CHARS = /[à-ÿÀ-ß’]/;
function isFrench(s) {
  const v = s.trim();
  if (!/[a-zà-ÿ]/.test(v)) return false;
  if (/^https?:|^\/|\.(png|jpe?g|json|svg)$/.test(v)) return false;
  if (/^[a-z0-9_.:|/-]+$/i.test(v) && !FRENCH_CHARS.test(v) && !/^[A-ZÀ-Ý][a-zà-ÿ]/.test(v)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(v)) return false; // identifiants (camelCase)
  return /\s/.test(v) || FRENCH_CHARS.test(v) || /^[A-ZÀ-Ý][a-zà-ÿ]/.test(v);
}
const ATTR_DENY = new Set(['name', 'style', 'pathname', 'testID', 'keyboardType', 'autoComplete', 'autoCapitalize', 'contentFit', 'color', 'mode', 'key', 'href', 'textContentType', 'returnKeyType', 'icon', 'source', 'tcg', 'lang', 'id', 'nativeID', 'size', 'facing']);
const PROP_DENY = new Set(['pathname', 'name', 'type', 'id', 'key', 'mediaTypes', 'source', 'tcg', 'setId', 'cardId', 'lang', 'finish', 'variant', 'kind', 'state', 'mode', 'tab', 'sort', 'order', 'icon', 'currency', 'priceSource', 'setView', 'facing', 'fontWeight', 'textTransform', 'textAlign', 'fontStyle', 'alignItems', 'justifyContent', 'flexDirection', 'flexWrap', 'position', 'overflow', 'contentFit', 'style']);
const CALL_DENY = new Set(['t', 'plural', 'require', 'getItem', 'setItem', 'removeItem', 'includes', 'startsWith', 'endsWith', 'split', 'replace', 'join', 'getJSON', 'fetch', 'loadData', 'useState', 'indexOf', 'match', 'test', 'Directory', 'File', 'StyleSheet', 'encodeURIComponent', 'push', 'navigate', 'setFilter', 'setTab', 'setMode', 'setSort', 'get', 'has', 'set', 'delete', 'filter', 'find', 'padStart', 'toLocaleDateString', 'toLocaleString', 'toLocaleTimeString', 'NumberFormat']);

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

for (const rel of files) {
  const file = path.join(root, rel);
  const src = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const edits = []; // [start, end, text]
  const topLevel = [];
  let usesT = false;

  // Variables nommées « t » (ex. TCGS.map((t) => …)) : renommées pour ne pas masquer la fonction de traduction.
  traverse(ast, {
    Scope(p) {
      const b = p.scope.bindings.t;
      if (!b || b.kind === 'module' || b.__done) return;
      b.__done = true;
      edits.push([b.identifier.start, b.identifier.end, 'tg']);
      for (const r of b.referencePaths) {
        // raccourci { t } dans un objet : { t: tg }
        if (r.parent.type === 'ObjectProperty' && r.parent.shorthand) edits.push([r.node.start, r.node.end, 't: tg']);
        else edits.push([r.node.start, r.node.end, 'tg']);
      }
    },
  });

  const inFunction = (p) => !!p.getFunctionParent();
  const excluded = (p) => {
    const par = p.parent;
    switch (par.type) {
      case 'ImportDeclaration': case 'ExportNamedDeclaration': case 'ExportAllDeclaration': case 'SwitchCase':
      case 'TaggedTemplateExpression': case 'MemberExpression': case 'OptionalMemberExpression':
        return true;
      case 'BinaryExpression': return ['===', '!==', '==', '!=', 'in'].includes(par.operator);
      case 'ObjectProperty':
        if (par.key === p.node) return true;
        return PROP_DENY.has(par.key.name ?? par.key.value);
      case 'JSXAttribute': return ATTR_DENY.has(par.name.name);
      case 'CallExpression': case 'NewExpression': case 'OptionalCallExpression': {
        const c = par.callee;
        const n = c.type === 'Identifier' ? c.name : c.property?.name;
        if (CALL_DENY.has(n)) return true;
        if (c.type === 'MemberExpression' && c.object.name === 'console') return true;
        return false;
      }
      default: return false;
    }
  };

  traverse(ast, {
    JSXText(p) {
      const raw = p.node.value;
      if (!/[A-Za-zÀ-ÿ]/.test(raw)) return;
      const lead = raw.length - raw.trimStart().length;
      const trail = raw.length - raw.trimEnd().length;
      const text = raw.trim().replace(/\s*\n\s*/g, ' ');
      if (!isFrench(text) && !/^[A-Za-zÀ-ÿ]/.test(text)) return;
      // garde les espaces significatifs collés à une expression voisine (« … : {x} »)
      const keepLead = lead && !raw.slice(0, lead).includes('\n') ? raw.slice(0, lead) : '';
      const keepTrail = trail && !raw.slice(raw.length - trail).includes('\n') ? raw.slice(raw.length - trail) : '';
      edits.push([p.node.start + lead - keepLead.length, p.node.end - trail + keepTrail.length,
        `${keepLead ? `{${q(keepLead)}}` : ''}{t(${q(text)})}${keepTrail ? `{${q(keepTrail)}}` : ''}`]);
      usesT = true;
    },
    StringLiteral(p) {
      const v = p.node.value;
      if (!isFrench(v) || excluded(p)) return;
      if (!inFunction(p)) { topLevel.push(v); return; }
      const wrapped = `t(${q(v)})`;
      edits.push([p.node.start, p.node.end, p.parent.type === 'JSXAttribute' ? `{${wrapped}}` : wrapped]);
      usesT = true;
    },
    TemplateLiteral(p) {
      const n = p.node;
      const quasis = n.quasis.map((x) => x.value.cooked);
      if (!quasis.some((s) => isFrench(s) && /[a-zà-ÿ]{2,}/.test(s)) || excluded(p)) return;
      if (!inFunction(p)) { topLevel.push(quasis.join('{…}')); return; }
      let key = quasis[0];
      const vars = [];
      n.expressions.forEach((e, i) => {
        key += `{${i}}` + quasis[i + 1];
        vars.push(`${i}: ${src.slice(e.start, e.end)}`);
      });
      edits.push([n.start, n.end, vars.length ? `t(${q(key)}, { ${vars.join(', ')} })` : `t(${q(key)})`]);
      usesT = true;
      p.skip();
    },
  });

  // remplacements de la fin vers le début ; ceux qui se chevauchent (texte dans un modèle déjà traité) sont ignorés
  edits.sort((a, b) => b[0] - a[0]);
  let out = src;
  let floor = Infinity;
  const kept = [];
  for (const e of edits) {
    if (e[1] > floor) continue;
    out = out.slice(0, e[0]) + e[2] + out.slice(e[1]);
    floor = e[0];
    kept.push(e);
  }
  if (usesT && !/import \{[^}]*\bt\b[^}]*\} from '[./]*(lib\/)?i18n'/.test(out)) {
    const dir = path.dirname(file);
    let imp = path.relative(dir, path.join(root, 'src/lib/i18n')).replace(/\\/g, '/');
    if (!imp.startsWith('.')) imp = `./${imp}`;
    const existing = out.match(/import \{([^}]*)\} from '([./]*(?:lib\/)?i18n)';/);
    if (existing) out = out.replace(existing[0], `import {${existing[1].replace(/\s*$/, '')}, t } from '${existing[2]}';`);
    else {
      const lines = out.split('\n');
      let last = -1;
      lines.forEach((l, i) => { if (/^import .* from '.*';\s*$/.test(l)) last = i; });
      lines.splice(last + 1, 0, `import { t } from '${imp}';`);
      out = lines.join('\n');
    }
  }
  console.log(`\n== ${rel} : ${kept.length} remplacements`);
  if (dry) for (const e of kept.reverse()) console.log('  ', JSON.stringify(src.slice(e[0], e[1])).slice(0, 90), '→', e[2].slice(0, 110));
  if (topLevel.length) console.log('  hors fonction (à traiter à la main) :', topLevel.map((s) => JSON.stringify(s)).join(', ').slice(0, 600));
  if (!dry) fs.writeFileSync(file, out);
}
