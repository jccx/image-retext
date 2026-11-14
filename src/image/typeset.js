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
