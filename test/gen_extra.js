// More training samples, appended to /tmp/latin: (a) bold italics in the usual way → part-8; (b) the f-ligatures (fi fl ff ffi ffl),
// which pages and design tools draw as one joined shape → part-7 with labels after the two reject classes.
const { open } = require('./harness');
const { pageFn, CLASSES } = require('./gen_latin');
const fs = require('fs'), path = require('path');
const FS = path.join(__dirname, '..', 'node_modules/@fontsource');
const LIGS = ['fi', 'fl', 'ff', 'ffi', 'ffl'];
const meta = JSON.parse(fs.readFileSync('/tmp/latin/faces.json', 'utf8'));
meta.faces = meta.faces.filter(f => f.cat !== 'itx');
const GF = new Function(fs.readFileSync(path.join(__dirname, '..', 'src/fontdb.gen.js'), 'utf8') + ';return GF;')();
const idOf = n => n.toLowerCase().replace(/ /g, '-');
const has = (id, w) => fs.existsSync(path.join(FS, id, 'files', id + '-latin-' + w + '-italic.woff2'));
const extra = [];
for (const f of GF) { if (f[5] !== '' || !f[3]) continue; const id = idOf(f[0]); for (const w of [700, 500, 300]) if (f[2].includes(w) && has(id, w)) { extra.push({ fam: f[0], w, it: 1, cat: 'itx' }); if (w !== 700) break; } }
extra.forEach((f, i) => (f.id = meta.faces.length + i));
const all = meta.faces.concat(extra);
fs.writeFileSync('/tmp/latin/faces.json', JSON.stringify({ classes: meta.classes, ligs: LIGS, faces: all }));
const ligFn = async job => {
  const { faces, nL, ligs, lines } = job;
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const loadImg = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
  const F = new Uint8Array(576), C = new Uint8Array(64), geo = new Float32Array(5), out = [];
  for (const fc of faces) {
    let fontOf;
    if (fc.sys) fontOf = px => (fc.it ? 'italic ' : '') + fc.w + ' ' + px + 'px ' + (/^(sans-serif|serif|monospace)$/.test(fc.sys) ? fc.sys : '"' + fc.sys + '"');
    else {
      const fam = FAM.get(fc.fam);
      if (!fam) { out.push({ id: fc.id, n: 0 }); continue; }
      const c = { fam, weight: fc.w, italic: !!fc.it };
      const ok = await loadFaces([c], 'fil gpxh');
      if (!ok.length) { out.push({ id: fc.id, n: 0 }); continue; }
      fontOf = px => fontCss(c, px);
    }
    const rnd = mulberry32(555 + fc.id * 7919), pick = a => a[Math.floor(rnd() * a.length)];
    const Fs = [], Gs = [], ys = [];
    for (let li = 0; li < lines; li++) {
      const items = [];
      for (let k = 0; k < 10; k++) { const q = Math.floor(rnd() * ligs.length); items.push({ t: ligs[q], y: nL + 2 + q }); }
      if (rnd() < 0.6) items.splice(Math.floor(rnd() * 10), 0, { t: pick(Array.from('gpqy')), y: -1 });   // sometimes a descender, so the line is taller
      if (rnd() < 0.3) items.splice(Math.floor(rnd() * 10), 0, { t: pick(Array.from('xaeo')), y: -1 });
      const px = Math.round(13 * Math.pow(70 / 13, rnd())), base = Math.round(px * 1.55) + rnd();
      g.font = fontOf(px);
      let x = px * 0.7 + rnd();
      for (const it of items) { const m = g.measureText(it.t); it.dx = x + m.actualBoundingBoxLeft; it.L = x; it.R = x + m.actualBoundingBoxLeft + m.actualBoundingBoxRight; x = it.R + px * (0.3 + 0.3 * rnd()); }
      cv.width = Math.ceil(x + px * 0.5); cv.height = Math.ceil(px * 2.5);
      const dark = rnd() < 0.3, tint = () => Math.floor(rnd() * 56);
      const bg = dark ? [10 + tint(), 10 + tint(), 10 + tint()] : [199 + tint(), 199 + tint(), 199 + tint()];
      const fg = dark ? [195 + tint(), 195 + tint(), 195 + tint()] : [tint() * 2, tint() * 2, tint() * 2];
      g.fillStyle = 'rgb(' + bg + ')'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = 'rgb(' + fg + ')'; g.textBaseline = 'alphabetic'; g.font = fontOf(px);
      const blur = rnd() < 0.3 ? (0.25 + 0.6 * rnd()) * px / 32 : 0;
      g.filter = blur ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
      for (const it of items) g.fillText(it.t, it.dx, base);
      g.filter = 'none';
      if (rnd() < 0.22) { const im = await loadImg(cv.toDataURL('image/jpeg', 0.45 + 0.45 * rnd())); g.drawImage(im, 0, 0); }
      const an = analyzeRegion(g.getImageData(0, 0, cv.width, cv.height), null);
      const bands = an.found ? findBands(an.alpha, an.w, an.h, 0) : [];
      if (bands.length !== 1) continue;
      const b = bands[0], units = ocrUnits(an, b);
      for (const it of items) {
        if (it.y < 0) continue;
        const us = units.filter(u => { const c = b.x0 + (u.x0 + u.x1 + 1) / 2; return c >= it.L - 1 && c <= it.R + 1; });
        if (!us.length) continue;
        /* only shapes that really are joined (by ink or by a hairline) teach the ligature; letters standing apart are just letters */
        let joined = true, lows = us[0].low;
        for (const u of us.slice(1)) { if (!u.low.some(id => lows.includes(id))) joined = false; else lows = lows.concat(u.low); }
        if (!joined) continue;
        ocrFeat(an, b, Math.min(...us.map(u => u.x0)), Math.min(...us.map(u => u.y0)), Math.max(...us.map(u => u.x1)), Math.max(...us.map(u => u.y1)), F, C, geo);
        Fs.push(F.slice()); Gs.push(geo.slice()); ys.push(it.y);
      }
    }
    const n = ys.length, FF = new Uint8Array(n * 576), GG = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) { FF.set(Fs[i], i * 576); GG.set(Gs[i], i * 5); }
    out.push({ id: fc.id, n, F: b64(FF), G: b64(new Uint8Array(GG.buffer)), y: b64(new Uint8Array(ys)) });
  }
  return out;
};
(async () => {
  const h = await open({ viewport: { width: 900, height: 700 } });
  const run = async (part, list, fn, job) => {
    const fd = ['F', 'G', 'y', 'f'].map(k => fs.openSync('/tmp/latin/part-' + part + '.' + k + '.bin', 'w'));
    let total = 0; const t0 = Date.now();
    for (let i = 0; i < list.length; i += 8) {
      const res = await h.page.evaluate(fn, Object.assign({ faces: list.slice(i, i + 8) }, job));
      for (const r of res) {
        if (!r.n) continue;
        fs.writeSync(fd[0], Buffer.from(r.F, 'base64')); fs.writeSync(fd[1], Buffer.from(r.G, 'base64')); fs.writeSync(fd[2], Buffer.from(r.y, 'base64'));
        const fb = Buffer.alloc(r.n * 2); for (let k = 0; k < r.n; k++) fb.writeUInt16LE(r.id, k * 2); fs.writeSync(fd[3], fb);
        total += r.n;
      }
      if ((i / 8) % 10 === 0 || i + 8 >= list.length) console.log('part', part, Math.min(i + 8, list.length) + '/' + list.length, 'samples', total, Math.round((Date.now() - t0) / 1000) + 's');
    }
    fd.forEach(f => fs.closeSync(f));
  };
  await run(8, extra, pageFn, { classes: CLASSES, lines: 70 });
  await run(7, all.filter(f => f.cat !== 'cjk' && f.cat !== 'cjkx'), ligFn, { nL: CLASSES.length, ligs: LIGS, lines: 5 });
  await h.browser.close();
  console.log('done');
})();
