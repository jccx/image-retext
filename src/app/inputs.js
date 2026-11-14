/* ---------- text inputs ---------- */
let composing = false;
function setOrig(v, fromOcr) {
  const ed = S.edit;
  if (!ed) return;
  ed.origText = v;
  ed.origLines = v.split('\n').map(s => s.trim()).filter(Boolean);
  if (fromOcr) { $('inOrig').value = v; autoRows($('inOrig')); if (!ed.newText) { ed.newText = pdfFindRepl(ed) || v; $('inNew').value = ed.newText; autoRows($('inNew')); } }
  if (ed.origLines.length) scheduleMatch(fromOcr ? 0 : 550);
  else { ed.matchToken++; ed.st.matched = false; ed.st.score = null; ed.cands = []; renderCands(); computeFit(ed); refresh(); setStatus('输入原文字后，自动比对字体。'); }
}
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
