/* =====================================================================
   image/pixels.js — arithmetic on pixel arrays: filling a hole from its surroundings, a threshold,
   growing a mask, blurring.
   An array holds one number per pixel, row after row (index = y * w + x); a mask holds 0 or 1.
   No canvas and no state: every function works on what it is given.
   ===================================================================== */

/* Fill the pixels where M[i] == 1 from the pixels around them, smoothly (each filled pixel ends up as the mean of its
   four neighbours). R, G, B are changed in place. A half-size copy is solved first, so that large holes fill quickly. */
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

/* Otsu's threshold: the level (0–255) that best splits a 256-bin histogram into a dark and a light group */
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

/* grow a mask by r pixels in every direction → new Uint8Array */
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

/* Gaussian blur of a one-channel picture → new Float32Array */
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

/* median of the first n values (the array is left as it is) */
function medianOf(arr, n) {
  if (!n) return 0;
  const a = Float32Array.from(arr.subarray ? arr.subarray(0, n) : arr.slice(0, n));
  a.sort();
  return a[n >> 1];
}

/* a small random generator → function giving 0…1. The same seed gives the same numbers, so a repaired patch looks the same every time it is drawn. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
