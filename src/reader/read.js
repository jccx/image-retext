/* =====================================================================
   reader/read.js — the reader's two jobs: the text of a selection, and the lines of text in a whole picture.
   ===================================================================== */
/* Every line of an analysed selection → { text, conf: how sure on average, maybe, slots } (maybe and slots as ocrCompose gives
   them, for a single line). When the type is not of a kind this reader knows, text is '' and raw holds its best guess. */
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
/* below this average likeness the reader says nothing rather than guess */
const OCR_MIN = 0.72;

/* ---------- a whole picture: where its lines of text are, and what they say ----------
   Used to make text in pictures and scans findable (app/find.js). The lines are found from the edges in a reduced copy
   of the picture (strokes of type make many short edges close together); every line is then read like a selection. */
/* ctx: the picture (W×H). areas: rectangles to look in, or null for everywhere. → [{ x, y, w, h }] line boxes, picture pixels */
function ocrFindLines(ctx, W, H, areas) {
  const k = Math.max(1, Math.round(Math.max(W, H) / 1200)), w = Math.floor(W / k), h = Math.floor(H / k);
  if (w < 8 || h < 8) return [];
  const d = ctx.getImageData(0, 0, w * k, h * k).data, g = new Float32Array(w * h), kk = k * k;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let dy = 0; dy < k; dy++) { let p = ((y * k + dy) * w * k + x * k) * 4; for (let dx = 0; dx < k; dx++, p += 4) sum += 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]; }
    g[y * w + x] = sum / kk;
  }
  /* edges, kept only inside the areas, then closed up sideways so that the strokes of a word hang together */
  const E = new Uint8Array(w * h), inArea = (x, y) => !areas || areas.some(a => x * k >= a.x && x * k < a.x + a.w && y * k >= a.y && y * k < a.y + a.h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + w] - g[i - w]) > 44 && inArea(x, y)) E[i] = 1;
  }
  const M = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (E[i] || (x > 0 && E[i - 1]) || (x < w - 1 && E[i + 1]) || (x > 1 && E[i - 2] && x < w - 2 && E[i + 2])) M[i] = 1; }
  /* connected pieces */
  const lab = new Int32Array(w * h), blobs = [], stack = [];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!M[s0] || lab[s0]) continue;
    const id = blobs.length + 1, b = { x0: w, y0: h, x1: 0, y1: 0, n: 0 };
    stack.push(s0); lab[s0] = id;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      b.n++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      if (x > 0 && M[i - 1] && !lab[i - 1]) { lab[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && M[i + 1] && !lab[i + 1]) { lab[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && M[i - w] && !lab[i - w]) { lab[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && M[i + w] && !lab[i + w]) { lab[i + w] = id; stack.push(i + w); }
    }
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    if (b.n >= 3 && bh >= 3 && bh <= 0.22 * h && bw <= 0.98 * w) blobs.push(b); else blobs.push(null);
  }
  /* pieces side by side at one height make a line */
  const lines = [];
  for (const b of blobs.filter(Boolean).sort((p, q) => p.x0 - q.x0)) {
    const bh = b.y1 - b.y0 + 1, cy = (b.y0 + b.y1) / 2;
    let best = null, bestGap = 1e9;
    for (const L of lines) {
      const lh = L.y1 - L.y0 + 1, gap = b.x0 - L.x1;
      if (cy < L.y0 - 0.15 * lh || cy > L.y1 + 0.15 * lh || bh > 1.9 * lh || (bh < 0.3 * lh && gap > 0.6 * lh) || gap > 1.5 * Math.max(lh, bh) || gap < -0.5 * lh) continue;
      if (gap < bestGap) { best = L; bestGap = gap; }
    }
    if (best) { best.x1 = Math.max(best.x1, b.x1); best.y0 = Math.min(best.y0, b.y0); best.y1 = Math.max(best.y1, b.y1); best.n++; }
    else lines.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, n: 1 });
  }
  const out = [];
  for (const L of lines) {
    const lw = (L.x1 - L.x0 + 1) * k, lh = (L.y1 - L.y0 + 1) * k;
    if (lh < 11 || lw < 1.4 * lh) continue;
    /* little room above and below: the next line may be close */
    const px = 0.45 * lh, py = 0.14 * lh + 2, x = Math.max(0, Math.floor(L.x0 * k - px)), y = Math.max(0, Math.floor(L.y0 * k - py));
    out.push({ x, y, w: Math.min(W, Math.ceil((L.x1 + 1) * k + px)) - x, h: Math.min(H, Math.ceil((L.y1 + 1) * k + py)) - y });
  }
  return out.sort((p, q) => p.y - q.y || p.x - q.x).slice(0, 500);
}
/* read the text lines of a picture → [{ c: [character…], b: Float32Array(x0, x1, y0, y1 per character), ocr: true }]
   skip(box): true for a line that needs no reading (the file has text there). tickFn: called now and then so the page stays alive. */
async function ocrPage(ctx, W, H, areas, skip, tickFn, fold) {
  const out = [];
  let n = 0;
  for (const r of ocrFindLines(ctx, W, H, areas)) {
    if (skip && skip(r)) continue;
    if (++n % 3 === 0 && tickFn) { if ((await tickFn()) === false) return null; }
    let an;
    try { an = analyzeRegion(ctx.getImageData(r.x, r.y, r.w, r.h), null); } catch (e) { continue; }
    if (!an.found) continue;
    for (const b of findBands(an.alpha, an.w, an.h, 0)) {
      const gl = ocrReadBand(an, b);
      if (gl.length < 2) continue;
      let sum = 0, low = 0;
      for (const q of gl) { sum += q.s; if (q.s < 0.5) low++; }
      if (sum / gl.length < OCR_MIN || low > 0.22 * gl.length) continue;          // not type this reader knows: better nothing than a guess
      const c = [], bx = [];
      for (const q of gl) for (const ch of fold(q.ch)) { c.push(ch); bx.push(r.x + b.x0 + q.x0, r.x + b.x0 + q.x1 + 1, r.y + b.y0, r.y + b.y1 + 1); }      // a character's box is counted from the corner of its line
      if (c.length) out.push({ c, b: Float32Array.from(bx), ocr: true });
    }
  }
  return out;
}
