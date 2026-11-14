// The source files of the app share one scope: the build puts them into a single inline script (see ARCHITECTURE.md).
// This tool reads them the way a browser would and reports what the shared scope hides:
//   node tools/modules.js            what every file declares and which files it leans on
//   node tools/modules.js --names    the same, with the names
//   node tools/modules.js --check    exit 1 on: a name declared twice · a name used that nothing declares ·
//                                    a file reaching into a layer above its own (LAYERS below) · a file listed twice or not at all
const fs = require('fs'), path = require('path');
const acorn = require('acorn');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'src');
const { MODULES, GENERATED } = require(path.join(ROOT, 'build.js'));

/* What a file may lean on, by folder. Files in app/ and pdf/ are the page itself and may use everything. */
const LAYERS = [
  { name: 'base.js', test: f => f === 'base.js', may: f => f === 'base.js' },
  { name: 'image/', test: f => f.startsWith('image/'), may: f => f === 'base.js' || f.startsWith('image/') },
  { name: 'reader/', test: f => f.startsWith('reader/'), may: f => f === 'base.js' || f.startsWith('image/') || f.startsWith('reader/') || /^(hanzi|latin)\.gen\.js$/.test(f) },
  { name: 'pdf/core.js', test: f => f === 'pdf/core.js', may: f => f === 'pdf/core.js' }
];
/* pdf/core.js also runs outside a browser (test/pdf/t_strip.mjs): it may use the language itself and nothing of the page */
const LANGUAGE = new Set(('Array ArrayBuffer Boolean DataView Date Error Float32Array Float64Array Infinity Int16Array Int32Array Int8Array JSON Map Math NaN Number Object Promise ' +
  'RegExp Set String Symbol TextDecoder TextEncoder TypeError Uint16Array Uint32Array Uint8Array Uint8ClampedArray WeakMap isFinite isNaN parseFloat parseInt undefined').split(' '));
const BROWSER = new Set(('window document navigator location localStorage caches fetch URL Blob File Image FontFace ImageData ResizeObserver requestAnimationFrame setTimeout clearTimeout ' +
  'createImageBitmap atob btoa console performance self').split(' '));

/* ---------- names: declared in a scope, and used from outside it ---------- */
function patternNames(p, out) {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') for (const q of p.properties) patternNames(q.type === 'RestElement' ? q.argument : q.value, out);
  else if (p.type === 'ArrayPattern') for (const q of p.elements) patternNames(q, out);
  else if (p.type === 'RestElement') patternNames(p.argument, out);
  else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
  return out;
}
/* names declared directly in a list of statements (let, const, class, function); var is collected by varNames() */
function blockNames(body) {
  const out = [];
  for (const s of body) {
    if (s.type === 'VariableDeclaration' && s.kind !== 'var') for (const d of s.declarations) patternNames(d.id, out);
    else if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') out.push(s.id.name);
  }
  return out;
}
function varNames(node, out) {
  if (!node || typeof node.type !== 'string') return out;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') for (const d of node.declarations) patternNames(d.id, out);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (k === 'type' || !v || typeof v !== 'object') continue;
    for (const c of Array.isArray(v) ? v : [v]) if (c && typeof c.type === 'string' && !/Function/.test(c.type)) varNames(c, out);
  }
  return out;
}
/* → Map name → { line, write } for every name the code uses without declaring it itself */
function freeNames(ast, src) {
  const free = new Map(), scopes = [];
  const lineOf = pos => src.slice(0, pos).split('\n').length;
  const use = (id, write) => {
    for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(id.name)) return;
    const e = free.get(id.name);
    if (!e) free.set(id.name, { line: lineOf(id.start), write: !!write }); else if (write) e.write = true;
  };
  const scoped = (names, fn) => { scopes.push(new Set(names)); fn(); scopes.pop(); };
  /* a pattern on the left of an assignment: the names are used (and written), default values are read */
  const target = p => {
    if (!p) return;
    if (p.type === 'Identifier') use(p, true);
    else if (p.type === 'ObjectPattern') for (const q of p.properties) { if (q.type === 'RestElement') target(q.argument); else { if (q.computed) walk(q.key); target(q.value); } }
    else if (p.type === 'ArrayPattern') p.elements.forEach(target);
    else if (p.type === 'RestElement') target(p.argument);
    else if (p.type === 'AssignmentPattern') { target(p.left); walk(p.right); }
    else walk(p);
  };
  /* a pattern that declares names: only its default values and computed keys are code */
  const binding = p => {
    if (!p) return;
    if (p.type === 'ObjectPattern') for (const q of p.properties) { if (q.type === 'RestElement') binding(q.argument); else { if (q.computed) walk(q.key); binding(q.value); } }
    else if (p.type === 'ArrayPattern') p.elements.forEach(binding);
    else if (p.type === 'RestElement') binding(p.argument);
    else if (p.type === 'AssignmentPattern') { binding(p.left); walk(p.right); }
  };
  const fn = node => {
    const names = [];
    for (const p of node.params) patternNames(p, names);
    if (node.type === 'FunctionExpression' && node.id) names.push(node.id.name);
    if (node.body.type === 'BlockStatement') names.push(...blockNames(node.body.body), ...varNames(node.body, []));
    scoped(names, () => { node.params.forEach(binding); if (node.body.type === 'BlockStatement') node.body.body.forEach(walk); else walk(node.body); });
  };
  const walk = node => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Identifier': use(node, false); return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': fn(node); return;
      case 'BlockStatement': scoped(blockNames(node.body), () => node.body.forEach(walk)); return;
      case 'VariableDeclaration': for (const d of node.declarations) { binding(d.id); walk(d.init); } return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const head = node.type === 'ForStatement' ? node.init : node.left, names = [];
        if (head && head.type === 'VariableDeclaration' && head.kind !== 'var') for (const d of head.declarations) patternNames(d.id, names);
        scoped(names, () => {
          if (head && head.type === 'VariableDeclaration') walk(head); else if (node.type === 'ForStatement') walk(head); else target(head);
          if (node.type === 'ForStatement') { walk(node.test); walk(node.update); } else walk(node.right);
          walk(node.body);
        });
        return;
      }
      case 'CatchClause': scoped(patternNames(node.param, []), () => { binding(node.param); walk(node.body); }); return;
      case 'ClassDeclaration': case 'ClassExpression': walk(node.superClass); scoped(node.id ? [node.id.name] : [], () => walk(node.body)); return;
      case 'MethodDefinition': case 'PropertyDefinition': case 'Property': if (node.computed) walk(node.key); walk(node.value); return;
      case 'MemberExpression': walk(node.object); if (node.computed) walk(node.property); return;
      case 'AssignmentExpression': target(node.left); walk(node.right); return;
      case 'UpdateExpression': target(node.argument); return;
      case 'LabeledStatement': walk(node.body); return;
      case 'BreakStatement': case 'ContinueStatement': case 'MetaProperty': return;
      default:
        for (const k of Object.keys(node)) {
          const v = node[k];
          if (k === 'type' || !v || typeof v !== 'object') continue;
          if (Array.isArray(v)) v.forEach(walk); else walk(v);
        }
    }
  };
  scoped([...blockNames(ast.body), ...varNames(ast, [])], () => ast.body.forEach(walk));
  return free;
}

/* ---------- the files ---------- */
const problems = [];
const files = [...GENERATED, ...MODULES];
{
  const seen = new Set();
  for (const f of files) { if (seen.has(f)) problems.push(f + ' is listed twice in build.js'); seen.add(f); }
  const walkDir = d => fs.readdirSync(path.join(SRC, d), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walkDir(path.join(d, e.name)) : [path.join(d, e.name).split(path.sep).join('/')]));
  for (const f of walkDir('')) if (/\.js$/.test(f) && f !== 'sw.js' && !seen.has(f)) problems.push('src/' + f + ' is not listed in build.js: it is not part of the app');
}
const owner = new Map([['BUILD', 'build.js'], ['SELF_FONTS', 'selffonts.gen.js'], ['FONT_PACKS', 'selffonts.gen.js']]);      // BUILD is written by build.js; the two font tables are empty in the artifact build
const info = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' }); }
  catch (e) { problems.push('src/' + f + ': ' + e.message); continue; }
  const names = [...blockNames(ast.body), ...varNames(ast, [])];
  for (const n of names) {
    if (owner.has(n) && owner.get(n) !== f) problems.push(n + ' is declared in ' + owner.get(n) + ' and again in ' + f);
    owner.set(n, f);
  }
  info.push({ f, names, free: freeNames(ast, src) });
}
const want = process.argv[2] || '';
for (const m of info) {
  const uses = new Map();
  for (const [n, u] of m.free) {
    const o = owner.get(n);
    if (o) {
      if (!uses.has(o)) uses.set(o, []);
      uses.get(o).push(n);
      if (u.write) problems.push('src/' + m.f + ':' + u.line + ' assigns to ' + n + ', which belongs to ' + o + ' (change it through a function of that file)');
      const layer = LAYERS.find(l => l.test(m.f));
      if (layer && !layer.may(o)) problems.push('src/' + m.f + ':' + u.line + ' uses ' + n + ' of ' + o + ': ' + layer.name + ' must not lean on that file');
    } else if (LANGUAGE.has(n)) { /* part of the language */ }
    else if (!BROWSER.has(n)) problems.push('src/' + m.f + ':' + u.line + ' uses ' + n + ', which no file declares');
    else if (m.f === 'pdf/core.js') problems.push('src/' + m.f + ':' + u.line + ' uses ' + n + ': pdf/core.js has to run without a page');
  }
  m.uses = uses;
  if (want === '--check' || GENERATED.includes(m.f)) continue;
  const list = [...uses.keys()].filter(o => !GENERATED.includes(o) && o !== 'build.js').sort();
  console.log(m.f.padEnd(20) + String(m.names.length).padStart(3) + ' names' + (list.length ? '   uses ' + (want === '--names' ? '' : list.join(', ')) : ''));
  if (want === '--names') {
    console.log('    declares: ' + m.names.join(' '));
    for (const o of [...uses.keys()].sort()) console.log('    ' + o + ': ' + uses.get(o).sort().join(' '));
  }
}
if (problems.length) { console.log('\n' + problems.length + ' problem(s):\n  ' + problems.join('\n  ')); if (want === '--check') process.exit(1); }
else if (want === '--check') console.log('modules: ' + MODULES.length + ' files, ' + owner.size + ' names, no problems');
