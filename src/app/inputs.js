/* =====================================================================
   app/inputs.js — the two text boxes of an edit: 原文字, what the picture says (the font match goes by it),
   and 新文字, what it should say (the preview goes by it).
   ===================================================================== */
/* an input method is at work (pinyin being typed): the half-typed text is not matched */
let composing = false;
/* The original text of the open edit is v. fromOcr: it was read rather than typed, so the box shows it, and an empty
   新文字 starts as a copy of it (or as the replacement typed before for the same searched text). */
function setOrig(v, fromOcr) {
  const ed = S.edit;
  if (!ed) return;
  ed.origText = v;
  ed.origLines = v.split('\n').map(s => s.trim()).filter(Boolean);
  if (fromOcr) { $('inOrig').value = v; autoRows($('inOrig')); if (!ed.newText) { ed.newText = findRepl(ed) || v; $('inNew').value = ed.newText; autoRows($('inNew')); } }
  if (ed.origLines.length) scheduleMatch(fromOcr ? 0 : 550);
  else { ed.matchToken++; ed.st.matched = false; ed.st.score = null; ed.cands = []; renderCands(); computeFit(ed); refresh(); setStatus('输入原文字后，自动比对字体。'); }
}
function inputsInit() {
  $('inOrig').addEventListener('compositionstart', () => { composing = true; });
  $('inOrig').addEventListener('compositionend', e => { composing = false; setOrig(e.target.value); });
  $('inOrig').addEventListener('input', e => { autoRows(e.target); if (!composing) setOrig(e.target.value); });
  $('inNew').addEventListener('input', e => {
    autoRows(e.target);
    const ed = S.edit;
    if (!ed) return;
    ed.newText = e.target.value;
    pdfFontFor(ed);
    pdfCoverNote(ed);
    if (!ed.st.matched && ed.an.found) {
      computeFit(ed);
      if (!ed.origLines.length && ed.newText.trim() && !/正在/.test($('matchStatus').textContent)) setStatus('没有原文字：大小和位置按旧字的外框估算。填上原文字可比对出字体。');
    }
    refresh();
  });
}
