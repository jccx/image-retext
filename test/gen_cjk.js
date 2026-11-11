// Extra "this is a Chinese character" samples for the Latin classifier's reject class, in more faces and weights.
// Appends part-9.* to /tmp/latin and the faces to faces.json. usage: node test/gen_cjk.js [linesPerFace]
const { open } = require('./harness');
const fs = require('fs');
const LINES = +(process.argv[2] || 250);
const meta = JSON.parse(fs.readFileSync('/tmp/latin/faces.json', 'utf8'));
meta.faces = meta.faces.filter(f => f.cat !== 'cjkx');
const add = [];
for (const w of [100, 300, 500, 900]) add.push({ fam: 'Noto Sans SC', w });
for (const w of [200, 500, 900]) add.push({ fam: 'Noto Serif SC', w });
for (const n of ['ZCOOL XiaoWei', 'ZCOOL KuaiLe', 'Ma Shan Zheng', 'Long Cang']) add.push({ fam: n, w: 400 });
for (const [n, w] of [['WenQuanYi Zen Hei', 400], ['Noto Serif CJK SC', 400], ['Noto Serif CJK SC', 700], ['Noto Sans CJK SC', 400], ['Noto Sans CJK SC', 700]]) add.push({ sys: n, fam: n, w });
add.forEach((f, i) => { f.id = meta.faces.length + i; f.cat = 'cjkx'; f.it = 0; });
fs.writeFileSync('/tmp/latin/faces.json', JSON.stringify({ classes: meta.classes, faces: meta.faces.concat(add) }));
const pageFn = async job => {
  const { faces, nL, lines } = job;
  const han = Array.from(HANZI1);
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const loadImg = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
  const F = new Uint8Array(576), C = new Uint8Array(64), geo = new Float32Array(5), out = [];
  for (const fc of faces) {
    const rnd = mulberry32(31 + fc.id * 7919), pick = a => a[Math.floor(rnd() * a.length)];
    const Fs = [], Gs = [];
    let skipped = 0;
    for (let li = 0; li < lines; li++) {
      const chars = []; for (let k = 0; k < 14; k++) chars.push(pick(han));
      let fontOf;
      if (fc.sys) fontOf = px => fc.w + ' ' + px + 'px "' + fc.sys + '"';
      else {
        const c = { fam: FAM.get(fc.fam), weight: fc.w, italic: false };
        const ok = await loadFaces([c], chars.join(''));
        if (!ok.length) { skipped++; continue; }
        fontOf = px => fontCss(c, px);
      }
      const px = Math.round(14 * Math.pow(72 / 14, rnd())), base = Math.round(px * 1.55) + rnd();
      g.font = fontOf(px);
      let x = px * 0.7 + rnd();
      const items = chars.map(ch => { const m = g.measureText(ch); const it = { t: ch, dx: x + m.actualBoundingBoxLeft, L: x, R: x + m.actualBoundingBoxLeft + m.actualBoundingBoxRight }; x = it.R + px * (0.25 + 0.3 * rnd()); return it; });
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
      if (bands.length !== 1) { skipped++; continue; }
      const b = bands[0], units = ocrUnits(an, b);
      for (const it of items) {
        const us = units.filter(u => { const c = b.x0 + (u.x0 + u.x1 + 1) / 2; return c >= it.L - 1 && c <= it.R + 1; });
        if (!us.length) continue;
        ocrFeat(an, b, Math.min(...us.map(u => u.x0)), Math.min(...us.map(u => u.y0)), Math.max(...us.map(u => u.x1)), Math.max(...us.map(u => u.y1)), F, C, geo);
        Fs.push(F.slice()); Gs.push(geo.slice());
      }
    }
    const n = Fs.length, FF = new Uint8Array(n * 576), GG = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) { FF.set(Fs[i], i * 576); GG.set(Gs[i], i * 5); }
    out.push({ id: fc.id, n, skipped, F: b64(FF), G: b64(new Uint8Array(GG.buffer)), y: b64(new Uint8Array(n).fill(nL)) });
  }
  return out;
};
(async () => {
  const h = await open({ viewport: { width: 900, height: 700 } });
  const fd = ['F', 'G', 'y', 'f'].map(k => fs.openSync('/tmp/latin/part-9.' + k + '.bin', 'w'));
  let total = 0; const t0 = Date.now();
  for (const fc of add) {
    const [r] = await h.page.evaluate(pageFn, { faces: [fc], nL: meta.classes.length, lines: LINES });
    if (r.n) {
      fs.writeSync(fd[0], Buffer.from(r.F, 'base64')); fs.writeSync(fd[1], Buffer.from(r.G, 'base64')); fs.writeSync(fd[2], Buffer.from(r.y, 'base64'));
      const fb = Buffer.alloc(r.n * 2); for (let k = 0; k < r.n; k++) fb.writeUInt16LE(r.id, k * 2); fs.writeSync(fd[3], fb);
      total += r.n;
    }
    console.log(fc.fam, fc.w, 'samples', r.n, 'skipped', r.skipped, 'total', total, Math.round((Date.now() - t0) / 1000) + 's');
  }
  fd.forEach(f => fs.closeSync(f));
  await h.browser.close();
})();
