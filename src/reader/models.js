/* =====================================================================
   ocr.js — a small text reader written for this page; it runs on the device.
   It is the fallback for pages where the viewer's Claude is not available (a shared link in a plain browser).
   · Chinese: each character in the picture is compared with characters drawn in the device's own fonts
     (the 6,763 GB 2312 characters). Reliable on ordinary printed faces (黑体, 宋体), not on brush or display faces.
   · Latin letters, digits, punctuation: a small classifier (latin.gen.js) trained for this page on glyphs
     drawn from open-source fonts.
   ===================================================================== */
const OCR = { p: null, failed: false, err: '', bank: null, net: null, progress: null };
const OCR_N = 24, OCR_NN = 576, OCR_GEO = 5;
const OCR_CJKP = '。、《》【】「」～';

/* box → N×N coverage (area-averaged, lightly blurred), written into F at off; returns its norm.
   get(x, y) gives 0..255. Also fills the 8×8 coarse copy in C. */
function ocrNorm(get, x0, y0, w, h, F, off, C, coff, N) {
  N = N || OCR_N;
  const tmp = N === OCR_N ? ocrNorm.tmp || (ocrNorm.tmp = new Float32Array(OCR_NN)) : ocrNorm.tmp2 || (ocrNorm.tmp2 = new Float32Array(N * N));
  for (let j = 0; j < N; j++) {
    const sy0 = y0 + (j * h) / N, sy1 = y0 + ((j + 1) * h) / N;
    const ya = Math.floor(sy0), yb = Math.max(ya + 1, Math.ceil(sy1));
    for (let i = 0; i < N; i++) {
      const sx0 = x0 + (i * w) / N, sx1 = x0 + ((i + 1) * w) / N;
      const xa = Math.floor(sx0), xb = Math.max(xa + 1, Math.ceil(sx1));
      let acc = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) acc += get(x, y);
      tmp[j * N + i] = acc / ((yb - ya) * (xb - xa));
    }
  }
  let n2 = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let a = 0, c = 0;
      for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= N) continue; for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= N) continue; a += tmp[jj * N + ii]; c++; } }
      const v = Math.round(a / c);
      F[off + j * N + i] = v; n2 += v * v;
    }
  }
  if (C) for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    let a = 0;
    for (let dj = 0; dj < 3; dj++) for (let di = 0; di < 3; di++) a += F[off + (j * 3 + dj) * N + i * 3 + di];
    C[coff + j * 8 + i] = Math.round(a / 9);
  }
  return Math.sqrt(n2) || 1;
}

function ocrB64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

function ocrLoad(onProgress) {
  if (onProgress) OCR.progress = onProgress;
  if (OCR.p) return OCR.p;
  OCR.p = (async () => {
    const note = t => { if (OCR.progress) OCR.progress(t); };
    note('正在准备页面自带的识别（只在第一次）…');
    await tick();
    /* the Latin classifier: int8 weights, one row per output */
    if (typeof OCR_NET !== 'undefined') {
      const layers = OCR_NET.layers.map(l => { const w = ocrB64(l.w), b = ocrB64(l.b); return { nin: l.nin, n: l.n, scale: l.scale, w: new Int8Array(w.buffer), b: new Float32Array(b.buffer) }; });
      const cls = Array.from(OCR_NET.classes);
      OCR.net = { cls, iC: cls.indexOf('\u0001'), iJ: cls.indexOf('\u0002'), layers, gs: OCR_NET.gs, bufs: layers.map(l => new Float32Array(l.n)), x: new Float32Array(layers[0].nin) };
    }
    /* the Chinese templates, drawn in the device's own fonts */
    const CELL = 44, PX = 32, COLS = 56, ROWS = 8, BASE = 34, PADX = 6;
    const cv = document.createElement('canvas');
    cv.width = COLS * CELL; cv.height = ROWS * CELL;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.textBaseline = 'alphabetic'; cx.fillStyle = '#000';
    /* which weights and families really differ on this device */
    const probe = (font, ch) => { cx.clearRect(0, 0, CELL * 2, CELL); cx.font = font; cx.fillText(ch, PADX, BASE); const d = cx.getImageData(0, 0, CELL * 2, CELL).data; let hsh = 0; for (let i = 3; i < d.length; i += 4) hsh = (hsh * 31 + d[i]) % 1000003; return hsh; };
    const f = (w, fam) => w + ' ' + PX + 'px ' + fam;
    const han1 = Array.from(HANZI1), han2 = Array.from(HANZI2), cjkp = Array.from(OCR_CJKP);
    const nCommon = han1.length;
    const plans = [{ font: f(400, 'sans-serif'), chars: han1.concat(han2, cjkp) }];
    const s4 = probe(f(400, 'sans-serif'), '永'), s7 = probe(f(700, 'sans-serif'), '永');
    if (s7 !== s4) plans.push({ font: f(700, 'sans-serif'), chars: han1.concat(cjkp) });
    /* a Song face and a Kai face, where the device has them (the generic “serif” is often not a Song face) */
    const first = names => names.map(n => (n === 'serif' ? n : '"' + n + '", sans-serif')).find(n => probe(f(400, n), '永') !== s4);
    const song = first(['Songti SC', 'STSong', 'SimSun', 'Noto Serif CJK SC', 'Source Han Serif SC', 'Noto Serif SC', 'serif']);
    if (song) {
      plans.push({ font: f(400, song), chars: han1.concat(han2, cjkp) });
      if (probe(f(700, song), '永') !== probe(f(400, song), '永')) plans.push({ font: f(700, song), chars: han1 });
    }
    const kai = first(['Kaiti SC', 'STKaiti', 'KaiTi', 'AR PL UKai CN']);
    if (kai) plans.push({ font: f(400, kai), chars: han1 });
    let total = 0;
    for (const p of plans) total += p.chars.length;
    const B = { n: 0, F: new Uint8Array(total * OCR_NN), C: new Uint8Array(total * 64), nF: new Float32Array(total), nC: new Float32Array(total),
      lasp: new Float32Array(total), ch: new Array(total), rare: new Uint8Array(total), pl: new Uint8Array(total), fonts: plans.map(p => p.font.replace(PX + 'px', '64px')) };
    let done = 0;
    for (let pi = 0; pi < plans.length; pi++) {
      const p = plans[pi];
      for (let i0 = 0; i0 < p.chars.length; i0 += COLS * ROWS) {
        const part = p.chars.slice(i0, i0 + COLS * ROWS);
        cx.clearRect(0, 0, cv.width, cv.height);
        cx.font = p.font;
        for (let k = 0; k < part.length; k++) cx.fillText(part[k], (k % COLS) * CELL + PADX, Math.floor(k / COLS) * CELL + BASE);
        const W = cv.width, d = cx.getImageData(0, 0, W, cv.height).data;
        for (let k = 0; k < part.length; k++) {
          const ox = (k % COLS) * CELL, oy = Math.floor(k / COLS) * CELL;
          let x0 = CELL, x1 = -1, y0 = CELL, y1 = -1;
          for (let y = 0; y < CELL; y++) { const row = ((oy + y) * W + ox) * 4 + 3; for (let x = 0; x < CELL; x++) if (d[row + x * 4] >= 102) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
          if (x1 < 0) continue;
          const w = x1 - x0 + 1, h = y1 - y0 + 1, t = B.n++;
          B.nF[t] = ocrNorm((x, y) => d[((oy + y) * W + ox + x) * 4 + 3], x0, y0, w, h, B.F, t * OCR_NN, B.C, t * 64);
          let nc = 0;
          for (let q = 0; q < 64; q++) { const v = B.C[t * 64 + q]; nc += v * v; }
          B.nC[t] = Math.sqrt(nc) || 1;
          B.lasp[t] = Math.log(w / h); B.ch[t] = part[k]; B.pl[t] = pi; B.rare[t] = i0 + k >= nCommon && i0 + k < han1.length + han2.length ? 1 : 0;
        }
        done += part.length;
        note('正在准备页面自带的识别 ' + Math.round((done / total) * 100) + '%（只在第一次）');
        await tick();
      }
    }
    OCR.bank = B;
    return true;
  })().catch(e => { OCR.failed = true; OCR.err = String((e && e.message) || e); return false; });
  return OCR.p;
}
