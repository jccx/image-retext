// Training data for the Latin classifier, made by the page's own pipeline:
// glyphs drawn in many open-source faces → analyzeRegion → units → ocrFeat. Output: /tmp/latin/part-<shard>.{F,G,y,f}.bin + faces json
// usage: node test/gen_latin.js <shard> <nShards> [linesPerFace] [limitFaces]
const { open } = require('./harness');
const fs = require('fs'), path = require('path');
const FS = path.join(__dirname, '..', 'node_modules/@fontsource');
const shard = +(process.argv[2] || 0), nShards = +(process.argv[3] || 1), LINES = +(process.argv[4] || 40), LIMIT = +(process.argv[5] || 0);
const CLASSES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' + "!#$%&'()*+,-./:;<=>?@[\\]^_{|}~¥£€·–—×°";
const GF = new Function(fs.readFileSync(path.join(__dirname, '..', 'src/fontdb.gen.js'), 'utf8') + ';return GF;')();
const idOf = n => n.toLowerCase().replace(/ /g, '-');
const has = (id, w, it) => fs.existsSync(path.join(FS, id, 'files', id + '-latin-' + w + '-' + (it ? 'italic' : 'normal') + '.woff2'));
const pageFn = async job => {
  const { faces, classes, lines } = job;
  const cls = Array.from(classes), nL = cls.length, CJK = nL, JUNK = nL + 1;
  const idx = new Map(cls.map((c, i) => [c, i]));
  const han = Array.from(HANZI1);
  const pools = {
    all: cls, caps: Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?-&()/#$%+'"), digs: Array.from('0123456789.,:-/%$¥€£+–—×°#()'),
    lower: Array.from('abcdefghijklmnopqrstuvwxyz'), xh: Array.from('acemnorsuvwxz'), xd: Array.from('acemnorsuvwxzgjpqy'), xa: Array.from('acemnorsuvwxzbdfhklti'),
    alnum: Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
  };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const loadImg = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  const out = [];
  const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
  const F = new Uint8Array(576), C = new Uint8Array(64), geo = new Float32Array(5);
  for (const fc of faces) {
    const t0 = performance.now();
    let fontOf;
    if (fc.sys) fontOf = px => (fc.it ? 'italic ' : '') + fc.w + ' ' + px + 'px ' + (/^(sans-serif|serif|monospace)$/.test(fc.sys) ? fc.sys : '"' + fc.sys + '"');
    else {
      const fam = FAM.get(fc.fam);
      if (!fam) { out.push({ id: fc.id, n: 0, err: 'nofam' }); continue; }
      const c = { fam, weight: fc.w, italic: !!fc.it };
      const ok = await loadFaces([c], classes);
      if (!ok.length) { out.push({ id: fc.id, n: 0, err: 'noload' }); continue; }
      fontOf = px => fontCss(c, px);
    }
    const rnd = mulberry32(977 + fc.id * 7919);
    const pick = a => a[Math.floor(rnd() * a.length)];
    const Fs = [], Gs = [], ys = [];
    let skipped = 0;
    for (let li = 0; li < lines; li++) {
      const r = rnd(), items = [], N = 14;
      let pool, cjkLine = false, wordy = false;
      if (r < 0.38) pool = pools.all; else if (r < 0.52) pool = pools.caps; else if (r < 0.64) pool = pools.digs;
      else if (r < 0.80) { const q = rnd(); pool = q < 0.5 ? pools.lower : q < 0.7 ? pools.xh : q < 0.85 ? pools.xd : pools.xa; }
      else if (r < 0.88) { wordy = true; pool = pools.lower; } else { cjkLine = true; pool = pools.alnum; }
      const cjkFont = (rnd() < 0.5 ? 400 : 700) + ' PXpx ' + (rnd() < 0.7 ? 'sans-serif' : 'serif');
      for (let k = 0; k < N; k++) {
        if (cjkLine && rnd() < 0.3) { items.push({ t: pick(han), y: CJK, cjk: 1 }); continue; }
        let ch;
        if (cjkLine) { const q = rnd(); ch = q < 0.45 ? pick(pools.digs) : q < 0.7 ? pick(pools.caps) : pick(pools.lower); }
        else if (wordy) ch = k % 5 === 0 ? pick(pools.caps.slice(0, 26)) : rnd() < 0.08 ? pick(pools.digs) : pick(pool);
        else if (pool !== pools.all && pool !== pools.caps && pool !== pools.digs && rnd() < 0.08) ch = pick(Array.from(".,'-!?"));
        else ch = pick(pool);
        if (rnd() < 0.1 && /[A-Za-z0-9]/.test(ch)) { let c2 = pick(pool); if (!/[A-Za-z0-9]/.test(c2)) c2 = pick(pools.alnum); items.push({ t: ch + c2, y: JUNK }); }
        else items.push({ t: ch, y: idx.get(ch) });
      }
      const px = Math.round(13 * Math.pow(70 / 13, rnd())), base = Math.round(px * 1.55) + rnd();
      // measure
      let x = px * 0.7 + rnd();
      for (const it of items) {
        g.font = it.cjk ? cjkFont.replace('PX', px) : fontOf(px);
        const m = g.measureText(it.t);
        it.font = g.font; it.dx = x + m.actualBoundingBoxLeft; it.L = x; it.R = x + m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
        x = it.R + px * (0.3 + 0.3 * rnd());
      }
      cv.width = Math.ceil(x + px * 0.5); cv.height = Math.ceil(px * 2.5);
      const dark = rnd() < 0.3, tint = () => Math.floor(rnd() * 56);
      const bg = dark ? [10 + tint(), 10 + tint(), 10 + tint()] : [199 + tint(), 199 + tint(), 199 + tint()];
      let fg = dark ? [195 + tint(), 195 + tint(), 195 + tint()] : [tint() * 2, tint() * 2, tint() * 2];
      if (rnd() < 0.25) { const k = Math.floor(rnd() * 3); fg = fg.slice(); fg[k] = dark ? 255 : Math.min(200, fg[k] + 110); }
      const q = rnd();
      if (q < 0.12) { const gr = g.createLinearGradient(0, 0, rnd() < 0.5 ? cv.width : 0, cv.height); const d = 12 + rnd() * 16; gr.addColorStop(0, 'rgb(' + bg.map(v => clamp(v - d, 0, 255)) + ')'); gr.addColorStop(1, 'rgb(' + bg.map(v => clamp(v + d, 0, 255)) + ')'); g.fillStyle = gr; }
      else g.fillStyle = 'rgb(' + bg + ')';
      g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = 'rgb(' + fg + ')'; g.textBaseline = 'alphabetic';
      const blur = rnd() < 0.3 ? (0.25 + 0.6 * rnd()) * px / 32 : 0;
      g.filter = blur ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
      for (const it of items) { g.font = it.font; g.fillText(it.t, it.dx, base); }
      g.filter = 'none';
      if (q > 0.92) { const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data; for (let i = 0; i < d.length; i += 4) { const nz = (rnd() - 0.5) * 12; d[i] += nz; d[i + 1] += nz; d[i + 2] += nz; } g.putImageData(im, 0, 0); }
      if (rnd() < 0.22) { const im = await loadImg(cv.toDataURL('image/jpeg', 0.45 + 0.45 * rnd())); g.drawImage(im, 0, 0); }
      const an = analyzeRegion(g.getImageData(0, 0, cv.width, cv.height), null);
      const bands = an.found ? findBands(an.alpha, an.w, an.h, 0) : [];
      if (bands.length !== 1) { skipped++; continue; }
      const b = bands[0], units = ocrUnits(an, b);
      for (const it of items) {
        const us = units.filter(u => { const c = b.x0 + (u.x0 + u.x1 + 1) / 2; return c >= it.L - 1 && c <= it.R + 1; });
        if (!us.length) continue;
        const add = (sub, y) => {
          const x0 = Math.min(...sub.map(u => u.x0)), x1 = Math.max(...sub.map(u => u.x1)), y0 = Math.min(...sub.map(u => u.y0)), y1 = Math.max(...sub.map(u => u.y1));
          ocrFeat(an, b, x0, y0, x1, y1, F, C, geo);
          Fs.push(F.slice()); Gs.push(geo.slice()); ys.push(y);
        };
        add(us, it.y);
        if (us.length >= 3 && it.y < nL) add(us.slice(0, 2), JUNK);
      }
    }
    const n = ys.length, FF = new Uint8Array(n * 576), GG = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) { FF.set(Fs[i], i * 576); GG.set(Gs[i], i * 5); }
    out.push({ id: fc.id, n, skipped, ms: Math.round(performance.now() - t0), F: b64(FF), G: b64(new Uint8Array(GG.buffer)), y: b64(new Uint8Array(ys)) });
  }
  return out;
};
module.exports = { pageFn, CLASSES };
if (require.main === module) {
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const faces = [];
for (const f of GF) {
  if (f[5] !== '') continue;
  const id = idOf(f[0]), ws = f[2].filter(w => has(id, w, false));
  if (!ws.length) continue;
  const near = t => ws.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
  const pick = new Set([near(400), near(700)]);
  const rest = ws.filter(w => !pick.has(w));
  if (rest.length) pick.add(rest[Math.floor(rnd() * rest.length)]);
  for (const w of pick) faces.push({ fam: f[0], w, it: 0, cat: f[1] });
  if (f[3] && has(id, near(400), true)) faces.push({ fam: f[0], w: near(400), it: 1, cat: f[1] });
}
for (const [n, ws] of [['Noto Sans SC', [300, 400, 700, 900]], ['Noto Serif SC', [400, 700, 900]]]) for (const w of ws) faces.push({ fam: n, w, it: 0, cat: 'cjk' });
for (const n of ['DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono', 'FreeSans', 'FreeSerif', 'FreeMono', 'Carlito', 'Caladea', 'Bitstream Charter', 'Courier 10 Pitch', 'GFS Baskerville', 'Latin Modern Roman', 'Latin Modern Sans', 'Liberation Sans', 'Liberation Serif', 'Liberation Mono',
  'TeX Gyre Heros', 'TeX Gyre Heros Cn', 'TeX Gyre Termes', 'TeX Gyre Pagella', 'TeX Gyre Schola', 'TeX Gyre Bonum', 'TeX Gyre Adventor', 'TeX Gyre Cursor', 'Utopia', 'Loma', 'WenQuanYi Zen Hei', 'Noto Sans CJK SC', 'Noto Serif CJK SC', 'Noto Sans Mono CJK SC', 'IPAGothic', 'sans-serif', 'serif', 'monospace']) {
  for (const w of [400, 700]) faces.push({ sys: n, fam: n, w, it: 0, cat: 'sys' });
  if (/Liberation|Heros$|Termes|Pagella|DejaVu Sans$|DejaVu Serif|Carlito|Caladea/.test(n)) faces.push({ sys: n, fam: n, w: 400, it: 1, cat: 'sys' });
}
faces.forEach((f, i) => (f.id = i));
fs.writeFileSync('/tmp/latin/faces.json', JSON.stringify({ classes: CLASSES, faces }));
const mine = faces.filter(f => f.id % nShards === shard).slice(0, LIMIT || 1e9);
console.log('faces', faces.length, 'this shard', mine.length);

(async () => {
  const h = await open({ viewport: { width: 900, height: 700 } });
  const p = h.page;
  const fd = ['F', 'G', 'y', 'f'].map(k => fs.openSync('/tmp/latin/part-' + shard + '.' + k + '.bin', 'w'));
  let total = 0, t0 = Date.now();
  for (let i = 0; i < mine.length; i += 8) {
    const res = await p.evaluate(pageFn, { faces: mine.slice(i, i + 8), classes: CLASSES, lines: LINES });
    for (const r of res) {
      if (!r.n) { console.log('  skip face', r.id, r.err || 'no samples'); continue; }
      fs.writeSync(fd[0], Buffer.from(r.F, 'base64')); fs.writeSync(fd[1], Buffer.from(r.G, 'base64')); fs.writeSync(fd[2], Buffer.from(r.y, 'base64'));
      const fb = Buffer.alloc(r.n * 2); for (let k = 0; k < r.n; k++) fb.writeUInt16LE(r.id, k * 2); fs.writeSync(fd[3], fb);
      total += r.n;
    }
    console.log('shard', shard, 'faces', Math.min(i + 8, mine.length) + '/' + mine.length, 'samples', total, 'skipped lines', res.reduce((a, r) => a + (r.skipped || 0), 0), Math.round((Date.now() - t0) / 1000) + 's');
  }
  fd.forEach(f => fs.closeSync(f));
  const bad = h.logs.filter(l => !/400|404|Failed to load/.test(l));
  if (bad.length) console.log('LOGS', bad.slice(0, 5).join('\n').slice(0, 800));
  await h.browser.close();
})();
}
