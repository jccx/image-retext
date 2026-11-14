/* =====================================================================
   Rendering replacement text
   ===================================================================== */
function lineMetrics(st, text, px) {
  const im = inkMetrics({ fam: st.fam, weight: st.weight, italic: st.italic }, text);
  return { L: im.L * px, R: im.R * px, A: im.A * px, D: im.D * px, W: im.W * px, n: im.n };
}

/* text coverage (0..1) on a w×h canvas; lines: [{text, ox, oy}] */
function textCoverage(st, lines, px, trPx, w, h, lineWidth, each) {
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
    if (lineWidth) drawRun(ctx, t, ln.ox, ln.oy, trPx, true, each);
    drawRun(ctx, t, ln.ox, ln.oy, trPx, false, each);
  }
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0, p = 3; i < out.length; i++, p += 4) out[i] = d[p] / 255;
  return out;
}
