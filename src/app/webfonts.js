/* ---------- web font loading (Google Fonts stylesheets, faces fetched on demand) ---------- */
const GF_BASE = 'https://fonts.googleapis.com/css2?';
const cssState = new Map();
function gfSpec(f, noItalic) {
  const n = f.n.replace(/ /g, '+');
  if (f.it && !noItalic) return n + ':ital,wght@' + f.w.map(w => '0,' + w).concat(f.w.map(w => '1,' + w)).join(';');
  if (f.w.length === 1 && f.w[0] === 400) return n;
  return n + ':wght@' + f.w.join(';');
}
function addCss(specs) {
  if (BUILD === 'pages') return Promise.resolve(false);     // the installable build contacts no other site; all its fonts are hosted alongside
  return new Promise(res => {
    const l = document.createElement('link');
    let done = false;
    const fin = ok => { if (done) return; done = true; clearTimeout(to); if (!ok) l.remove(); res(ok); };
    const to = setTimeout(() => fin(false), 20000);
    l.rel = 'stylesheet';
    l.href = GF_BASE + specs.map(s => 'family=' + s).join('&') + '&display=swap';
    l.onload = () => fin(true);
    l.onerror = () => fin(false);
    document.head.appendChild(l);
  });
}
/* the installable build hosts the fonts itself (and keeps downloaded packs on the device); Google Fonts only as a fallback */
function addSelfCss(f) {
  const sf = SELF_FONTS[f.n];
  return new Promise(res => {
    const l = document.createElement('link');
    let done = false;
    const fin = ok => { if (done) return; done = true; clearTimeout(to); if (!ok) l.remove(); res(ok); };
    const to = setTimeout(() => fin(false), 20000);
    l.rel = 'stylesheet'; l.href = 'fonts/' + sf.id + '/' + sf.id + '.css';
    l.onload = () => fin(true); l.onerror = () => fin(false);
    document.head.appendChild(l);
  });
}
function ensureCss(fams) {
  const flat = [];
  for (const f of fams) { if (f.stack) flat.push(...f.stack); else flat.push(f); }
  let need = [...new Set(flat)].filter(f => !f.sys && !cssState.has(f.n));
  for (const f of need) if (SELF_FONTS[f.n]) cssState.set(f.n, addSelfCss(f).then(ok => ok || addCss([gfSpec(f)])));
  need = need.filter(f => !SELF_FONTS[f.n]);
  for (let i = 0; i < need.length; i += 6) {
    const chunk = need.slice(i, i + 6);
    const p = addCss(chunk.map(f => gfSpec(f)));
    for (const f of chunk) {
      cssState.set(f.n, p.then(ok => ok || addCss([gfSpec(f)]).then(ok2 => ok2 || (f.it ? addCss([gfSpec(f, true)]) : false))));
    }
  }
  return Promise.all(fams.map(f => (f.stack ? Promise.all(f.stack.map(m => (m.sys ? true : cssState.get(m.n)))).then(a => a.every(Boolean)) : f.sys ? true : cssState.get(f.n))));
}
const faceState = new Map();
function ensureFace(c, text) {
  const f = c.fam;
  if (f.stack) return Promise.all(f.stack.map(m => ensureFace({ fam: m, weight: nearW(m, c.weight), italic: c.italic }, text))).then(a => a.every(Boolean));
  if (f.sys) return Promise.resolve(true);
  const it = c.italic && f.it;
  const key = f.n + '|' + c.weight + '|' + (it ? 1 : 0) + '|' + text;
  let p = faceState.get(key);
  if (!p) {
    p = ensureCss([f]).then(([ok]) => {
      if (!ok || !document.fonts || !document.fonts.load) return false;
      const spec = (it ? 'italic ' : '') + c.weight + ' 40px "' + f.n + '"';
      return Promise.race([
        document.fonts.load(spec, text).then(a => a.length > 0, () => false),
        new Promise(r => setTimeout(() => { faceState.delete(key); r(false); }, 30000))   // timed out: try again next time
      ]);
    });
    faceState.set(key, p);
    if (faceState.size > 6000) faceState.clear();
  }
  return p;
}
async function loadFaces(vars, text, onProg) {
  let done = 0;
  const total = vars.length;
  const oks = await Promise.all(vars.map(c => ensureFace(c, text).then(ok => { done++; if (onProg && (done % 6 === 0 || done === total)) onProg(done, total); return ok; })));
  return vars.filter((c, i) => oks[i]);
}
