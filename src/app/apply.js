/* build the patch: repaired background + new text. Reads the clean image. */
function compose(ed, mode) {
  const { rect, an, st } = ed;
  const lines = mode === 'erase' ? [] : layoutNew(ed);
  const px = st.px * st.sizeAdj, tr = (st.trEm + st.trAdj) * px;
  const padT = Math.ceil(st.blur * 3) + 3;
  let x0 = 0, y0 = 0, x1 = rect.w, y1 = rect.h;
  for (const l of lines) {
    x0 = Math.min(x0, l.ox - l.m.L - padT); x1 = Math.max(x1, l.ox + l.inkR + padT);
    y0 = Math.min(y0, l.oy - l.m.A - padT); y1 = Math.max(y1, l.oy + l.m.D + padT);
  }
  const wr = clampRect({ x: rect.x + x0, y: rect.y + y0, w: x1 - x0, h: y1 - y0 });
  const base = S.ictx.getImageData(wr.x, wr.y, wr.w, wr.h), bd = base.data;
  const ox = rect.x - wr.x, oy = rect.y - wr.y;
  for (let y = 0; y < an.h; y++) {
    for (let x = 0; x < an.w; x++) {
      const i = y * an.w + x;
      if (!an.hole[i]) continue;
      const p = ((y + oy) * wr.w + x + ox) * 4;
      bd[p] = an.bR[i]; bd[p + 1] = an.bG[i]; bd[p + 2] = an.bB[i];
    }
  }
  let cov = null;
  if (lines.length) {
    setInk(st.color);
    cov = textCoverage(st, lines.map(l => ({ text: l.text, ox: l.ox + ox, oy: l.oy + oy })), px, tr, wr.w, wr.h, 0, !!S.pdf);
    if (st.blur > 0.05) cov = gaussBlur(cov, wr.w, wr.h, st.blur);
    const cr = st.color[0], cg = st.color[1], cb = st.color[2];
    for (let i = 0, p = 0; i < cov.length; i++, p += 4) {
      const a = cov[i];
      if (a < 0.004) continue;
      bd[p] += (cr - bd[p]) * a; bd[p + 1] += (cg - bd[p + 1]) * a; bd[p + 2] += (cb - bd[p + 2]) * a;
    }
  }
  return { x: wr.x, y: wr.y, w: wr.w, h: wr.h, data: base, cov };
}

function renderLive() {
  const ed = S.edit;
  if (!ed) return;
  restoreLive();
  /* nothing is touched until there is a real change: no blanking on selection, no redraw of identical text */
  if (!ed.newText.trim() || ed.newText === ed.origText) { requestDraw(); return; }
  const out = compose(ed, 'text');
  const before = S.ictx.getImageData(out.x, out.y, out.w, out.h);
  S.ictx.putImageData(out.data, out.x, out.y);
  ed.live = { x: out.x, y: out.y, before, after: out.data };
  requestDraw();
}
function commit(mode, quiet) {
  const ed = S.edit;
  if (!ed) return;
  ed.matchToken++;
  restoreLive();
  const out = compose(ed, mode);
  const before = S.ictx.getImageData(out.x, out.y, out.w, out.h);
  S.ictx.putImageData(out.data, out.x, out.y);
  /* on a PDF page: what the edit replaced and how the new text is set, so that saving can write it into the file as text */
  S.undo.push({ x: out.x, y: out.y, data: before, after: out.data, pdf: S.pdf ? pdfEditInfo(ed, mode, out) : null });
  if (S.undo.length > 60 && !S.pdf) S.undo.shift();      // every edit of a PDF page is needed to write it back
  PDFS.out = null;
  $('btnUndo').disabled = false;
  S.lastFam = ed.st.fam;
  S.edit = null;
  $('pEdit').hidden = true; $('pIdle').hidden = false;
  const left = pdfFindApplied(ed, mode);
  if (!quiet) toast(mode === 'erase' ? '已擦除。可以继续框选' : left > 0 ? '已应用。查找的文字还剩 ' + left + ' 处没改' : left === 0 ? '已应用。查找到的几处都改完了' : '已应用。可以继续框选其它文字');
  requestDraw();
}
function undo() {
  if (S.edit) { dropEdit(); return; }
  const u = S.undo.pop();
  if (!u) return;
  S.ictx.putImageData(u.data, u.x, u.y);
  PDFS.out = null;
  $('btnUndo').disabled = !S.undo.length;
  pdfFindInfo();
  requestDraw();
}
