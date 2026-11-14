/* =====================================================================
   app/edit.js — the life of an edit. A box is drawn (startEdit), what is in it is analysed (analyzeEdit), and the edit
   stays open in S.edit until it is applied (app/apply.js) or dropped. Its fields are described in app/state.js.
   ===================================================================== */
/* a rectangle in whole pixels, cut to the picture */
function clampRect(r) {
  const x0 = clamp(Math.floor(r.x), 0, S.iw), y0 = clamp(Math.floor(r.y), 0, S.ih);
  const x1 = clamp(Math.ceil(r.x + r.w), 0, S.iw), y1 = clamp(Math.ceil(r.y + r.h), 0, S.ih);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/* take the preview of the open edit out of the picture again */
function restoreLive() { const ed = S.edit; if (ed && ed.live) { S.ictx.putImageData(ed.live.before, ed.live.x, ed.live.y); ed.live = null; } }
/* give the open edit up: the picture is as it was */
function dropEdit() {
  if (S.edit) { S.edit.matchToken++; restoreLive(); }
  S.edit = null;
  $('pEdit').hidden = true; $('pIdle').hidden = false;
  requestDraw();
}
/* Look at what is in the box: the region (the box with a margin), its text and background, its lines.
   keepGrow: the 擦除范围 the user has set, or null to let the analysis choose. */
function analyzeEdit(ed, keepGrow) {
  const ur = ed.userRect;
  const pad = Math.round(Math.min(ur.w, ur.h) * 0.08) + 2;
  ed.rect = clampRect({ x: ur.x - pad, y: ur.y - pad, w: ur.w + 2 * pad, h: ur.h + 2 * pad });
  const img = S.ictx.getImageData(ed.rect.x, ed.rect.y, ed.rect.w, ed.rect.h);
  ed.an = analyzeRegion(img, keepGrow != null ? { grow: keepGrow } : null);
  if (S.pdf) pdfProtect(ed);
  ed.bands = findBands(ed.an.alpha, ed.an.w, ed.an.h, ed.origLines.length || 0);
}
/* A box has been drawn: open an edit for it.
   keep: the box of the open edit was resized, so its texts carry over. (Otherwise an open edit with a change in it is applied first.)
   hit: the occurrence of a searched text that the box is for (app/find.js). */
function startEdit(userRect, keep, hit) {
  const prev = S.edit;
  let carry = null;
  if (prev) {
    if (keep) carry = prev;
    else if (prev.newText && prev.newText !== prev.origText && prev.live) { commit('text', true); toast('上一处修改已应用，可以撤销'); }
    if (S.edit) { S.edit.matchToken++; restoreLive(); }
  }
  const ed = {
    userRect, rect: null, an: null, bands: [], st: null,
    origText: carry ? carry.origText : '', newText: carry ? carry.newText : '', origLines: carry ? carry.origLines : [],
    ocr: null, varDone: false,
    cands: [], fit: [], matchToken: 0, tier: carry ? carry.tier : 1, primary: 0, primaryText: '', T2: null, T2c: null,
    live: null, userColor: false,
    pdfHint: null, pdfFam: null, pdfLines: null, pdfAlt: false,
    find: carry ? carry.find : hit || null
  };
  S.edit = ed;
  analyzeEdit(ed, null);
  const b0 = ed.bands[0];
  ed.st = {
    fam: S.lastFam || FAM.get('sans-serif'), weight: 400, italic: false, px: b0 ? (b0.y1 - b0.y0) / 0.72 : ed.rect.h * 0.6,
    trEm: 0, color: ed.an.color.slice(), blur: 0, align: 'left', dx: 0, dy: 0, sizeAdj: 1, trAdj: 0, matched: false, geo: null, score: null,
    famUser: false, weightUser: false, alignUser: false
  };
  $('pIdle').hidden = true; $('pEdit').hidden = false;
  $('inOrig').value = ed.origText; $('inNew').value = ed.newText;
  autoRows($('inOrig')); autoRows($('inNew'));
  $('rngGrow').value = ed.an.grow; $('outGrow').textContent = ed.an.grow;
  renderCands();
  if (!ed.an.found) setStatus('框里没找到明显的文字。把框缩到只包住文字和底色再试。', true);
  else if (ed.origLines.length) { setStatus(''); scheduleMatch(0); }
  else readText(ed);
  computeFit(ed); refresh();
  if (S.demo) $('stageNote').textContent = '示例图片';
}
