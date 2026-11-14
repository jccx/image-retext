/* ---------- keyboard, paste, drop ---------- */
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
/* keys, pasting a picture, dropping a file */
function shortcutsInit() {
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('privSheet').hidden) $('privClose').click(); else if (!$('offSheet').hidden) $('offClose').click(); else if (!$('sheet').hidden) $('sheetClose').click(); else if (S.edit) dropEdit(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && S.edit) { e.preventDefault(); commit('text'); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing()) { e.preventDefault(); undo(); }
    else if (e.key === ' ' && !typing() && e.target === document.body) { S.space = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { if (e.key === ' ') S.space = false; });
  window.addEventListener('paste', e => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) if (it.kind === 'file' && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); loadBlob(f, '粘贴的图片').catch(() => toast('这张图片打不开')); } return; }
  });
  stage.addEventListener('dragover', e => { e.preventDefault(); $('dropHint').hidden = false; });
  stage.addEventListener('dragleave', () => { $('dropHint').hidden = true; });
  stage.addEventListener('drop', e => {
    e.preventDefault(); $('dropHint').hidden = true;
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && (f.type.startsWith('image/') || (BUILD === 'pages' && isPdf(f, f.name)))) loadBlob(f, f.name).catch(() => toast('这个文件打不开'));
  });
}
