/* the text under a selection, straight from the PDF → { text, hint, fam } or null when the page has no usable text there */
function pdfReadEdit(ed) {
  const P = S.pdf, pg = P && P.pages.get(P.cur);
  if (!pg) return null;
  if (pdfTouched(ed.userRect)) return null;        // an earlier edit changed this spot: the file's text no longer describes it
  const r = pdfTextIn(pg.map, ed.userRect);
  if (!r.text || r.bad) return null;
  /* one font for the whole selection: that font itself can be tried */
  const ids = new Set();
  for (const g of pdfGlyphsIn(pg.map, ed.userRect)) if (String(g.u || '').trim()) ids.add(g.rec.font);
  if (PDFS.famDirty) { PDFS.famDirty = false; buildFamilySelect(); }
  return { text: r.text, hint: pdfFontHint(r.fonts[0]), fam: ids.size === 1 ? P.fonts.get([...ids][0]) || null : null, lines: r.lines };
}
/* ---------- what an edit did, kept with it for saving ---------- */
const pdfHit = (a, b) => !!a && !!b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/* has an earlier edit of this page changed what lies in r? */
function pdfTouched(r) {
  return S.undo.some(u => (u.pdf ? pdfHit(r, u.pdf.sel) || pdfHit(r, u.pdf.ink) : pdfHit(r, { x: u.x, y: u.y, w: u.after.width, h: u.after.height })));
}
/* On a PDF page the glyphs are known: the ink of a glyph that the selection does not take in is not part of the old text,
   however close it sits, and stays untouched. */
function pdfProtect(ed) {
  const P = S.pdf, pg = P && P.pages.get(P.cur), an = ed.an, r = ed.rect, ur = ed.userRect;
  if (!pg || !an || !an.found) return;
  const keep = [], mine = [];
  for (const s of pg.map.shows) for (const g of s.g) {
    if (!String(g.u || '').trim() || Math.abs(g.a[1] - g.b[1]) > 0.2 * s.h) continue;
    const b = { x0: Math.min(g.a[0], g.b[0]) - r.x, x1: Math.max(g.a[0], g.b[0]) - r.x, y0: Math.min(g.t[1], g.d[1]) - r.y, y1: Math.max(g.t[1], g.d[1]) - r.y };
    if (b.x1 <= 0 || b.x0 >= an.w || b.y1 <= 0 || b.y0 >= an.h) continue;
    (g.c[0] >= ur.x && g.c[0] < ur.x + ur.w && g.c[1] >= ur.y && g.c[1] < ur.y + ur.h ? mine : keep).push(b);
  }
  if (!keep.length || !mine.length) return;
  for (const b of keep) {
    const x0 = Math.max(0, Math.ceil(b.x0)), x1 = Math.min(an.w, Math.floor(b.x1)), y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.min(an.h, Math.ceil(b.y1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (mine.some(m => x >= m.x0 && x < m.x1 && y >= m.y0 && y < m.y1)) continue;
      const i = y * an.w + x;
      an.hole[i] = 0; an.alpha[i] = 0;
    }
  }
}
/* → { sel, area, rm, why, set, ink, cov } or null when the spot is not text of the PDF (a scan, a picture, an earlier edit).
   rm: the glyphs replaced; set: font, size, colour and where every character of the new text goes; why: set when the
   edit cannot be written as text for a reason known already. */
function pdfEditInfo(ed, mode, out) {
  const P = S.pdf, pg = P && P.pages.get(P.cur);
  if (!pg || pdfTouched(ed.rect)) return null;
  const gl = pdfGlyphsIn(pg.map, ed.userRect).filter(g => g.rec.h > 0);
  if (!gl.length) return null;
  const info = { sel: Object.assign({}, ed.userRect), area: Object.assign({}, ed.rect), rm: gl.map(g => [g.rec.k, g.j]), why: '', set: null, ink: null, cov: null };
  if (gl.some(g => !g.rec.top)) info.why = 'nested';
  else if (gl.some(g => g.rec.mode % 4 === 3 || g.rec.mode > 3)) info.why = 'hidden';
  if (mode === 'erase') return info;
  const st = ed.st, px = st.px * st.sizeAdj, tr = (st.trEm + st.trAdj) * px, c = { fam: st.fam, weight: st.weight, italic: st.italic }, r = ed.rect;
  const lines = layoutNew(ed), ctx = mctx(8, 8), runs = [];      // layoutNew measures with the same canvas: set the font after it
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = fontCss(c, px);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const l of lines) {
    if (!l.text) continue;
    if (COMPLEX_RE.test(l.text)) info.why = info.why || 'script';
    const chars = [];
    let prefix = '', i = 0;
    for (const ch of l.text) {          // the same arithmetic as drawRun
      const e = encT(st.fam, ch);
      chars.push({ ch, x: r.x + l.ox + ctx.measureText(prefix + e).width - ctx.measureText(e).width + i * tr });
      prefix += e; i++;
    }
    runs.push({ y: r.y + l.oy, chars });
    x0 = Math.min(x0, r.x + l.ox - l.m.L); x1 = Math.max(x1, r.x + l.ox + l.inkR); y0 = Math.min(y0, r.y + l.oy - l.m.A); y1 = Math.max(y1, r.y + l.oy + l.m.D);
  }
  if (!runs.length) return info;
  if (st.blur > 0.8) info.why = info.why || 'soft';
  info.set = { fam: st.fam, weight: st.weight, italic: st.italic, px, color: st.color.slice(0, 3), userColor: !!ed.userColor, runs };
  info.ink = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (out.cov) { const a = new Uint8Array(out.cov.length); for (let k = 0; k < a.length; k++) a[k] = Math.round(clamp(out.cov[k], 0, 1) * 255); info.cov = { x: out.x, y: out.y, w: out.w, h: out.h, a }; }
  return info;
}
