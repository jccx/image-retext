/* =====================================================================
   core.js — pixel analysis, background repair, font matching, re-render
   ===================================================================== */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const REF = 200; // reference px size for font metrics

/* ---------- multigrid Laplace fill: fills pixels where M[i]==1 ---------- */
function inpaintRGB(R, G, B, M, w, h, iters) {
  const n = w * h;
  let unk = 0;
  for (let i = 0; i < n; i++) unk += M[i];
  if (!unk || unk === n) return;
  if (w > 1 || h > 1) {
    const w2 = (w + 1) >> 1, h2 = (h + 1) >> 1, n2 = w2 * h2;
    const r2 = new Float32Array(n2), g2 = new Float32Array(n2), b2 = new Float32Array(n2);
    const c2 = new Uint8Array(n2), m2 = new Uint8Array(n2);
    for (let y = 0; y < h; y++) {
      const yo = (y >> 1) * w2, row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        if (!M[i]) { const j = yo + (x >> 1); r2[j] += R[i]; g2[j] += G[i]; b2[j] += B[i]; c2[j]++; }
      }
    }
    for (let j = 0; j < n2; j++) {
      const c = c2[j];
      if (c) { r2[j] /= c; g2[j] /= c; b2[j] /= c; } else m2[j] = 1;
    }
    inpaintRGB(r2, g2, b2, m2, w2, h2, 8);
    for (let y = 0; y < h; y++) {
      const yo = (y >> 1) * w2, row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        if (M[i]) { const j = yo + (x >> 1); R[i] = r2[j]; G[i] = g2[j]; B[i] = b2[j]; }
      }
    }
  }
  const idx = new Int32Array(unk), nl = new Int32Array(unk), nr = new Int32Array(unk),
    nu = new Int32Array(unk), nd = new Int32Array(unk);
  let k = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!M[i]) continue;
      idx[k] = i;
      nl[k] = x > 0 ? i - 1 : (w > 1 ? i + 1 : i);
      nr[k] = x < w - 1 ? i + 1 : (w > 1 ? i - 1 : i);
      nu[k] = y > 0 ? i - w : (h > 1 ? i + w : i);
      nd[k] = y < h - 1 ? i + w : (h > 1 ? i - w : i);
      k++;
    }
  }
  for (let it = 0; it < (iters || 10); it++) {
    if (it & 1) {
      for (let q = unk - 1; q >= 0; q--) {
        const i = idx[q], a = nl[q], b = nr[q], c = nu[q], d = nd[q];
        R[i] = (R[a] + R[b] + R[c] + R[d]) * 0.25;
        G[i] = (G[a] + G[b] + G[c] + G[d]) * 0.25;
        B[i] = (B[a] + B[b] + B[c] + B[d]) * 0.25;
      }
    } else {
      for (let q = 0; q < unk; q++) {
        const i = idx[q], a = nl[q], b = nr[q], c = nu[q], d = nd[q];
        R[i] = (R[a] + R[b] + R[c] + R[d]) * 0.25;
        G[i] = (G[a] + G[b] + G[c] + G[d]) * 0.25;
        B[i] = (B[a] + B[b] + B[c] + B[d]) * 0.25;
      }
    }
  }
}

function otsu(hist) {
  let total = 0, sumAll = 0;
  for (let i = 0; i < 256; i++) { total += hist[i]; sumAll += i * hist[i]; }
  let wB = 0, sumB = 0, best = -1, thr = 0;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = i; }
  }
  return thr;
}

function dilate(M, w, h, r) {
  if (r <= 0) return M.slice();
  const T = new Uint8Array(w * h), O = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let last = -1e9;
    for (let x = 0; x < w; x++) { if (M[row + x]) last = x; if (x - last <= r) T[row + x] = 1; }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (M[row + x]) last = x; if (last - x <= r) T[row + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) { if (T[y * w + x]) last = y; if (y - last <= r) O[y * w + x] = 1; }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (T[y * w + x]) last = y; if (last - y <= r) O[y * w + x] = 1; }
  }
  return O;
}

function gaussBlur(src, w, h, sigma) {
  if (!(sigma > 0.05)) return src;
  const rad = Math.max(1, Math.ceil(sigma * 2.6));
  const ker = new Float32Array(rad * 2 + 1);
  let s = 0;
  for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); ker[i + rad] = v; s += v; }
  for (let i = 0; i < ker.length; i++) ker[i] /= s;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -rad; k <= rad; k++) { const xx = x + k; if (xx >= 0 && xx < w) acc += src[row + xx] * ker[k + rad]; }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -rad; k <= rad; k++) { const yy = y + k; if (yy >= 0 && yy < h) acc += tmp[yy * w + x] * ker[k + rad]; }
      out[y * w + x] = acc;
    }
  }
  return out;
}

function medianOf(arr, n) {
  if (!n) return 0;
  const a = Float32Array.from(arr.subarray ? arr.subarray(0, n) : arr.slice(0, n));
  a.sort();
  return a[n >> 1];
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/* =====================================================================
   Font matching: render each candidate, compare with the observed alpha
   ===================================================================== */
const GENERIC = new Set(['system-ui', 'ui-rounded', 'ui-serif', 'ui-monospace', 'sans-serif', 'serif', 'monospace', 'cursive']);
const COMPLEX_RE = /[֐-ࣿऀ-෿฀-໿ក-៿]/;
/* A PDF's own font can only be drawn through the codes pdf.js gave its glyphs; text is translated just before it is measured or drawn. */
const encT = (fam, t) => (fam && fam.pdf ? pdfEnc(fam.pdf, t) : t);
function famCss(fam) {
  if (fam.pdf) return fam.pdf.css;
  if (fam.stack) return fam.stack.map(f => (GENERIC.has(f.n) ? f.n : '"' + f.n + '"')).join(', ') + ', sans-serif';
  if (GENERIC.has(fam.n)) return fam.n;
  return '"' + fam.n + '", ' + (fam.c === 'r' ? 'serif' : fam.c === 'm' ? 'monospace' : 'sans-serif');
}
function fontCss(c, px) { return c.fam.pdf ? c.fam.pdf.fs + ' ' + c.fam.pdf.fw + ' ' + px.toFixed(3) + 'px ' + c.fam.pdf.css : (c.italic ? 'italic ' : '') + c.weight + ' ' + px.toFixed(3) + 'px ' + famCss(c.fam); }

const _mc = { can: null, ctx: null };
let INK = '#ffffff'; // colour used when rasterising glyph masks (set to the detected text colour)
function setInk(c) { INK = 'rgb(' + Math.round(clamp(c[0], 0, 255)) + ',' + Math.round(clamp(c[1], 0, 255)) + ',' + Math.round(clamp(c[2], 0, 255)) + ')'; }
function mctx(w, h) {
  if (!_mc.can) { _mc.can = document.createElement('canvas'); _mc.can.width = 64; _mc.can.height = 64; _mc.ctx = _mc.can.getContext('2d', { willReadFrequently: true }); }
  if (_mc.can.width < w || _mc.can.height < h) {
    _mc.can.width = Math.max(_mc.can.width, Math.ceil(w * 1.25));
    _mc.can.height = Math.max(_mc.can.height, Math.ceil(h * 1.25));
  }
  return _mc.ctx;
}

function drawRun(ctx, text, ox, oy, tr, stroke) {
  const cps = Array.from(text);
  if (Math.abs(tr) < 0.01 || cps.length < 2 || COMPLEX_RE.test(text)) {
    if (stroke) ctx.strokeText(text, ox, oy); else ctx.fillText(text, ox, oy);
    return;
  }
  let prefix = '';
  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i];
    if (ch.trim()) {
      const x = ox + ctx.measureText(prefix + ch).width - ctx.measureText(ch).width + i * tr;
      if (stroke) ctx.strokeText(ch, x, oy); else ctx.fillText(ch, x, oy);
    }
    prefix += ch;
  }
}

/* ink metrics of `text` in candidate c, per 1px of font size.
   With nRuns > 1 and exactly that many words in the text, every word is measured on its own (see wordRuns). */
function inkMetrics(c, text, nRuns) {
  const ctx = mctx(8, 8);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = fontCss(c, REF);
  const m = ctx.measureText(encT(c.fam, text));
  const mk = (t, mm) => ({ text: t, L: mm.actualBoundingBoxLeft / REF, R: mm.actualBoundingBoxRight / REF, W: mm.width / REF, n: Array.from(t).length });
  let runs = null;
  if (nRuns > 1) { const ws = text.split(/\s+/).filter(Boolean); if (ws.length === nRuns) runs = ws.map(t => mk(t, ctx.measureText(encT(c.fam, t)))); }
  if (!runs) runs = [mk(text, m)];
  let inkW = 0, gaps = 0;
  for (const r of runs) { inkW += r.L + r.R; gaps += r.n - 1; }
  return { L: m.actualBoundingBoxLeft / REF, R: m.actualBoundingBoxRight / REF, A: m.actualBoundingBoxAscent / REF, D: m.actualBoundingBoxDescent / REF, W: m.width / REF, n: Array.from(text).length, runs, inkW, gaps };
}
const nRunsOf = T => (T.runs ? T.runs.length : 1);
/* observed ink width the model has to fill: the whole line, or the sum of its words when they are anchored separately */
function obsWidth(im, T) {
  if (!T.runs || T.runs.length !== im.runs.length) return T.box.W;
  let w = 0;
  for (const r of T.runs) w += r.e - r.s;
  return w;
}

/* geometry that puts the ink of the text on target T; px optional (else fit height).
   dW widens/narrows the target width; zero=true keeps the font's natural spacing.
   When T carries word runs, each word is centred on its own observed blob, so odd gaps between words do not matter. */
function fitGeom(im, T, px, dx, dy, dW, zero) {
  const box = T.box, inkH = im.A + im.D;
  if (!(inkH > 0.01 && im.inkW > 0.01)) return null;
  if (!px) px = box.H / inkH;
  const byWord = T.runs && T.runs.length === im.runs.length && im.runs.length > 1;
  const gaps = im.gaps;
  let tr = gaps > 0 && !zero ? (obsWidth(im, T) + (dW || 0) - im.inkW * px) / gaps : 0;
  const trEmRaw = tr / px;
  tr = clamp(tr, -0.14 * px, 0.6 * px);
  const xs = [];
  if (byWord) {
    for (let j = 0; j < im.runs.length; j++) {
      const w = im.runs[j], r = T.runs[j];
      const mW = (w.L + w.R) * px + tr * (w.n - 1);
      xs.push(r.s + (r.e - r.s - mW) / 2 + w.L * px + (dx || 0));
    }
  } else {
    const w = im.inkW * px + tr * gaps;
    xs.push(box.x0 + (box.W - w) / 2 + im.runs[0].L * px + (dx || 0));
  }
  return {
    px, tr, trEm: tr / px, trEmRaw, xs, ox: xs[0], words: byWord ? im.runs.map(r => r.text) : null,
    oy: box.y0 + box.H / 2 + ((im.A - im.D) * px) / 2 + (dy || 0),
    dx: dx || 0, dy: dy || 0, dW: dW || 0, zero: !!zero
  };
}
function shiftG(g, fx) { return Object.assign({}, g, { ox: g.ox + fx, xs: g.xs.map(x => x + fx) }); }

function renderAlpha(c, text, g, tw, th, out) {
  const ctx = mctx(tw, th);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, tw, th);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = fontCss(c, g.px);
  ctx.fillStyle = INK;
  if (g.words) for (let j = 0; j < g.words.length; j++) drawRun(ctx, encT(c.fam, g.words[j]), g.xs[j], g.oy, g.tr, false);
  else drawRun(ctx, encT(c.fam, text), g.ox, g.oy, g.tr, false);
  const d = ctx.getImageData(0, 0, tw, th).data;
  let sum = 0;
  for (let i = 0, p = 3, n = tw * th; i < n; i++, p += 4) { const v = d[p]; out[i] = v; sum += v; }
  _rsum = sum;
  return out;
}

let _rsum = 0; // ink total of the last renderAlpha()
function softIoU(A, Rr, w, h, sx, sy, sumA, sumR) {
  const x0 = sx > 0 ? sx : 0, x1 = sx < 0 ? w + sx : w, y0 = sy > 0 ? sy : 0, y1 = sy < 0 ? h + sy : h;
  let mn = 0;
  for (let y = y0; y < y1; y++) {
    let ia = y * w + x0, ir = (y - sy) * w + x0 - sx;
    for (let x = x0; x < x1; x++, ia++, ir++) { const a = A[ia], r = Rr[ir]; mn += a < r ? a : r; }
  }
  if (sumA == null) { sumA = 0; for (let i = 0, n = w * h; i < n; i++) sumA += A[i]; }
  if (sumR == null) { sumR = 0; for (let i = 0, n = w * h; i < n; i++) sumR += Rr[i]; }
  const mx = sumA + sumR - mn;
  return mx > 0 ? mn / mx : 0;
}
/* best whole-pixel shift of the last rendering: vertical first (±ry), then one pixel sideways */
function bestShift(T, buf, ry) {
  let b = -1, bx = 0, by = 0;
  for (let sy = -ry; sy <= ry; sy++) { const s = iouT(T, buf, 0, sy); if (s > b) { b = s; by = sy; } }
  for (const sx of [-1, 1]) { const s = iouT(T, buf, sx, by); if (s > b) { b = s; bx = sx; } }
  return { s: b, sx: bx, sy: by };
}
/* IoU of the last rendering in `buf` against target T, shifted by whole pixels */
function iouT(T, buf, sx, sy) { return softIoU(T.A, buf, T.tw, T.th, sx || 0, sy || 0, T.sumA, _rsum); }

function trackPenalty(trEm) { return trEm < 0 ? 0.7 * -trEm : 0.22 * Math.max(0, trEm - 0.02); }

/* observed target for one text line, padded; scale k <= 1 */
function makeTarget(alpha, w, h, band, bands, k, runs) {
  const pad = Math.max(4, Math.round((band.y1 - band.y0) * 0.12));
  const sx0 = band.x0 - pad, sy0 = band.y0 - pad;
  const fw = band.x1 - band.x0 + 2 * pad, fh = band.y1 - band.y0 + 2 * pad;
  const full = new Uint8ClampedArray(fw * fh * 4);
  for (let y = 0; y < fh; y++) {
    const yy = sy0 + y;
    if (yy < 0 || yy >= h) continue;
    let other = false;
    if (yy < band.y0 || yy >= band.y1) for (const b of bands) if (b !== band && yy >= b.y0 && yy < b.y1) { other = true; break; }
    if (other) continue;
    for (let x = 0; x < fw; x++) {
      const xx = sx0 + x;
      if (xx < 0 || xx >= w) continue;
      const v = alpha[yy * w + xx] * 255;
      const p = (y * fw + x) * 4;
      full[p] = full[p + 1] = full[p + 2] = v; full[p + 3] = 255;
    }
  }
  for (let p = 3; p < full.length; p += 4) full[p] = 255;
  let tw = fw, th = fh, A;
  if (k < 0.999) {
    tw = Math.max(4, Math.round(fw * k)); th = Math.max(4, Math.round(fh * k));
    const c1 = document.createElement('canvas'); c1.width = fw; c1.height = fh;
    c1.getContext('2d').putImageData(new ImageData(full, fw, fh), 0, 0);
    const c2 = document.createElement('canvas'); c2.width = tw; c2.height = th;
    const x2 = c2.getContext('2d', { willReadFrequently: true });
    x2.imageSmoothingEnabled = true; x2.imageSmoothingQuality = 'high';
    x2.drawImage(c1, 0, 0, fw, fh, 0, 0, tw, th);
    const d = x2.getImageData(0, 0, tw, th).data;
    A = new Uint8Array(tw * th);
    for (let i = 0, p = 0; i < A.length; i++, p += 4) A[i] = d[p];
  } else {
    k = 1;
    A = new Uint8Array(tw * th);
    for (let i = 0, p = 0; i < A.length; i++, p += 4) A[i] = full[p];
  }
  const kx = tw / fw, ky = th / fh;
  let sumA = 0;
  for (let i = 0; i < A.length; i++) sumA += A[i];
  return {
    A, tw, th, k, kx, ky, offX: sx0, offY: sy0, sumA,
    box: { x0: pad * kx, y0: pad * ky, W: (band.x1 - band.x0) * kx, H: (band.y1 - band.y0) * ky },
    runs: runs && runs.length > 1 ? runs.map(r => ({ s: (r.s - sx0) * kx, e: (r.e - sx0) * kx })) : null
  };
}

/* Two readings of the line box: (1) height gives the size and tracking absorbs the width;
   (2) natural spacing, so the width gives the size (robust when stray marks stretch the box vertically). */
function stage1(c, text, T, buf) {
  const im = inkMetrics(c, text, nRunsOf(T));
  const g = fitGeom(im, T);
  if (!g) return null;
  const fine = T.k > 0.6;
  const geos = [[g, trackPenalty(g.trEmRaw), 1]];
  if (im.gaps > 0) {
    const pw = (obsWidth(im, T) + T.kx) / im.inkW;
    const slack = Math.abs(T.box.H - (im.A + im.D) * pw);
    const gz = slack < 0.3 * T.box.H ? fitGeom(im, T, pw, 0, 0, 0, true) : null;
    if (gz) geos.push([gz, 0, Math.min(3, Math.ceil(slack / 2) + 1)]);
  }
  let best = -1, iou = 0;
  const offs = !fine || T.box.H >= 40 ? [0] : T.box.H >= 26 ? [0, 0.5] : [0, 0.25, 0.5, 0.75];
  for (const [g0, pen, ry] of geos) {
    for (const fx of offs) {
      renderAlpha(c, text, fx ? shiftG(g0, fx) : g0, T.tw, T.th, buf);
      const r = bestShift(T, buf, ry);
      if (r.s - pen > best) { best = r.s - pen; iou = r.s; }
    }
  }
  return { iou, score: best, im };
}

/* fine fit of one candidate against target T → geometry in region coords */
function refineCand(c, text, T, Tc) {
  const im = inkMetrics(c, text, nRunsOf(T));
  const g0 = fitGeom(im, T);
  if (!g0) return null;
  const gaps = im.gaps;
  const buf = new Uint8Array(T.tw * T.th);
  const ev = gg => { renderAlpha(c, text, gg, T.tw, T.th, buf); return iouT(T, buf, 0, 0); };
  let best = -1, g = g0;
  /* coarse whole-pixel alignment first (ink bounds of slanted or swashed faces are not exact) */
  renderAlpha(c, text, g0, T.tw, T.th, buf);
  let sx0 = 0, sb = -1;
  for (let sx = -2; sx <= 2; sx++) { const s = iouT(T, buf, sx, 0); if (s > sb) { sb = s; sx0 = sx; } }
  /* size sweep; baselines land on whole pixels in most renderers, so try whole-pixel vertical shifts */
  for (const f of [0.955, 0.97, 0.985, 1, 1.015, 1.03, 1.045]) {
    const g2 = fitGeom(im, T, g0.px * f, sx0, 0);
    renderAlpha(c, text, g2, T.tw, T.th, buf);
    for (let sy = -1; sy <= 1; sy++) {
      const s = iouT(T, buf, 0, sy);
      if (s > best) { best = s; g = fitGeom(im, T, g2.px, sx0, sy); }
    }
  }
  const tryG = g2 => { const s = ev(g2); if (s > best) { best = s; g = g2; return true; } return false; };
  const at = (o) => fitGeom(im, T, o.px != null ? o.px : g.px, o.dx != null ? o.dx : g.dx, o.dy != null ? o.dy : g.dy, o.dW != null ? o.dW : g.dW, o.zero != null ? o.zero : g.zero);
  let base = g;
  for (const dx of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) tryG(at({ dx: base.dx + dx }));
  base = g;
  for (const f of [0.9925, 1.0075]) tryG(at({ px: base.px * f }));
  if (gaps > 0) { base = g; for (const dW of [-1, -0.5, 0.5, 1, 1.5, 2]) tryG(at({ dW })); }
  base = g;
  for (const dy of [-0.5, 0.5]) tryG(at({ dy: base.dy + dy }));
  base = g;
  for (const dx of [-0.125, 0.125]) tryG(at({ dx: base.dx + dx }));
  /* prefer a round size when it fits just as well */
  const kk = T.ky;
  for (const step of [1, 0.5]) {
    const nice = Math.round(g.px / kk / step) * step * kk;
    if (Math.abs(nice - g.px) < 1e-6 || Math.abs(nice - g.px) > Math.max(0.012 * g.px, 0.55 * kk)) continue;
    const g2 = at({ px: nice }), s = ev(g2);
    if (s >= best - 0.004) { if (s > best) best = s; g = g2; break; }
  }
  /* second reading: the font's own spacing, so the line width fixes the size */
  if (gaps > 0) {
    const W = obsWidth(im, T), pw = W / im.inkW, tiny = Math.abs(g.trEm) < 0.03;
    const pxs = [pw, pw * (1 + 1 / W), pw * (1 + 2 / W), pw * (1 - 1 / W)];
    if (tiny) pxs.push(g.px);
    for (const step of [1, 0.5]) pxs.push(Math.round((pw * (1 + 1 / W)) / kk / step) * step * kk);
    const ry = Math.min(3, Math.ceil(Math.abs(T.box.H - (im.A + im.D) * pw) / 2) + 1);
    let zb = -1, zg = null;
    const seen = [], cand = [];
    for (const px of pxs) {
      if (!(px > 0) || seen.some(v => Math.abs(v - px) < 1e-4)) continue;
      seen.push(px);
      const gz = fitGeom(im, T, px, 0, 0, 0, true);
      renderAlpha(c, text, gz, T.tw, T.th, buf);
      const sh = bestShift(T, buf, ry);
      cand.push({ s: sh.s, g: fitGeom(im, T, px, sh.sx, sh.sy, 0, true) });
    }
    /* sub-pixel polish for the three most promising sizes only */
    cand.sort((p, q) => q.s - p.s);
    for (const cd of cand.slice(0, 3)) {
      let pb = cd.s, pg = cd.g;
      for (const steps of [[-0.5, -0.25, 0.25, 0.5], [-0.125, 0.125]]) {
        const zbase = pg;
        for (const dx of steps) { const g2 = fitGeom(im, T, zbase.px, zbase.dx + dx, zbase.dy, 0, true); const s = ev(g2); if (s > pb) { pb = s; pg = g2; } }
      }
      if (pb > zb) { zb = pb; zg = pg; }
    }
    if (zg && zb + 0.004 >= best - (tiny ? 0 : trackPenalty(g.trEmRaw))) { best = zb; g = zg; }
  }
  /* third reading, for boxes stretched by stray marks: ignore the box size, search size and position freely
     on a small copy of the line, then polish at full detail */
  if (gaps > 0 && Tc && best < 0.93) {
    const cb = new Uint8Array(Tc.tw * Tc.th);
    const r = T.ky / Tc.ky;
    /* how the current fit scores on the small copy */
    renderAlpha(c, text, Object.assign({}, g, { px: g.px / r, tr: g.tr / r, oy: g.oy / r, ox: g.ox / r, xs: g.xs.map(x => x / r) }), Tc.tw, Tc.th, cb);
    let cur = 0;
    for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) cur = Math.max(cur, iouT(Tc, cb, sx, sy));
    const pwc = obsWidth(im, Tc) / im.inkW, Rr = Math.ceil(0.14 * Tc.box.H) + 1;
    let fb = -1, fpx = 0, fsx = 0, fsy = 0;
    for (let f = 0.84; f <= 1.061; f += 0.02) {
      const gz = fitGeom(im, Tc, pwc * f, 0, 0, 0, true);
      renderAlpha(c, text, gz, Tc.tw, Tc.th, cb);
      for (let sy = -Rr; sy <= Rr; sy++) for (let sx = -Rr; sx <= Rr; sx++) {
        const sc = iouT(Tc, cb, sx, sy);
        if (sc > fb) { fb = sc; fpx = pwc * f; fsx = sx; fsy = sy; }
      }
    }
    if (fb > cur + 0.03) {
      const st = Math.max(1, Math.round(r / 2)), span = Math.ceil(r) + 1;
      let hb = -1, hg = null;
      /* position on a coarse lattice, then pixel by pixel, at the size the small copy found */
      const g1 = fitGeom(im, T, fpx * r, fsx * r, fsy * r, 0, true);
      renderAlpha(c, text, g1, T.tw, T.th, buf);
      let bx = 0, by = 0;
      for (let sy = -span; sy <= span; sy += st) for (let sx = -span; sx <= span; sx += st) { const sc = iouT(T, buf, sx, sy); if (sc > hb) { hb = sc; bx = sx; by = sy; } }
      if (st > 1) { const cx = bx, cy = by; for (let sy = cy - st + 1; sy < cy + st; sy++) for (let sx = cx - st + 1; sx < cx + st; sx++) { const sc = iouT(T, buf, sx, sy); if (sc > hb) { hb = sc; bx = sx; by = sy; } } }
      hg = fitGeom(im, T, g1.px, g1.dx + bx, g1.dy + by, 0, true);
      for (const f of [0.98, 0.99, 1.01, 1.02]) {
        const g2 = fitGeom(im, T, g1.px * f, hg.dx, hg.dy, 0, true);
        renderAlpha(c, text, g2, T.tw, T.th, buf);
        for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) { const sc = iouT(T, buf, sx, sy); if (sc > hb) { hb = sc; hg = fitGeom(im, T, g2.px, g2.dx + sx, g2.dy + sy, 0, true); } }
      }
      for (const steps of [[-0.5, -0.25, 0.25, 0.5], [-0.125, 0.125]]) {
        const hbase = hg;
        for (const dx of steps) { const g2 = fitGeom(im, T, hbase.px, hbase.dx + dx, hbase.dy, 0, true); const sc = ev(g2); if (sc > hb) { hb = sc; hg = g2; } }
      }
      for (const step of [1, 0.5]) {
        const nice = Math.round(hg.px / kk / step) * step * kk;
        if (Math.abs(nice - hg.px) < 1e-6 || Math.abs(nice - hg.px) > Math.max(0.012 * hg.px, 0.55 * kk)) continue;
        const g2 = fitGeom(im, T, nice, hg.dx, hg.dy, 0, true), sc = ev(g2);
        if (sc >= hb - 0.004) { hb = Math.max(hb, sc); hg = g2; break; }
      }
      if (hb > best + 0.012) { best = hb; g = hg; }
    }
  }
  renderAlpha(c, text, g, T.tw, T.th, buf);
  best = iouT(T, buf, 0, 0);
  const Af = Float32Array.from(T.A), Rf = Float32Array.from(buf);
  let blur = 0;
  if (softIoU(Af, gaussBlur(Rf, T.tw, T.th, 0.5), T.tw, T.th, 0, 0) > best + 0.006) {
    for (const sg of [0.35, 0.6, 0.9, 1.3, 1.8, 2.4]) {
      const Bf = gaussBlur(Rf, T.tw, T.th, sg);
      const s = softIoU(Af, Bf, T.tw, T.th, 0, 0);
      if (s > best + (blur ? 0.004 : 0.012)) { best = s; blur = sg; } else if (s < best - 0.03) break;
    }
  }
  return {
    fam: c.fam, weight: c.weight, italic: c.italic, iou: best, score: best - trackPenalty(g.trEmRaw),
    px: g.px / T.ky, trEm: g.trEm, blur: blur / T.ky,
    ox: g.ox / T.kx + T.offX, oy: g.oy / T.ky + T.offY, im,
    xs: g.xs.map(x => x / T.kx + T.offX), words: g.words
  };
}

/* how well each character of the fitted text agrees with the picture; r is a refineCand() result.
   A character that was read wrongly scores far below its neighbours. */
function glyphScores(c, text, T, r) {
  const px = r.px * T.ky, tr = r.trEm * px;
  const toX = x => (x - T.offX) * T.kx;
  const g = { px, tr, xs: (r.xs || [r.ox]).map(toX), ox: toX(r.ox), oy: (r.oy - T.offY) * T.ky, words: r.words || null };
  const buf = new Uint8Array(T.tw * T.th);
  renderAlpha(c, text, g, T.tw, T.th, buf);
  const ctx = mctx(8, 8);
  ctx.font = fontCss(c, px);
  const cells = [];
  const addRun = (t, x0) => {
    let prefix = '';
    const enc = Array.from(encT(c.fam, t));
    Array.from(t).forEach((ch, i) => {
      const e = enc[i] || ch, w = ctx.measureText(e).width;
      if (ch.trim()) { const x = x0 + ctx.measureText(prefix + e).width - w + i * tr; cells.push({ ch, a: x, b: x + w }); }
      prefix += e;
    });
  };
  if (g.words) g.words.forEach((w, j) => addRun(w, g.xs[j])); else addRun(text, g.ox);
  return cells.map(cl => {
    const x0 = clamp(Math.floor(cl.a), 0, T.tw), x1 = clamp(Math.ceil(cl.b), 0, T.tw);
    let mn = 0, mx = 0;
    for (let y = 0; y < T.th; y++) for (let x = x0; x < x1; x++) { const a = T.A[y * T.tw + x], q = buf[y * T.tw + x]; if (a < q) { mn += a; mx += q; } else { mn += q; mx += a; } }
    return { ch: cl.ch, iou: mx ? mn / mx : 1 };
  });
}

/* position of another line of the same block, with size and tracking already known */
function placeLine(c, text, T, pxFull, trEm) {
  const im = inkMetrics(c, text, nRunsOf(T));
  const px = pxFull * T.ky, tr = trEm * px;
  const byWord = T.runs && T.runs.length === im.runs.length && im.runs.length > 1;
  const xs0 = [];
  if (byWord) {
    for (let j = 0; j < im.runs.length; j++) { const w = im.runs[j], r = T.runs[j]; xs0.push(r.s + (r.e - r.s - ((w.L + w.R) * px + tr * (w.n - 1))) / 2 + w.L * px); }
  } else xs0.push(T.box.x0 + (T.box.W - (im.inkW * px + tr * im.gaps)) / 2 + im.runs[0].L * px);
  const oy0 = T.box.y0 + T.box.H / 2 + ((im.A - im.D) * px) / 2;
  const words = byWord ? im.runs.map(r => r.text) : null;
  const buf = new Uint8Array(T.tw * T.th);
  let best = -1, bx = 0, by = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1.001; dx += 0.25) {
      const g = { px, tr, xs: xs0.map(x => x + dx), ox: xs0[0] + dx, oy: oy0 + dy, words };
      renderAlpha(c, text, g, T.tw, T.th, buf);
      const s = iouT(T, buf, 0, 0);
      if (s > best) { best = s; bx = dx; by = dy; }
    }
  }
  return { ox: (xs0[0] + bx) / T.kx + T.offX, oy: (oy0 + by) / T.ky + T.offY, iou: best, xs: xs0.map(x => (x + bx) / T.kx + T.offX), words };
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

/* =====================================================================
   Rendering replacement text
   ===================================================================== */
function lineMetrics(st, text, px) {
  const im = inkMetrics({ fam: st.fam, weight: st.weight, italic: st.italic }, text);
  return { L: im.L * px, R: im.R * px, A: im.A * px, D: im.D * px, W: im.W * px, n: im.n };
}

/* text coverage (0..1) on a w×h canvas; lines: [{text, ox, oy}] */
function textCoverage(st, lines, px, trPx, w, h, lineWidth) {
  const ctx = mctx(w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = fontCss(st, px);
  ctx.fillStyle = INK; ctx.strokeStyle = INK;
  ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  if (lineWidth) ctx.lineWidth = lineWidth;
  for (const ln of lines) {
    if (!ln.text) continue;
    const t = encT(st.fam, ln.text);
    if (lineWidth) drawRun(ctx, t, ln.ox, ln.oy, trPx, true);
    drawRun(ctx, t, ln.ox, ln.oy, trPx, false);
  }
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0, p = 3; i < out.length; i++, p += 4) out[i] = d[p] / 255;
  return out;
}
