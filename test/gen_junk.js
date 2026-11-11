// More "not one glyph" samples for the classifier: short runs of neighbouring characters as text really sets them
// (letters, digits, punctuation, sometimes a space), in lines with and without Chinese. Writes /tmp/latin/part-6.*
const { open } = require('./harness');
const fs = require('fs');
const LINES = +(process.argv[2] || 6);
const meta = JSON.parse(fs.readFileSync('/tmp/latin/faces.json', 'utf8'));
const list = meta.faces.filter(f => f.cat !== 'cjk' && f.cat !== 'cjkx');
const fn = async job => {
  const { faces, nL, ligs, lines } = job;
  const CJK = nL, JUNK = nL + 1, han = Array.from(HANZI1);
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const loadImg = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
  const F = new Uint8Array(576), C = new Uint8Array(64), geo = new Float32Array(5), out = [];
  const LO = Array.from('abcdefghijklmnopqrstuvwxyz'), UP = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), DG = Array.from('0123456789'), PU = Array.from(",.:;-/$%()'!?&#@");
  for (const fc of faces) {
    let fontOf;
    if (fc.sys) fontOf = px => (fc.it ? 'italic ' : '') + fc.w + ' ' + px + 'px ' + (/^(sans-serif|serif|monospace)$/.test(fc.sys) ? fc.sys : '"' + fc.sys + '"');
    else {
      const fam = FAM.get(fc.fam);
      if (!fam) { out.push({ id: fc.id, n: 0 }); continue; }
      const c = { fam, weight: fc.w, italic: !!fc.it };
      const ok = await loadFaces([c], 'abc ABC 012 ,.$');
      if (!ok.length) { out.push({ id: fc.id, n: 0 }); continue; }
      fontOf = px => fontCss(c, px);
    }
    const rnd = mulberry32(4242 + fc.id * 7919), pick = a => a[Math.floor(rnd() * a.length)];
    const one = () => { const q = rnd(); return pick(q < 0.4 ? LO : q < 0.6 ? UP : q < 0.8 ? DG : PU); };
    const Fs = [], Gs = [], ys = [];
    for (let li = 0; li < lines; li++) {
      const items = [], zh = rnd() < 0.5, cjkFont = (rnd() < 0.5 ? 400 : 700) + ' PXpx ' + (rnd() < 0.7 ? 'sans-serif' : 'serif');
      for (let k = 0; k < 10; k++) {
        if (zh && rnd() < 0.25) { items.push({ t: pick(han), y: CJK, cjk: 1 }); continue; }
        const q = rnd(), n = q < 0.55 ? 2 : q < 0.9 ? 3 : 4;
        let t = '';
        for (let i = 0; i < n; i++) t += one();
        if (ligs.includes(t) || t === "''") continue;
        if (rnd() < 0.25) { const p = 1 + Math.floor(rnd() * (n - 1)); t = t.slice(0, p) + ' ' + t.slice(p); }
        items.push({ t, y: JUNK });
      }
      const px = Math.round(13 * Math.pow(70 / 13, rnd())), base = Math.round(px * 1.55) + rnd();
      let x = px * 0.7 + rnd();
      for (const it of items) {
        g.font = it.cjk ? cjkFont.replace('PX', px) : fontOf(px);
        const m = g.measureText(it.t);
        it.font = g.font; it.dx = x + m.actualBoundingBoxLeft; it.L = x; it.R = x + m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
        x = it.R + px * (0.5 + 0.3 * rnd());
      }
      cv.width = Math.ceil(x + px * 0.5); cv.height = Math.ceil(px * 2.5);
      const dark = rnd() < 0.3, tint = () => Math.floor(rnd() * 56);
      const bg = dark ? [10 + tint(), 10 + tint(), 10 + tint()] : [199 + tint(), 199 + tint(), 199 + tint()];
      const fg = dark ? [195 + tint(), 195 + tint(), 195 + tint()] : [tint() * 2, tint() * 2, tint() * 2];
      g.fillStyle = 'rgb(' + bg + ')'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = 'rgb(' + fg + ')'; g.textBaseline = 'alphabetic';
      const blur = rnd() < 0.3 ? (0.25 + 0.6 * rnd()) * px / 32 : 0;
      g.filter = blur ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
      for (const it of items) { g.font = it.font; g.fillText(it.t, it.dx, base); }
      g.filter = 'none';
      if (rnd() < 0.22) { const im = await loadImg(cv.toDataURL('image/jpeg', 0.45 + 0.45 * rnd())); g.drawImage(im, 0, 0); }
      const an = analyzeRegion(g.getImageData(0, 0, cv.width, cv.height), null);
      const bands = an.found ? findBands(an.alpha, an.w, an.h, 0) : [];
      if (bands.length !== 1) continue;
      const b = bands[0], H = b.y1 - b.y0, units = ocrUnits(an, b);
      for (const it of items) {
        const us = units.filter(u => { const c = b.x0 + (u.x0 + u.x1 + 1) / 2; return c >= it.L - 1 && c <= it.R + 1; });
        if (!us.length) continue;
        const x0 = Math.min(...us.map(u => u.x0)), x1 = Math.max(...us.map(u => u.x1));
        if (x1 - x0 + 1 > 1.35 * H) continue;                       // the reader never tries boxes this wide
        ocrFeat(an, b, x0, Math.min(...us.map(u => u.y0)), x1, Math.max(...us.map(u => u.y1)), F, C, geo);
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
  const fd = ['F', 'G', 'y', 'f'].map(k => fs.openSync('/tmp/latin/part-6.' + k + '.bin', 'w'));
  let total = 0; const t0 = Date.now();
  for (let i = 0; i < list.length; i += 8) {
    const res = await h.page.evaluate(fn, { faces: list.slice(i, i + 8), nL: meta.classes.length, ligs: meta.ligs || [], lines: LINES });
    for (const r of res) {
      if (!r.n) continue;
      fs.writeSync(fd[0], Buffer.from(r.F, 'base64')); fs.writeSync(fd[1], Buffer.from(r.G, 'base64')); fs.writeSync(fd[2], Buffer.from(r.y, 'base64'));
      const fb = Buffer.alloc(r.n * 2); for (let k = 0; k < r.n; k++) fb.writeUInt16LE(r.id, k * 2); fs.writeSync(fd[3], fb);
      total += r.n;
    }
    if ((i / 8) % 12 === 0 || i + 8 >= list.length) console.log(Math.min(i + 8, list.length) + '/' + list.length, 'samples', total, Math.round((Date.now() - t0) / 1000) + 's');
  }
  fd.forEach(f => fs.closeSync(f));
  await h.browser.close();
  console.log('done');
})();
