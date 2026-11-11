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

/* nearest drawn Chinese characters for one observed glyph: o = { F, C, nF, lasp } → [{ ch, s }] best first */
function ocrCJK(o, K) {
  const B = OCR.bank, n = B.n, KC = 32, C = B.C, oc = o.C;
  const idx = new Int32Array(KC).fill(-1), sc = new Float32Array(KC).fill(-1);
  for (let t = 0; t < n; t++) {
    const la = B.lasp[t] - o.lasp;
    if (la > 0.55 || la < -0.55) continue;
    let s = 0;
    const base = t * 64;
    for (let q = 0; q < 64; q++) s += oc[q] * C[base + q];
    s /= B.nC[t];
    if (s <= sc[KC - 1]) continue;
    let k = KC - 1;
    while (k > 0 && sc[k - 1] < s) { sc[k] = sc[k - 1]; idx[k] = idx[k - 1]; k--; }
    sc[k] = s; idx[k] = t;
  }
  const out = [];
  for (let k = 0; k < KC; k++) {
    const t = idx[k];
    if (t < 0) break;
    let s = 0;
    const base = t * OCR_NN;
    for (let q = 0; q < OCR_NN; q++) s += o.F[q] * B.F[base + q];
    out.push({ ch: B.ch[t], t, s: s / (o.nF * B.nF[t]) - 0.3 * Math.abs(B.lasp[t] - o.lasp) - 0.02 * B.rare[t] });   // the rarer half of the set needs a little more evidence
  }
  out.sort((p, q) => q.s - p.s);
  const res = [], seen = new Set();
  for (const r of out) { if (seen.has(r.ch)) continue; seen.add(r.ch); res.push(r); if (res.length >= K) break; }
  return res;
}

/* Look-alike characters (折 析, 限 阻) differ in a stroke or two, too little for the small templates. Draw the leading
   candidates again, larger, in the face they matched in, and compare at twice the detail. han: [{ ch, t, cos }] → reordered. */
const OCR_FN = 44;
function ocrFine(an, b, r) {
  const B = OCR.bank, N = OCR_FN, w = an.w, A = an.alpha;
  const cand = r.han.filter(q => q.cos > r.han[0].cos - 0.05).slice(0, 5);
  if (cand.length < 2) return;
  const O = ocrFine.o || (ocrFine.o = new Uint8Array(N * N)), T = ocrFine.t || (ocrFine.t = new Uint8Array(N * N));
  const nO = ocrNorm((x, y) => { const v = A[(b.y0 + y) * w + b.x0 + x]; return v > 0 ? v * 255 : 0; }, r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1, O, 0, null, 0, N);
  const lo = Math.log((r.x1 - r.x0 + 1) / (r.y1 - r.y0 + 1));
  const CELL = 96, cv = ocrFine.cv || (ocrFine.cv = Object.assign(document.createElement('canvas'), { width: CELL * 5, height: CELL }));
  const cx = ocrFine.cx || (ocrFine.cx = cv.getContext('2d', { willReadFrequently: true }));
  cx.clearRect(0, 0, cv.width, CELL); cx.textBaseline = 'alphabetic'; cx.fillStyle = '#000';
  cand.forEach((q, k) => { cx.font = B.fonts[B.pl[q.t]]; cx.fillText(q.ch, k * CELL + 14, 72); });
  const d = cx.getImageData(0, 0, cv.width, CELL).data, W = cv.width;
  cand.forEach((q, k) => {
    const ox = k * CELL;
    let x0 = CELL, x1 = -1, y0 = CELL, y1 = -1;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (d[(y * W + ox + x) * 4 + 3] >= 102) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { q.fine = 0; return; }
    const nT = ocrNorm((x, y) => d[(y * W + ox + x) * 4 + 3], x0, y0, x1 - x0 + 1, y1 - y0 + 1, T, 0, null, 0, N);
    let dot = 0;
    for (let i = 0; i < N * N; i++) dot += O[i] * T[i];
    q.fine = dot / (nO * nT) - 0.3 * Math.abs(Math.log((x1 - x0 + 1) / (y1 - y0 + 1)) - lo) - 0.02 * B.rare[q.t];
  });
  cand.sort((p, q) => q.fine + q.cos - (p.fine + p.cos));
  cand.forEach(q => { q.close = cand[0].fine + cand[0].cos - (q.fine + q.cos) < 0.03; });   // a real rival, worth trying against the picture later
  r.han = cand.concat(r.han.filter(q => !cand.includes(q)));
}

/* the Latin classifier: F (N×N coverage) and geo → probabilities per class (two of the classes mean “Chinese” and “not one glyph”) */
function ocrNet(F, geo) {
  const net = OCR.net, x0 = net.x;
  for (let i = 0; i < OCR_NN; i++) x0[i] = F[i] / 255;
  for (let k = 0; k < OCR_GEO; k++) x0[OCR_NN + k] = geo[k] * net.gs;
  let x = x0;
  for (let li = 0; li < net.layers.length; li++) {
    const l = net.layers[li], y = net.bufs[li], w = l.w, nin = l.nin, last = li === net.layers.length - 1;
    for (let j = 0; j < l.n; j++) {
      let a = 0;
      const base = j * nin;
      for (let i = 0; i < nin; i++) a += w[base + i] * x[i];
      a = a * l.scale + l.b[j];
      y[j] = last || a > 0 ? a : 0;
    }
    x = y;
  }
  let m = -1e9;
  for (let j = 0; j < x.length; j++) if (x[j] > m) m = x[j];
  let z = 0;
  for (let j = 0; j < x.length; j++) { x[j] = Math.exp(x[j] - m); z += x[j]; }
  for (let j = 0; j < x.length; j++) x[j] /= z;
  return x;
}

/* connected pieces of ink in one line, left to right; pieces stacked above one another are one unit (i, ：, 三, 国).
   Each unit also carries the ids of the faint-ink blobs it lies in: two units of one id are joined by a hairline. */
function ocrUnits(an, b) {
  const w = an.w, bw = b.x1 - b.x0, bh = b.y1 - b.y0, A = an.alpha;
  const at = (x, y) => A[(b.y0 + y) * w + b.x0 + x];
  const flood = (lab, th, onComp) => {
    const stack = [];
    let id = 0;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (lab[y * bw + x] || at(x, y) < th) continue;
      const c = { x0: x, x1: x, y0: y, y1: y, n: 0, sx: x, sy: y };
      id++;
      lab[y * bw + x] = id; stack.push(y * bw + x);
      while (stack.length) {
        const p = stack.pop(), px = p % bw, py = (p - px) / bw;
        c.n++;
        if (px < c.x0) c.x0 = px; if (px > c.x1) c.x1 = px; if (py < c.y0) c.y0 = py; if (py > c.y1) c.y1 = py;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx, yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          const q = yy * bw + xx;
          if (!lab[q] && at(xx, yy) >= th) { lab[q] = id; stack.push(q); }
        }
      }
      if (onComp) onComp(c);
    }
  };
  const low = new Int32Array(bw * bh), comps = [], faint = [null];
  flood(low, 0.2, c => faint.push(c));
  flood(new Int32Array(bw * bh), 0.4, c => { const id = low[c.sy * bw + c.sx]; if (c.n >= 2) { c.low = [id]; comps.push(c); faint[id] = null; } });
  /* a thin hyphen or dash in small type never reaches full ink: keep faint marks that are long enough to be one */
  faint.forEach((c, id) => { if (c && c.n >= 4 && c.x1 - c.x0 + 1 >= Math.max(4, 0.25 * bh) && c.y1 - c.y0 + 1 <= 0.25 * bh) { c.low = [id]; comps.push(c); } });
  comps.sort((p, q) => p.x0 - q.x0);
  const units = [];
  for (const c of comps) {
    const u = units[units.length - 1];
    if (u) {
      const ov = Math.min(u.x1, c.x1) - Math.max(u.x0, c.x0) + 1;
      if (ov >= 0.5 * Math.min(u.x1 - u.x0 + 1, c.x1 - c.x0 + 1)) { u.x1 = Math.max(u.x1, c.x1); u.y0 = Math.min(u.y0, c.y0); u.y1 = Math.max(u.y1, c.y1); if (!u.low.includes(c.low[0])) u.low.push(c.low[0]); continue; }
    }
    units.push({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, low: c.low });
  }
  return units;
}
/* one box of a line (band coordinates, inclusive) → coverage in F/C, shape numbers in geo; returns the norm of F */
function ocrFeat(an, b, x0, y0, x1, y1, F, C, geo) {
  const w = an.w, A = an.alpha, H = b.y1 - b.y0, gw = x1 - x0 + 1, gh = y1 - y0 + 1;
  const nF = ocrNorm((x, y) => { const v = A[(b.y0 + y) * w + b.x0 + x]; return v > 0 ? v * 255 : 0; }, x0, y0, gw, gh, F, 0, C, 0);
  geo[0] = clamp(Math.log(gw / gh), -2.5, 2.5); geo[1] = y0 / H; geo[2] = (H - (y1 + 1)) / H; geo[3] = gh / H; geo[4] = Math.min(gw / H, 3);
  return nF;
}

const OCR_DIG = { O: '0', o: '0', D: '0', Q: '0', l: '1', I: '1', '|': '1', i: '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', b: '6', g: '9', q: '9' };
const OCR_FW = { ',': '，', ':': '：', ';': '；', '!': '！', '?': '？', '(': '（', ')': '）' };
const OCR_CASE = 'cosuvwxz';
const isHan = ch => /[㐀-鿿]/.test(ch);
const ocrMed = a => (a.length ? a.slice().sort((p, q) => p - q)[a.length >> 1] : null);

/* a blob that is not one glyph (letters that touch): split it at its thinnest columns */
function ocrCut(an, b, u) {
  const w = an.w, A = an.alpha, H = b.y1 - b.y0, n = u.x1 - u.x0 + 1;
  const ink = (x, y) => A[(b.y0 + y) * w + b.x0 + u.x0 + x] >= 0.4;
  const col = new Float32Array(n);
  let mx = 0;
  for (let x = 0; x < n; x++) { let c = 0; for (let y = u.y0; y <= u.y1; y++) if (ink(x, y)) c++; col[x] = c; if (c > mx) mx = c; }
  const edge = Math.max(2, Math.round(0.1 * H)), sep = Math.max(3, Math.round(0.14 * H)), cand = [];
  for (let x = edge; x < n - edge; x++) {
    if (col[x] > 0.36 * mx) continue;
    let low = true;
    for (let d = -2; d <= 2; d++) if (col[x + d] < col[x]) low = false;
    if (low) cand.push(x);
  }
  cand.sort((p, q) => col[p] - col[q]);
  const cuts = [];
  for (const x of cand) { if (cuts.length >= 4) break; if (cuts.every(c => Math.abs(c - x) >= sep)) cuts.push(x); }
  if (!cuts.length) return null;
  cuts.sort((p, q) => p - q);
  const edges = [0].concat(cuts, [n]), pieces = [];
  for (let k = 0; k + 1 < edges.length; k++) {
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let x = edges[k]; x < edges[k + 1]; x++) for (let y = u.y0; y <= u.y1; y++) if (ink(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= 0) pieces.push({ x0: u.x0 + x0, x1: u.x0 + x1, y0, y1, low: u.low });
  }
  return pieces.length > 1 ? pieces : null;
}

const OCR_ALIKE = ['oO0', 'lI1|', 'cC', 'sS', 'vV', 'wW', 'xX', 'zZ', 'uU', 'kK', 'pP', "',", '.·', '-–—_'];
/* one line of the selection → glyphs with their best characters, left to right */
function ocrReadBand(an, b) {
  const H = b.y1 - b.y0, net = OCR.net;
  let units = ocrUnits(an, b);
  if (!units.length || units.length > 400) return [];
  const F = new Uint8Array(OCR_NN), C = new Uint8Array(64), geo = new Float32Array(OCR_GEO);
  /* a box → its readings: Latin from the classifier, Chinese from the drawn templates.
     glL / glK say how surely the box is one Latin glyph / one Chinese character at all; each reading's s how surely it is that one. */
  const cache = new Map();
  const cls = (x0, y0, x1, y1, key) => {
    let r = key != null && cache.get(key);
    if (r) return r;
    const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
    const nF = ocrFeat(an, b, x0, y0, x1, y1, F, C, geo);
    r = { lat: [], han: [], glL: 0, glK: 0, pPct: 0, pc: 1, pj: 0, cos: 0, x0, y0, x1, y1 };
    if (net) {
      const p = ocrNet(F, geo);
      r.pc = p[net.iC]; r.pj = p[net.iJ]; r.glL = 1 - r.pc - r.pj;
      const ord = [];
      for (let j = 0; j < p.length; j++) { if (j === net.iC || j === net.iJ) continue; if (p[j] > 0.02) ord.push(j); if (net.cls[j] === '%') r.pPct = p[j]; }
      ord.sort((u, v) => p[v] - p[u]);
      for (const j of ord.slice(0, 4)) r.lat.push({ ch: net.cls[j], s: p[j], lat: 1 });
      if (r.lat.length) {                       // how sure of the character, look-alikes counted together
        const grp = OCR_ALIKE.find(g => g.includes(r.lat[0].ch));
        r.sL = grp ? r.lat.filter(q => grp.includes(q.ch)).reduce((a, q) => a + q.s, 0) : r.lat[0].s;
      }
    }
    if ((r.pc > 0.03 || !net) && gh >= 0.2 * H) {
      for (const q of ocrCJK({ F, C, nF, lasp: Math.log(gw / gh) }, 6)) r.han.push({ ch: q.ch, t: q.t, s: clamp((q.s - 0.8) / 0.15, 0, 1), cos: q.s, lat: 0 });
      if (r.han.length) { r.cos = r.han[0].cos; r.glK = (net ? r.pc : 1) * (0.85 + 0.15 * r.han[0].s); }
    }
    if (key != null) cache.set(key, r);
    return r;
  };
  if (net) {
    const u2 = [];
    for (const u of units) {
      if (u.x1 - u.x0 + 1 > 0.3 * H) {
        const r = cls(u.x0, u.y0, u.x1, u.y1, null);
        if (r.pj >= 0.4 && r.cos < 0.9) { const ps = ocrCut(an, b, u); if (ps) { for (const q of ps) u2.push(q); continue; } }
      }
      u2.push(u);
    }
    units = u2;
  }
  const m = units.length;
  /* group neighbouring pieces into glyphs so that the whole line reads best (川 is three pieces, rn is two letters).
     Pieces with nothing between them, not even a hairline, cannot be one Latin letter (only %), but can be one Chinese character.
     In a line that has Chinese, a box that matches a drawn character well is taken as that character. */
  const strongLat = units.map(u => (net ? (cls(u.x0, u.y0, u.x1, u.y1, null).sL || 0) >= 0.8 : false));
  const run = (zh, hanH) => {
    const best = new Float64Array(m + 1).fill(-1e9), from = new Int32Array(m + 1), pick = new Array(m + 1);
    best[0] = 0;
    for (let i = 0; i < m; i++) {
      if (best[i] < -1e8) continue;
      let x0 = units[i].x0, x1 = units[i].x1, y0 = units[i].y0, y1 = units[i].y1, apart = false, lows = units[i].low, allLat = true;
      for (let j = i; j < Math.min(m, i + 8); j++) {
        if (j > i) {
          const u = units[j];
          if (u.x0 - x1 > 0.42 * H) break;
          if (!u.low.some(id => lows.includes(id))) apart = true; else lows = lows.concat(u.low);
          x1 = Math.max(x1, u.x1); y0 = Math.min(y0, u.y0); y1 = Math.max(y1, u.y1);
          if (x1 - x0 + 1 > 1.35 * H) break;
        }
        const r = cls(x0, y0, x1, y1, i * 1000 + j);
        if (!strongLat[j]) allLat = false;
        const gL = apart ? (r.pPct >= 0.5 ? Math.max(r.pPct, 0.93) : r.pPct) : r.sL || 0;
        let gK = r.glK;
        if (zh && y1 - y0 + 1 >= 0.7 * hanH && x1 - x0 + 1 <= 1.15 * hanH) {
          /* Chinese characters stand one square apart: a box that straddles two squares next to a sure character is not one */
          const c = (x0 + x1 + 1) / 2;
          let dd = 9;
          for (const sc of zh) dd = Math.min(dd, Math.abs(c - sc) / (hanH / 0.92));
          if ((dd > 0.06 && dd < 0.7) || (dd > 1.3 && dd < 1.6)) gK *= 0.7;
          else if (r.cos >= (allLat ? 0.93 : 0.87) && (apart || r.pc >= 0.25 || (r.cos >= 0.93 && y1 - y0 + 1 >= 0.86 * hanH))) gK = Math.max(gK, 0.95);
          else if (apart && !allLat && r.pc >= 0.5 && x1 - x0 + 1 >= 0.6 * hanH) gK = Math.max(gK, 0.9);
        }
        /* pieces that each read well as a letter, digit or mark are a run of those unless the whole matches a character closely */
        if (allLat && j > i && r.cos < 0.93) gK *= 0.6;
        const gl = Math.max(gL, gK), v = (gl - 0.5) * ((x1 - x0 + 1) / H) - 0.03;
        if (best[i] + v > best[j + 1]) { best[j + 1] = best[i] + v; from[j + 1] = i; pick[j + 1] = { r, lat: gL >= gK, apart }; }
      }
    }
    const gs = [];
    for (let j = m; j > 0; j = from[j]) { if (!pick[j]) return []; gs.push(pick[j]); }
    return gs.reverse();
  };
  let glyphs = run(false, 0);
  const sureHan = glyphs.filter(g => !g.lat && g.r.cos >= 0.9 && g.r.pc >= 0.3);
  const hanSize = sureHan.length ? ocrMed(sureHan.map(g => Math.max(g.r.y1 - g.r.y0, g.r.x1 - g.r.x0) + 1)) : 0;
  if (net && sureHan.length) glyphs = run(sureHan.map(g => (g.r.x0 + g.r.x1 + 1) / 2), hanSize);
  const out = [];
  for (const g of glyphs) {
    const r = g.r, lat = g.apart ? r.lat.filter(q => q.ch === '%') : r.lat;
    if (!g.lat && r.han.length > 1) ocrFine(an, b, r);
    const first = g.lat ? lat : r.han, top = first.concat(g.lat ? r.han : lat);
    if (!top.length) {                    // ink that is no character this reader knows: mark the place rather than leave a hole
      if (r.x1 - r.x0 + 1 >= 0.25 * H && r.y1 - r.y0 + 1 >= 0.4 * H) out.push({ ch: '?', s: 0, lat: 1, top: [], x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 });
      continue;
    }
    out.push({ ch: top[0].ch, s: g.lat ? (g.apart ? r.pPct : r.sL) : r.han[0].s, lat: top[0].lat, top, x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 });
  }
  const n = out.length, near = (i, j) => out[j].x0 - out[i].x1 - 1 < 0.25 * H;
  const alt = (g, ch) => g.top.find(t => t.ch === ch);

  /* --- what shape alone cannot settle, the neighbours do --- */
  /* a simple Chinese character or its Latin look-alike (一 —, 口 O, 十 +): side with the line */
  const nHan = out.filter(g => !g.lat && g.s > 0.5).length;
  for (let i = 0; i < n; i++) {
    const g = out[i], o = g.top.find(q => q.lat !== g.lat);
    const nb = [out[i - 1], out[i + 1]].filter(Boolean), hanNb = nb.filter(q => !q.lat && q.s > 0.5).length;
    if (!g.lat && g.ch === '一') {                       // a bar: a dash unless Chinese stands on both sides
      if (hanNb < nb.length || !nb.length) { const wd = (g.x1 - g.x0 + 1) / H; g.ch = wd >= 0.75 ? '—' : wd >= 0.42 ? '–' : '-'; g.lat = 1; }
      continue;
    }
    if (!o || o.s < 0.25) continue;
    if (!g.lat && nHan <= 1 && g.s < 0.9) { g.ch = o.ch; g.lat = 1; g.s = o.s; }
    else if (g.lat && nb.length && hanNb === nb.length && o.s > 0.6 && g.s < 0.8 && /[A-Za-z]/.test(g.ch)) { g.ch = o.ch; g.lat = 0; g.s = o.s; }
  }
  /* digits and the letters that look like them: a run of number-like characters is read as numbers, a digit alone among letters as a letter */
  for (let i = 0; i < n;) {
    let j = i;
    while (j < n && out[j].lat && /[A-Za-z0-9:.,\-–\/%$¥€£#+]/.test(out[j].ch) && (j === i || near(j - 1, j))) j++;
    if (j === i) { i++; continue; }
    const run = out.slice(i, j), isD = q => /\d/.test(q.ch), isL = q => /[A-Za-z]/.test(q.ch);
    const dgt = q => OCR_DIG[q.ch] && (/^[OolI|]$/.test(q.ch) || (alt(q, OCR_DIG[q.ch]) && alt(q, OCR_DIG[q.ch]).s >= 0.06));   // a letter that may well be a digit
    const sureL = run.filter(q => isL(q) && !dgt(q)).length, nd = run.filter(isD).length;
    if (nd && !sureL) {
      for (const q of run) if (dgt(q)) { q.was = q.ch; q.ch = OCR_DIG[q.ch]; }
    } else if (sureL) {
      /* among several digits, an o or l that touches a digit is a digit too (A2o26 → A2026) */
      if (nd >= 2) {
        for (let pass = 0; pass < 2; pass++) for (let k = pass ? run.length - 1 : 0; pass ? k >= 0 : k < run.length; k += pass ? -1 : 1) {
          const q = run[k], nb = run[k + (pass ? 1 : -1)];
          if (/^[OolI|]$/.test(q.ch) && nb && isD(nb)) { q.was = q.ch; q.ch = OCR_DIG[q.ch]; }
        }
      }
      /* zeros and ones with letters on both sides (G00DS), or opening a word (0rder), are letters */
      for (let k = 0; k < run.length;) {
        let e = k;
        while (e < run.length && /[01]/.test(run[e].ch)) e++;
        if (e === k) { k++; continue; }
        const p = run[k - 1], r = run[e], r2 = run[e + 1];
        if ((p && isL(p) && r && isL(r)) || (!p && r && isL(r) && r2 && isL(r2))) {
          for (let t = k; t < e; t++) {
            const q = run[t];
            if (q.ch === '0') { q.was = '0'; q.ch = 'O'; }
            else { const a = q.top.find(a => /[lI]/.test(a.ch)); q.was = '1'; q.ch = a ? a.ch : 'l'; }
          }
        }
        k = e;
      }
    }
    i = j;
  }
  /* capital or small letter: by height above the baseline, measured against letters that have only one form */
  let em = H;
  {
    const an1 = q => q.lat && /[A-Za-z0-9]/.test(q.ch) && q.s > 0.5;
    const base = ocrMed(out.filter(q => an1(q) && !/[gjpqyQJ]/.test(q.ch)).map(q => q.y1 + 1));
    if (base != null) {
      const hg = q => base - q.y0;
      let xH = ocrMed(out.filter(q => an1(q) && /[aemnrgpqy]/.test(q.ch)).map(hg));
      let capH = ocrMed(out.filter(q => an1(q) && /[ABDEFGHKLMNRTbdfhk]/.test(q.ch)).map(hg));
      if (capH == null && xH == null) capH = ocrMed(out.filter(q => an1(q) && /[2-9]/.test(q.ch)).map(hg));
      if (xH != null && capH != null && xH > 0.9 * capH) xH = null;         // small capitals: everything is capital height
      em = capH != null ? capH / 0.71 : xH != null ? xH / 0.5 : H;
      for (const q of out) {
        if (!q.lat) continue;
        const lo = q.ch.toLowerCase(), isO = /[O0o]/.test(q.ch);
        if (!(OCR_CASE.includes(lo) && lo !== q.ch.toUpperCase()) && !isO) continue;
        if (q.ch === '0' && !q.was && out.some(t => t !== q && /\d/.test(t.ch) && Math.abs(t.x0 - q.x0) < 2.5 * H)) continue;   // a real zero among digits
        const h = hg(q);
        let low = null;
        if (xH != null && capH != null) low = Math.abs(h - xH) < Math.abs(h - capH);
        else if (capH != null) low = h < 0.84 * capH ? true : h > 0.9 * capH ? false : null;
        else if (xH != null) low = h > 1.15 * xH ? false : h < 1.08 * xH ? true : null;
        if (low == null) continue;
        if (isO) q.ch = low ? 'o' : q.ch === 'o' ? 'O' : q.ch;
        else q.ch = low ? lo : lo.toUpperCase();
      }
    }
  }
  /* l, I and the bar: inside a word, small after a small letter, capital between capitals */
  for (let i = 0; i < out.length; i++) {
    const q = out[i];
    if (!q.lat || !/^[lI|]$/.test(q.ch)) continue;
    const p = i > 0 && near(i - 1, i) ? out[i - 1] : null, r = i + 1 < out.length && near(i, i + 1) ? out[i + 1] : null;
    if (p && p.lat && /[a-z]/.test(p.ch)) q.ch = 'l';
    else if (r && r.lat && /[A-Z]/.test(r.ch) && !(p && p.lat && /[a-z]/.test(p.ch))) q.ch = 'I';
    else if (p && p.lat && /[A-Z]/.test(p.ch) && !(r && r.lat && /[a-z]/.test(r.ch))) q.ch = 'I';
    else if (!p && !r) {                                  // widely spaced letters: go by the rest of the line
      const others = out.filter(t => t !== q && t.lat && /^[A-Za-z]$/.test(t.ch) && !/[lI]/.test(t.ch));
      if (others.length >= 2 && others.every(t => /[A-Z]/.test(t.ch))) q.ch = 'I';
    }
  }
  /* hyphen, en dash, em dash: by length */
  {
    const e = hanSize ? hanSize / 0.92 : em, base = ocrMed(out.filter(q => q.lat && /[A-Za-z0-9]/.test(q.ch) && !/[gjpqyQJ]/.test(q.ch)).map(q => q.y1 + 1));
    for (const q of out) {
      if (!q.lat) continue;
      if (/[-–—]/.test(q.ch)) { const wd = (q.x1 - q.x0 + 1) / e; q.ch = wd < 0.4 ? '-' : wd < 0.7 ? '–' : '—'; }
      /* full stop or middle dot: by where it sits */
      else if (/[.·]/.test(q.ch)) { const cy = (q.y0 + q.y1 + 1) / 2; q.ch = (base != null ? base - cy >= 0.16 * e : cy < 0.72 * H) ? '·' : '.'; }
    }
  }
  /* two apostrophes side by side are one double quote */
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i].ch === "'" && out[i + 1].ch === "'" && out[i + 1].x0 - out[i].x1 < 0.14 * H) { out[i].ch = '"'; out[i].x1 = out[i + 1].x1; out.splice(i + 1, 1); }
  }
  /* runners-up worth trying against the picture later: real shape rivals, not the pairs that height and context have just settled */
  for (const g of out) g.alts = g.top.filter(q => q.ch !== g.ch && (q.lat ? q.s >= 0.25 : q.close) && q.ch.toLowerCase() !== g.ch.toLowerCase() && !(/^[oO0]$/.test(q.ch) && /^[oO0]$/.test(g.ch)) && !(/^[-–—.·]$/.test(q.ch) && /^[-–—.·]$/.test(g.ch))).slice(0, 3).map(q => q.ch);
  out.em = Math.min(em, 1.6 * H);
  return out;
}

/* glyphs of one line → its text. Spaces come from the gaps in the picture: a gap counts as a space when it is clearly
   wider than the ordinary gaps of the same line (so letter-spaced text gets none). Doubtful gaps and close runners-up
   are returned as positions in the text; the font fit settles them later. */
function ocrCompose(b, gl) {
  const H = b.y1 - b.y0, n = gl.length;
  const gap = i => gl[i + 1].x0 - gl[i].x1 - 1, an1 = g => g.lat && /[A-Za-z0-9]/.test(g.ch);
  const gL = [], gH = [];
  for (let i = 0; i + 1 < n; i++) { if (an1(gl[i]) && an1(gl[i + 1])) gL.push(gap(i)); if (isHan(gl[i].ch) && isHan(gl[i + 1].ch)) gH.push(gap(i)); }
  const em = gl.em || H;
  const mL = gL.length >= 3 ? ocrMed(gL) : 0.07 * em, mH = gH.length >= 2 ? ocrMed(gH) : 0.08 * H;
  /* a 1 often stands in a wide box of its own: learn the room on its left and right from the digits of this line */
  let bL = null, bR = null, b11 = null;
  for (let i = 0; i + 1 < n; i++) {
    const a = gl[i].ch, c = gl[i + 1].ch;
    if (!/\d/.test(a) || !/\d/.test(c)) continue;
    if (a === '1' && c === '1') b11 = b11 == null ? gap(i) : Math.min(b11, gap(i));
    else if (c === '1') bL = bL == null ? gap(i) : Math.min(bL, gap(i));
    else if (a === '1') bR = bR == null ? gap(i) : Math.min(bR, gap(i));
  }
  if (b11 != null) { if (bL == null && bR == null) bL = bR = b11 / 2; else if (bL == null) bL = Math.max(0, b11 - bR); else if (bR == null) bR = Math.max(0, b11 - bL); }
  const room1 = (a, c) => (c.ch === '1' && bL != null ? bL : 0) + (a.ch === '1' && bR != null ? bR : 0);
  const hanW = ocrMed(gl.filter(g => isHan(g.ch)).map(g => g.x1 - g.x0 + 1)) || H;
  /* punctuation set full-width, as Chinese text has it: it takes a whole square, most of it empty */
  for (let i = 0; i < n; i++) {
    const g = gl[i], p = gl[i - 1], q = gl[i + 1];
    if (!g.lat || !((p && isHan(p.ch)) || (q && isHan(q.ch)))) continue;
    if (OCR_FW[g.ch]) {
      const wd = g.x1 - g.x0 + 1, lg = p ? g.x0 - p.x1 - 1 : null, rg = q ? q.x0 - g.x1 - 1 : null;
      const full = lg != null && rg != null ? lg + wd + rg >= 0.62 * hanW : /[()]/.test(g.ch) ? false : (lg != null ? lg : rg) >= 0.2 * hanW;
      if (full) { g.ch = OCR_FW[g.ch]; g.fw = 1; }
    } else if (g.ch === '"' || g.ch === "'") {
      const open = q && isHan(q.ch) && !(p && (isHan(p.ch) || an1(p)));
      g.ch = g.ch === '"' ? (open ? '“' : '”') : open ? '‘' : '’'; g.fw = 1;
    }
  }
  /* typewriter faces: every character stands on a grid of one step, a space is a skipped step */
  const ctr = g => (g.x0 + g.x1 + 1) / 2;
  let grid = null;
  if (n >= 8 && gl.every(g => g.lat && !g.fw)) {
    const cs = gl.map(ctr), ds = [];
    for (let i = 0; i + 1 < n; i++) ds.push(cs[i + 1] - cs[i]);
    const P0 = ocrMed(ds);
    let bE = 1e9, bP = 0, bM = 0;
    for (let k = -48; k <= 48; k++) {
      const Pk = P0 * (1 + k * 0.0025), r = cs.map(c => { const q = (c - cs[0]) / Pk; return (q - Math.round(q)) * Pk; }), md = ocrMed(r);
      let e = 0;
      for (const v of r) e += Math.abs(v - md);
      e /= n * Pk;
      if (e < bE) { bE = e; bP = Pk; bM = md; }
    }
    if (bE < 0.05) {
      const k = cs.map(c => Math.round((c - cs[0] - bM) / bP)), one = [];
      for (let i = 0; i + 1 < n; i++) if (k[i + 1] - k[i] === 1) one.push(cs[i + 1] - cs[i]);
      const mu = one.reduce((a, v) => a + v, 0) / (one.length || 1), sd = Math.sqrt(one.reduce((a, v) => a + (v - mu) * (v - mu), 0) / (one.length || 1));
      if (one.length >= 6 && sd < 0.055 * bP && k.every((v, i) => !i || v > k[i - 1])) grid = k;
    }
  }
  const mono = !!grid;
  /* Chinese characters stand in squares of one size; measure gaps from the square, not from the ink */
  const dH = [];
  for (let i = 0; i + 1 < n; i++) if (isHan(gl[i].ch) && isHan(gl[i + 1].ch)) dH.push(ctr(gl[i + 1]) - ctr(gl[i]));
  const hans = gl.filter(g => isHan(g.ch));
  const P = dH.length >= 2 ? Math.min(ocrMed(dH), 1.3 * hanW) : hans.length ? Math.max(...hans.map(g => Math.max(g.x1 - g.x0 + 1, g.y1 - g.y0 + 1))) / 0.9 : H;
  let t = '';
  const maybe = [], slots = [];
  for (let i = 0; i < n; i++) {
    const a = gl[i];
    if (a.alts && a.alts.length) slots.push({ i: t.length, alts: a.alts });
    t += a.ch;
    if (i + 1 >= n) break;
    const c = gl[i + 1], ha = isHan(a.ch), hc = isHan(c.ch);
    let d = gap(i), need;
    if (a.fw || c.fw || OCR_CJKP.includes(a.ch) || OCR_CJKP.includes(c.ch)) need = 1.3 * H;
    else if (ha && hc) { d = ctr(c) - ctr(a); need = 1.21 * P; }
    else if (ha || hc) { d = ha ? c.x0 - (ctr(a) + P / 2) : ctr(c) - P / 2 - a.x1 - 1; need = 0.17 * P; }
    else if (mono) { d = grid[i + 1] - grid[i]; need = 2; }
    else {
      need = Math.max(1.7 * mL + 0.02 * em, Math.min(0.17 * em, mL + 0.11 * em));   // slanted letters overlap, so their gaps are smaller
      if ((a.ch === 'I' && /^[A-Z]$/.test(c.ch)) || (c.ch === 'I' && /^[A-Z]$/.test(a.ch))) need += 0.05 * em;   // a capital I carries extra room on both sides
      if (c.ch === 'j') d += 0.08 * em;                 // the tail of j reaches back under its neighbour
      if (a.ch === 'f') d += 0.04 * em;
    }
    if (!mono && !(ha && hc) && room1(a, c)) need = ha || hc ? need + room1(a, c) : Math.max(need, room1(a, c) + 0.11 * em);
    if (!mono && a.lat && c.lat && (/^[,.;:!?)\]}%]$/.test(c.ch) || /^[(\[{$#@]$/.test(a.ch))) need = Math.max(need, 0.45 * em);   // type does not put a space there
    if (!mono && /^[.,:]$/.test(a.ch) && /\d/.test(c.ch) && i > 0 && /\d/.test(gl[i - 1].ch)) need = Math.max(need, 0.45 * em);          // nor inside a number: 2.4, 1,284, 10:30
    if (d >= need) t += ' ';
    else if (!mono && !(ha && hc) && d >= 0.72 * need && need < H) maybe.push(t.length);
  }
  return { text: t, maybe, slots };
}
/* full-width and half-width forms look alike to the reader; the font fit tells them apart */
const WIDTH_PAIRS = [['￥', '¥'], ['：', ':'], ['，', ','], ['；', ';'], ['！', '!'], ['？', '?'], ['（', '('], ['）', ')'], ['％', '%']];
function widthVariants(t) {
  let half = t, full = t;
  for (const [f, h] of WIDTH_PAIRS) { half = half.split(f).join(h); if (/[㐀-鿿]/.test(t)) full = full.split(h).join(f); }
  return [...new Set([half, full])].filter(v => v !== t);
}
/* other spellings of a line worth trying against the picture: width forms, and a space at each doubtful gap */
/* characters the reader cannot tell apart by shape alone; the font fit picks among them, position by position */
const ALIKE = [['—', '–', '-', '－', '一'], ['￥', '¥'], ['·', '•', '・']];
function alikeSlots(t) {
  const out = [];
  const zh = /[\u3400-\u9fff]/.test(t);                 // full-width forms and 一 only where the line has Chinese
  Array.from(t).forEach((ch, i) => { const g = ALIKE.find(a => a.includes(ch)); if (g && out.length < 4) { const alts = g.filter(x => x !== ch && (zh || !/[－一￥・]/.test(x))); if (alts.length) out.push({ i, alts }); } });
  return out;
}
function textVariants(t, maybe) {
  const out = widthVariants(t).map(v => ({ t: v, margin: 0.012 }));
  const ins = (str, idxs) => { let o = str; for (const k of idxs.slice().sort((p, q) => q - p)) o = o.slice(0, k) + ' ' + o.slice(k); return o; };
  const pts = [...new Set((maybe || []).filter(k => k > 0 && k < t.length))].slice(0, 4);
  if (Array.from(t).length === t.length) { for (const k of pts) out.push({ t: ins(t, [k]), margin: 0.025 }); if (pts.length > 1) out.push({ t: ins(t, pts), margin: 0.025 }); }
  const seen = new Set([t]);
  return out.filter(v => !seen.has(v.t) && seen.add(v.t));
}
/* every line of an analysed selection → { text, conf, maybe, slots } */
function ocrReadLines(an, bands) {
  const lines = [], maybe = [], slots = [];
  let sum = 0, cnt = 0, low = 0;
  for (const b of bands) {
    const gl = ocrReadBand(an, b);
    if (!gl.length) continue;
    for (const g of gl) { sum += g.s; cnt++; if (g.s < 0.5) low++; }
    const g = ocrCompose(b, gl);
    if (g.text) { lines.push(g.text); maybe.push(g.maybe); slots.push(g.slots); }
  }
  const conf = cnt ? sum / cnt : 0;
  /* far from every known character: a face this reader does not know (brush, script, display). Better to say so than to guess. */
  if (conf < OCR_MIN || low > 0.22 * cnt) return { text: '', conf, maybe: [], slots: [], raw: lines.join('\n') };
  return { text: lines.join('\n'), conf, maybe: lines.length === 1 ? maybe[0] : [], slots: lines.length === 1 ? slots[0] : [] };
}
const OCR_MIN = 0.72;
/* read the selection on the device; null when the reader cannot run */
async function readLocal(ed) {
  const ok = await ocrLoad(t => { if (S.edit === ed) setStatus(t); });
  if (!ok || S.edit !== ed) return null;
  setStatus('正在读出框里的文字…');
  await tick(); await tick();
  if (S.edit !== ed) return null;
  return ocrReadLines(ed.an, ed.bands);
}
