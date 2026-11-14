/* =====================================================================
   reader/classify.js — what one box of ink is: the nearest Chinese characters among the drawn templates,
   or the Latin character the classifier sees in it. (How a line is cut into boxes is line.js.)
   ===================================================================== */
/* Nearest drawn Chinese characters for one observed glyph: o = { F, C, nF, lasp } → the K best [{ ch, t: template, s: likeness }].
   The 8×8 copies pick the 32 most alike among templates of similar proportions; the full 24×24 pictures rank those. */
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
