/* ---------- controls ---------- */
$('btnOpen').onclick = () => $('fileInput').click();
$('fileInput').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { await loadBlob(f, f.name); } catch (err) { toast(isPdf(f, f.name) ? '这个 PDF 打不开' : '这张图片打不开，换一张 PNG 或 JPG 试试'); }
};
$('btnUndo').onclick = undo;
$('btnCancel').onclick = dropEdit;
$('btnApply').onclick = () => {
  const ed = S.edit;
  if (!ed) return;
  if (!ed.newText.trim()) { toast('先在“新文字”里输入要换成的内容'); $('inNew').focus(); return; }
  if (ed.newText === ed.origText) { toast('新文字和原文字一样，改一下再应用'); $('inNew').focus(); return; }
  commit('text');
};
$('btnErase').onclick = () => commit('erase');
$('btnOcr').onclick = () => {
  const ed = S.edit;
  if (!ed) return;
  if (!S.sample) { readText(ed, true); return; }
  if (!ed.origText) { readText(ed); return; }
  ed.ocr = { tier: 'manual', text: ed.origText, reread: true };
  recognize('default');
};
$('btnMore').onclick = () => { if (S.edit) { S.edit.tier = 2; scheduleMatch(0); } };
{
  const b = $('btnCompare');
  const on = e => { e.preventDefault(); const ed = S.edit; if (!ed || !ed.live || S.comparing) return; S.comparing = true; b.classList.add('held'); S.ictx.putImageData(ed.live.before, ed.live.x, ed.live.y); requestDraw(); };
  const off = () => { const ed = S.edit; if (!S.comparing) return; S.comparing = false; b.classList.remove('held'); if (ed && ed.live) S.ictx.putImageData(ed.live.after, ed.live.x, ed.live.y); requestDraw(); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') on(e); });
  b.addEventListener('keyup', off);
}
$('selFamily').onchange = e => { const f = FAM.get(e.target.value); if (f && S.edit) { S.edit.st.famUser = true; chooseFont(f, S.edit.st.weight, S.edit.st.italic); } };
$('selWeight').onchange = e => { if (S.edit) { S.edit.st.weightUser = true; chooseFont(S.edit.st.fam, +e.target.value, S.edit.st.italic); } };
$('chkItalic').onchange = e => { if (S.edit) chooseFont(S.edit.st.fam, S.edit.st.weight, e.target.checked); };
$('numSize').oninput = e => { const v = parseFloat(e.target.value); if (S.edit && v > 0) { S.edit.st.sizeAdj = v / S.edit.st.px; refresh(); } };
$('numTrack').oninput = e => { const v = parseFloat(e.target.value); if (S.edit && isFinite(v)) { S.edit.st.trAdj = v / 1000 - S.edit.st.trEm; refresh(); } };
for (const b of document.querySelectorAll('[data-step]')) b.onclick = () => {
  const ed = S.edit; if (!ed) return;
  const st = ed.st, d = +b.dataset.d;
  if (b.dataset.step === 'size') { const px = Math.max(1, Math.round((st.px * st.sizeAdj + d * 0.5) * 2) / 2); st.sizeAdj = px / st.px; }
  else st.trAdj = (Math.round((st.trEm + st.trAdj) * 200 + d) / 200) - st.trEm;
  refresh();
};
$('inColor').oninput = e => { const c = hexRgb(e.target.value); if (S.edit && c) { S.edit.st.color = c; S.edit.userColor = true; refresh(); } };
$('inHex').oninput = e => { const c = hexRgb(e.target.value); if (S.edit && c) { S.edit.st.color = c; S.edit.userColor = true; refresh(); } };
for (const b of document.querySelectorAll('[data-align]')) b.onclick = () => { if (S.edit) { S.edit.st.align = b.dataset.align; S.edit.st.alignUser = true; refresh(); } };
for (const b of document.querySelectorAll('[data-nx]')) b.onclick = () => { if (S.edit) { S.edit.st.dx += +b.dataset.nx * 0.5; S.edit.st.dy += +b.dataset.ny * 0.5; refresh(); } };
$('rngBlur').oninput = e => { if (S.edit) { S.edit.st.blur = +e.target.value; refresh(); } };
$('rngGrow').oninput = e => {
  const ed = S.edit; if (!ed) return;
  restoreLive();
  analyzeEdit(ed, +e.target.value);
  $('outGrow').textContent = e.target.value;
  refresh();
};
$('btnFont').onclick = () => $('fontInput').click();
$('fontInput').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const name = f.name.replace(/\.[^.]+$/, '').replace(/["\\]/g, '').slice(0, 60) || '上传字体';
    const face = new FontFace(name, await f.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    const fam = { n: name, c: 's', w: [400, 700], it: 1, tier: 0, sc: '', sys: true, cjk: true, custom: true, label: name };
    FAM.set(name, fam); if (!sysFams.includes(fam)) sysFams.push(fam);
    buildFamilySelect();
    if (S.edit) chooseFont(fam, S.edit.st.weight, S.edit.st.italic);
    toast('已加入字体：' + name);
  } catch (err) { toast('这个字体文件读不了，请用 TTF、OTF 或 WOFF2'); }
};
