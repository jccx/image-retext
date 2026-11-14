/* =====================================================================
   Font matching: render each candidate, compare with the observed alpha
   ===================================================================== */
const GENERIC = new Set(['system-ui', 'ui-rounded', 'ui-serif', 'ui-monospace', 'sans-serif', 'serif', 'monospace', 'cursive']);
const COMPLEX_RE = /[֐-ࣿऀ-෿฀-໿ក-៿]/;
/* A font that came with a PDF can only be drawn through the codes pdf.js gave its glyphs (fam.pdf.map: character → { fc }, see pdf/fonts.js);
   text is translated just before it is measured or drawn. Every other family draws the text as it is. */
function encT(fam, t) {
  if (!fam || !fam.pdf) return t;
  let out = '';
  for (const ch of t) { const e = fam.pdf.map.get(ch); out += e ? e.fc : ch; }
  return out;
}
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

/* each: place every character on its own even without letter spacing (a PDF sets text that way, so new text for a PDF is drawn that way too) */
function drawRun(ctx, text, ox, oy, tr, stroke, each) {
  const cps = Array.from(text);
  if ((!each && Math.abs(tr) < 0.01) || cps.length < 2 || COMPLEX_RE.test(text)) {
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
const REF = 200; // reference px size for font metrics
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
