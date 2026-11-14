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

