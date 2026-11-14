/* =====================================================================
   app/webfonts.js — getting library fonts into the page.
   A family needs its style sheet (ensureCss), which names a font file for every weight, style and range of characters;
   the browser fetches a file when text needs it, which document.fonts.load() asks for ahead of time (ensureFace).
   The Claude artifact takes style sheets and files from Google Fonts. The installable build hosts them itself and
   contacts no other site; with downloaded packs its service worker answers from the device.
   ===================================================================== */
const GF_BASE = 'https://fonts.googleapis.com/css2?';
/* family name → promise of whether its style sheet has loaded */
const cssState = new Map();
/* a family as Google Fonts' address writes it, with all its weights (and italics) */
function gfSpec(f, noItalic) {
  const n = f.n.replace(/ /g, '+');
  if (f.it && !noItalic) return n + ':ital,wght@' + f.w.map(w => '0,' + w).concat(f.w.map(w => '1,' + w)).join(';');
  if (f.w.length === 1 && f.w[0] === 400) return n;
  return n + ':wght@' + f.w.join(';');
}
/* add a style sheet to the page → true once it has loaded, false when it fails or takes more than 20 seconds */
function linkCss(href) {
  return new Promise(res => {
    const l = document.createElement('link');
    let done = false;
    const fin = ok => { if (done) return; done = true; clearTimeout(to); if (!ok) l.remove(); res(ok); };
    const to = setTimeout(() => fin(false), 20000);
    l.rel = 'stylesheet'; l.href = href;
    l.onload = () => fin(true); l.onerror = () => fin(false);
    document.head.appendChild(l);
  });
}
/* a Google Fonts style sheet for these families → promise of whether it loaded */
function addCss(specs) {
  if (BUILD === 'pages') return Promise.resolve(false);     // the installable build contacts no other site; all its fonts are hosted alongside
  return linkCss(GF_BASE + specs.map(s => 'family=' + s).join('&') + '&display=swap');
}
/* the installable build hosts the fonts itself (and keeps downloaded packs on the device); Google Fonts only as a fallback */
function addSelfCss(f) {
  const sf = SELF_FONTS[f.n];
  return linkCss('fonts/' + sf.id + '/' + sf.id + '.css');
}
/* make sure the style sheets of these families are in the page → promise of [true | false], one for each family.
   Google Fonts is asked for six families at a time; a family the joint request fails for is asked for on its own. */
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
/* face and text → promise of whether the font files for it have loaded */
const faceState = new Map();
/* make sure the face c = { fam, weight, italic } can draw `text` → promise of true, or of false when it cannot be loaded */
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
/* the faces of `vars` that could be loaded for `text`; onProg(done, total) is told how far it is */
async function loadFaces(vars, text, onProg) {
  let done = 0;
  const total = vars.length;
  const oks = await Promise.all(vars.map(c => ensureFace(c, text).then(ok => { done++; if (onProg && (done % 6 === 0 || done === total)) onProg(done, total); return ok; })));
  return vars.filter((c, i) => oks[i]);
}
