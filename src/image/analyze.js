/* =====================================================================
   Region analysis: separates text from background inside a user box.
   img: ImageData. Returns background patch, alpha map, colour, geometry.
   ===================================================================== */
function analyzeRegion(img, opts) {
  opts = opts || {};
  const w = img.width, h = img.height, n = w * h, d = img.data;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) { R[i] = d[p]; G[i] = d[p + 1]; B[i] = d[p + 2]; }

  /* 1. background guess from the border ring (robust plane fit drops ring pixels that are text) */
  const t = clamp(Math.round(Math.min(w, h) * 0.05), 1, 6);
  const M0 = new Uint8Array(n);
  const ring = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x >= t && x < w - t && y >= t && y < h - t) M0[i] = 1; else ring.push(i);
    }
  }
  const rn = ring.length, cx = w / 2, cy = h / 2;
  const res = new Float32Array(rn), use = new Uint8Array(rn).fill(1);
  let flagged = 0;
  for (let pass = 0; pass < 2; pass++) {
    let S1 = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0, Syy = 0;
    const Sv = [0, 0, 0], Sxv = [0, 0, 0], Syv = [0, 0, 0];
    for (let q = 0; q < rn; q++) {
      if (!use[q]) continue;
      const i = ring[q], x = (i % w) - cx, y = ((i / w) | 0) - cy;
      S1++; Sx += x; Sy += y; Sxx += x * x; Sxy += x * y; Syy += y * y;
      Sv[0] += R[i]; Sxv[0] += x * R[i]; Syv[0] += y * R[i];
      Sv[1] += G[i]; Sxv[1] += x * G[i]; Syv[1] += y * G[i];
      Sv[2] += B[i]; Sxv[2] += x * B[i]; Syv[2] += y * B[i];
    }
    const det = S1 * (Sxx * Syy - Sxy * Sxy) - Sx * (Sx * Syy - Sxy * Sy) + Sy * (Sx * Sxy - Sxx * Sy);
    const co = [];
    for (let c = 0; c < 3; c++) {
      if (Math.abs(det) < 1e-6) { co.push([Sv[c] / Math.max(1, S1), 0, 0]); continue; }
      const a = (Sv[c] * (Sxx * Syy - Sxy * Sxy) - Sx * (Sxv[c] * Syy - Sxy * Syv[c]) + Sy * (Sxv[c] * Sxy - Sxx * Syv[c])) / det;
      const b = (S1 * (Sxv[c] * Syy - Sxy * Syv[c]) - Sv[c] * (Sx * Syy - Sxy * Sy) + Sy * (Sx * Syv[c] - Sxv[c] * Sy)) / det;
      const cc = (S1 * (Sxx * Syv[c] - Sxv[c] * Sxy) - Sx * (Sx * Syv[c] - Sxv[c] * Sy) + Sv[c] * (Sx * Sxy - Sxx * Sy)) / det;
      co.push([a, b, cc]);
    }
    for (let q = 0; q < rn; q++) {
      const i = ring[q], x = (i % w) - cx, y = ((i / w) | 0) - cy;
      const dr = R[i] - (co[0][0] + co[0][1] * x + co[0][2] * y);
      const dg = G[i] - (co[1][0] + co[1][1] * x + co[1][2] * y);
      const db = B[i] - (co[2][0] + co[2][1] * x + co[2][2] * y);
      res[q] = Math.sqrt(dr * dr + dg * dg + db * db);
    }
    const med = medianOf(res, rn);
    const thr = Math.max(3.5 * med + 8, 16);
    flagged = 0;
    for (let q = 0; q < rn; q++) { use[q] = res[q] <= thr ? 1 : 0; if (!use[q]) flagged++; }
    if (flagged > rn * 0.45) { use.fill(1); flagged = 0; break; }
  }
  if (flagged) for (let q = 0; q < rn; q++) if (!use[q]) M0[ring[q]] = 1;

  const b0R = R.slice(), b0G = G.slice(), b0B = B.slice();
  inpaintRGB(b0R, b0G, b0B, M0, w, h, 4);

  /* 2. difference from that guess → rough text mask (Otsu) */
  const D = new Float32Array(n), hist = new Uint32Array(256);
  let dmax = 0;
  for (let i = 0; i < n; i++) {
    const dr = R[i] - b0R[i], dg = G[i] - b0G[i], db = B[i] - b0B[i];
    const v = Math.sqrt(dr * dr + dg * dg + db * db);
    D[i] = v; if (v > dmax) dmax = v;
    hist[Math.min(255, Math.round(v * 0.5775))]++;
  }
  let thr0 = (otsu(hist) + 0.5) / 0.5775;
  thr0 = Math.max(thr0, 10);
  if (opts.sensitivity) thr0 *= opts.sensitivity;
  const mask0 = new Uint8Array(n);
  let m0count = 0;
  for (let i = 0; i < n; i++) if (D[i] > thr0) { mask0[i] = 1; m0count++; }

  /* 3. text colour. Text is one flat colour, so it is the densest colour among the candidates;
        walk outward from the background through that colour and take the far end (thin strokes never reach full strength). */
  const sel = [];
  const step = Math.max(1, Math.floor(m0count / 40000));
  for (let i = 0, c = 0; i < n; i++) if (mask0[i] && (c++ % step) === 0) sel.push(i);
  let color = null;
  if (sel.length) {
    const H3 = new Float32Array(4096);
    let mbR = 0, mbG = 0, mbB = 0;
    for (const i of sel) { H3[((R[i] >> 4) << 8) | ((G[i] >> 4) << 4) | (B[i] >> 4)]++; mbR += b0R[i]; mbG += b0G[i]; mbB += b0B[i]; }
    mbR /= sel.length; mbG /= sel.length; mbB /= sel.length;
    let bestBin = 0, bestV = -1;
    for (let r = 0; r < 16; r++) for (let g = 0; g < 16; g++) for (let bb = 0; bb < 16; bb++) {
      let v = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
        const rr = r + dr, gg = g + dg, b2 = bb + db;
        if (rr < 0 || rr > 15 || gg < 0 || gg > 15 || b2 < 0 || b2 > 15) continue;
        v += H3[(rr << 8) | (gg << 4) | b2] * (dr || dg || db ? 0.5 : 1);
      }
      if (v > bestV) { bestV = v; bestBin = (r << 8) | (g << 4) | bb; }
    }
    let tm = [((bestBin >> 8) << 4) + 8, (((bestBin >> 4) & 15) << 4) + 8, ((bestBin & 15) << 4) + 8];
    for (let it = 0; it < 3; it++) {
      let sr = 0, sg = 0, sb = 0, c = 0;
      for (const i of sel) { const dr = R[i] - tm[0], dg = G[i] - tm[1], db = B[i] - tm[2]; if (dr * dr + dg * dg + db * db < 900) { sr += R[i]; sg += G[i]; sb += B[i]; c++; } }
      if (c < 3) break;
      tm = [sr / c, sg / c, sb / c];
    }
    let ux = tm[0] - mbR, uy = tm[1] - mbG, uz = tm[2] - mbB;
    const L0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (L0 > 6) {
      ux /= L0; uy /= L0; uz /= L0;
      const keep = [], pr = [];
      for (const i of sel) {
        const vx = R[i] - mbR, vy = G[i] - mbG, vz = B[i] - mbB;
        const pj = vx * ux + vy * uy + vz * uz;
        if (pj < 0.3 * L0) continue;
        const qx = vx - pj * ux, qy = vy - pj * uy, qz = vz - pj * uz;
        if (Math.sqrt(qx * qx + qy * qy + qz * qz) < 22 + 0.12 * pj) { keep.push(i); pr.push(pj); }
      }
      if (keep.length >= 8) {
        const cut = Float64Array.from(pr).sort()[Math.floor(pr.length * 0.8)] - 1e-6;
        const cr = [], cg = [], cb = [];
        for (let q = 0; q < keep.length; q++) if (pr[q] >= cut) { const i = keep[q]; cr.push(R[i]); cg.push(G[i]); cb.push(B[i]); }
        const med1 = a => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
        color = [med1(cr), med1(cg), med1(cb)];
      }
    }
    if (!color) color = tm;
  }
  if (!color) color = [0, 0, 0];
  if (opts.color) color = opts.color.slice();

  /* 4. text mask with hysteresis: pixels close to the text colour seed it; weaker (anti-aliased, thin) pixels
        join only when they connect to a seed nearby. Look-alike background (a pale line, a bright blob) stays out. */
  const strong = new Uint8Array(n), weak = new Uint8Array(n);
  let sy0 = h, sy1 = -1, scount = 0;
  for (let i = 0; i < n; i++) {
    if (!mask0[i]) continue;
    const er = R[i] - color[0], eg = G[i] - color[1], eb = B[i] - color[2];
    const e = Math.sqrt(er * er + eg * eg + eb * eb);
    const kr = color[0] - b0R[i], kg = color[1] - b0G[i], kb = color[2] - b0B[i];
    const c = Math.sqrt(kr * kr + kg * kg + kb * kb);
    if (e < Math.max(0.33 * c, 26)) { strong[i] = 1; scount++; const y = (i / w) | 0; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
    if (e < Math.max(0.6 * c, 40)) weak[i] = 1;
  }
  const found = dmax >= 18 && scount >= 4;
  const roughH = sy1 >= sy0 ? sy1 - sy0 + 1 : h;
  const grow = opts.grow != null ? opts.grow : clamp(Math.round(roughH * 0.03) + 2, 2, 6);
  const text = strong.slice();
  {
    /* weak blobs that stand free of the box edge and contain a seed are text in full (long hairlines included);
       blobs that run to the edge are background structure, so there the mask only creeps a little way from the seeds */
    const lab = new Uint8Array(n), stack = [];
    for (let i0 = 0; i0 < n; i0++) {
      if (!weak[i0] || lab[i0]) continue;
      const mem = [];
      let touch = false, hasS = false;
      stack.push(i0); lab[i0] = 1;
      while (stack.length) {
        const i = stack.pop();
        mem.push(i);
        const x = i % w, y = (i / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch = true;
        if (strong[i]) hasS = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (weak[j] && !lab[j]) { lab[j] = 1; stack.push(j); }
        }
      }
      if (hasS && !touch) for (const i of mem) text[i] = 1;
      else if (!hasS && !touch && mem.length >= 3 && sy1 >= sy0) {
        /* a hairline that never reaches full ink (the hyphen of small, light type; a thin l) has no seed of its own:
           keep it when it is a short straight stroke standing inside the rows of the text. Blobs and long lines stay out. */
        let bx0 = w, bx1 = -1, by0 = h, by1 = -1;
        for (const i of mem) { const x = i % w, y = (i / w) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, RH = sy1 - sy0 + 1;
        const flat = bh <= 3 && bw >= 3 && bw >= 2 * bh && bw <= 0.9 * RH, tall = bw <= 3 && bh >= 4 && bh >= 2.5 * bw && bh <= RH + 2;
        if ((flat || tall) && by0 >= sy0 - 1 && by1 <= sy1 + 1 && mem.length >= 0.6 * bw * bh) for (const i of mem) text[i] = 1;
      }
    }
    let front = [];
    for (let i = 0; i < n; i++) if (strong[i]) front.push(i);
    const steps = Math.max(grow, 2) + 1;
    for (let sIt = 0; sIt < steps && front.length; sIt++) {
      const next = [];
      for (const i of front) {
        const x = i % w, y = (i / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (weak[j] && !text[j]) { text[j] = 1; next.push(j); }
        }
      }
      front = next;
    }
  }
  const hole = dilate(text, w, h, grow);
  const near = dilate(text, w, h, Math.min(2, Math.max(1, grow)));

  /* 5. real background: repair only under the text, then alpha = position between background and text colour */
  const bR = R.slice(), bG = G.slice(), bB = B.slice();
  inpaintRGB(bR, bG, bB, hole, w, h, 14);
  const alpha = new Float32Array(n);
  let bgSum = [0, 0, 0], bgN = 0;
  for (let i = 0; i < n; i++) {
    if (!hole[i]) continue;
    bgSum[0] += bR[i]; bgSum[1] += bG[i]; bgSum[2] += bB[i]; bgN++;
    if (!near[i]) continue;
    const tr = color[0] - bR[i], tg = color[1] - bG[i], tb = color[2] - bB[i];
    const den = tr * tr + tg * tg + tb * tb;
    if (den < 1) continue;
    const a = ((R[i] - bR[i]) * tr + (G[i] - bG[i]) * tg + (B[i] - bB[i]) * tb) / den;
    alpha[i] = a <= 0 ? 0 : a >= 1 ? 1 : a;
  }
  const bgColor = bgN ? [bgSum[0] / bgN, bgSum[1] / bgN, bgSum[2] / bgN] : [b0R[0], b0G[0], b0B[0]];

  /* 6. image grain, so the repaired patch is not suspiciously smooth */
  const resid = [];
  const stepN = Math.max(1, Math.floor(n / 20000));
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1 + (y % stepN); x < w - 1; x += stepN) {
      const i = y * w + x;
      if (hole[i] || hole[i - 1] || hole[i + 1] || hole[i - w] || hole[i + w]) continue;
      const l = (R[i] + G[i] + B[i]) / 3;
      const m = (R[i - 1] + G[i - 1] + B[i - 1] + R[i + 1] + G[i + 1] + B[i + 1] + R[i - w] + G[i - w] + B[i - w] + R[i + w] + G[i + w] + B[i + w]) / 12;
      resid.push(Math.abs(l - m));
    }
  }
  resid.sort((a, b) => a - b);
  let grain = resid.length ? (resid[resid.length >> 1] * 1.4826) / 1.118 : 0;
  grain = grain < 0.9 ? 0 : Math.min(grain, 9);
  if (grain > 0) {
    const rnd = mulberry32(((w * 73856093) ^ (h * 19349663) ^ Math.round(color[0] * 7 + color[1] * 13)) | 0);
    for (let i = 0; i < n; i++) {
      if (!hole[i]) continue;
      const u = Math.max(1e-6, rnd()), v = rnd();
      const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v) * grain;
      bR[i] += g; bG[i] += g; bB[i] += g;
    }
  }

  return { w, h, bR, bG, bB, hole, alpha, color, bgColor, grain, grow, found, contrast: dmax };
}

/* ---------- text lines inside the alpha map ---------- */
function findBands(alpha, w, h, expected) {
  const TH = 0.5;
  const rows = new Int32Array(h);
  for (let y = 0; y < h; y++) { let c = 0; const r = y * w; for (let x = 0; x < w; x++) if (alpha[r + x] >= TH) c++; rows[y] = c; }
  let runs = [];
  for (let y = 0; y < h;) {
    if (!rows[y]) { y++; continue; }
    let y1 = y, mass = 0;
    while (y1 < h && rows[y1]) { mass += rows[y1]; y1++; }
    runs.push({ y0: y, y1, mass });
    y = y1;
  }
  if (!runs.length) return [];
  const maxMass = Math.max.apply(null, runs.map(r => r.mass));
  const maxH = Math.max.apply(null, runs.map(r => r.y1 - r.y0));
  runs = runs.filter(r => !(r.mass < maxMass * 0.02 && (r.y1 - r.y0) < Math.max(2, maxH * 0.12)));
  const merge = k => { runs[k].y1 = runs[k + 1].y1; runs[k].mass += runs[k + 1].mass; runs.splice(k + 1, 1); };
  let changed = true;
  while (changed && runs.length > 1 && !(expected && runs.length <= expected)) {
    changed = false;
    const hs = runs.map(r => r.y1 - r.y0).sort((a, b) => a - b);
    const refH = hs[hs.length - 1];
    for (let k = 0; k < runs.length - 1; k++) {
      const gap = runs[k + 1].y0 - runs[k].y1;
      const small = Math.min(runs[k].y1 - runs[k].y0, runs[k + 1].y1 - runs[k + 1].y0);
      if (gap <= Math.max(1, refH * 0.16) || small < refH * 0.3) { merge(k); changed = true; break; }
    }
  }
  if (expected) {
    while (runs.length > expected) {
      let bk = 0, bg = 1e9;
      for (let k = 0; k < runs.length - 1; k++) { const gap = runs[k + 1].y0 - runs[k].y1; if (gap < bg) { bg = gap; bk = k; } }
      merge(bk);
    }
    while (runs.length < expected) {
      let bk = 0, bh = -1;
      for (let k = 0; k < runs.length; k++) { const hh = runs[k].y1 - runs[k].y0; if (hh > bh) { bh = hh; bk = k; } }
      if (bh < 6) break;
      const r = runs[bk], mid = (r.y0 + r.y1) >> 1;
      runs.splice(bk, 1, { y0: r.y0, y1: mid, mass: r.mass / 2 }, { y0: mid, y1: r.y1, mass: r.mass / 2 });
    }
  }
  const bands = [];
  for (const r of runs) {
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = r.y0; y < r.y1; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) if (alpha[row + x] >= TH) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 >= x0) bands.push({ x0, y0, x1: x1 + 1, y1: y1 + 1 });
  }
  return bands;
}

/* median horizontal run of ink inside a box, i.e. the thickness of the upright strokes */
function stemWidth(a, w, x0, y0, x1, y1) {
  const runs = [];
  for (let y = y0; y < y1; y++) {
    let len = 0;
    for (let x = x0; x <= x1; x++) {
      if (x < x1 && a[y * w + x] >= 0.5) len++;
      else if (len) { runs.push(len); len = 0; }
    }
  }
  if (!runs.length) return 0;
  runs.sort((p, q) => p - q);
  return runs[runs.length >> 1];
}

/* ---------- italic slant estimate (degrees, 0 = upright) ---------- */
function estimateSlant(alpha, w, h, band) {
  const pts = [];
  const bh = band.y1 - band.y0, bw = band.x1 - band.x0;
  const step = Math.max(1, Math.floor((bh * bw) / 12000));
  for (let y = band.y0; y < band.y1; y++) for (let x = band.x0 + (y % step); x < band.x1; x += step) if (alpha[y * w + x] >= 0.5) pts.push(x, y);
  if (pts.length < 40) return 0;
  const yb = band.y1;
  let best = 0, bestS = -1, s0 = 0;
  for (let deg = -6; deg <= 24; deg += 3) {
    const sh = Math.tan((deg * Math.PI) / 180);
    const hist = new Float32Array(bw + 2 * bh + 4);
    for (let q = 0; q < pts.length; q += 2) {
      const xx = pts[q] - band.x0 + sh * (pts[q + 1] - yb) + bh;
      const xi = Math.floor(xx), f = xx - xi;
      if (xi >= 0 && xi + 1 < hist.length) { hist[xi] += 1 - f; hist[xi + 1] += f; }
    }
    let s = 0;
    for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
    if (deg === 0) s0 = s;
    if (s > bestS) { bestS = s; best = deg; }
  }
  return best >= 3 && bestS > s0 * 1.012 ? best : 0;     // gentle italics (Lora, Georgia) gain only a little; upright text loses 2% or more at 3°
}
/* Observed words of a line: the k widest column gaps split it into k+1 blobs.
   Returns null unless those gaps clearly stand out from the gaps between letters. */
function wordRuns(alpha, w, h, band, k) {
  if (k < 1) return null;
  const bw = band.x1 - band.x0, cols = new Uint8Array(bw);
  /* a column counts as inked by its total coverage, so thin strokes (a hyphen, a one-pixel bar) are not lost */
  const acc = new Float32Array(bw);
  const peak = new Float32Array(bw);
  for (let y = band.y0; y < band.y1; y++) { const row = y * w; for (let x = 0; x < bw; x++) { const a = alpha[row + band.x0 + x]; if (a >= 0.12) acc[x] += a; if (a > peak[x]) peak[x] = a; } }
  for (let x = 0; x < bw; x++) if (acc[x] >= 0.4 || peak[x] >= 0.25) cols[x] = 1;
  const gaps = [];
  for (let x = 0; x < bw;) {
    if (cols[x]) { x++; continue; }
    let x1 = x;
    while (x1 < bw && !cols[x1]) x1++;
    if (x > 0 && x1 < bw) gaps.push({ s: x, e: x1, w: x1 - x });
    x = x1;
  }
  if (gaps.length < k) return null;
  const sorted = gaps.slice().sort((p, q) => q.w - p.w);
  const H = band.y1 - band.y0, kth = sorted[k - 1].w, next = sorted[k] ? sorted[k].w : 0;
  if (kth < Math.max(2, 0.12 * H) || next > 0.8 * kth) return null;
  const cut = sorted.slice(0, k).sort((p, q) => p.s - q.s);
  const runs = [];
  let st = 0;
  for (const g of cut) { runs.push({ s: band.x0 + st, e: band.x0 + g.s }); st = g.e; }
  runs.push({ s: band.x0 + st, e: band.x1 });
  /* ordinary word spacing is roughly 0.35–0.55 of the line's ink height and even; anything else is deliberate layout */
  const odd = sorted[0].w > 0.8 * H || sorted[0].w > 1.75 * kth;
  return { runs, odd };
}
