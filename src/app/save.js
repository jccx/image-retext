/* =====================================================================
   app/save.js — saving the picture. Inside Claude the file goes through Claude's download capability; elsewhere a
   sheet shows the result with a share button (phones: straight into Photos) and a download link.
   A PDF is saved by pdf/save.js, which uses the same sheet.
   ===================================================================== */
async function save() {
  if (!S.img) return;
  if (S.pdf) { pdfSave(); return; }
  $('sheetTitle').textContent = '保存图片'; $('saveNote').textContent = '修改后的图片请合法使用，后果由使用者自负。'; $('sheetHow').textContent = '长按下面的图片选“存储到照片”；电脑上右键选“图片另存为”。';
  $('pdfOpts').hidden = true; $('sheetImg').parentElement.hidden = false; $('sheetShare').textContent = '存到相册 / 分享'; $('sheetLink').textContent = '直接下载';
  if (S.edit && S.edit.live) commit('text', true);
  const left = findLeft();
  if (left > 0) $('saveNote').textContent += ' 提醒：查找的“' + S.pic.find.q + '”还有 ' + left + ' 处没改。';
  const jpg = S.type === 'image/jpeg';
  const blob = await new Promise(res => S.img.toBlob(res, S.type, jpg ? 0.95 : undefined));
  if (!blob) { toast('生成图片失败'); return; }
  const filename = (S.name || 'image') + '-改字.' + (jpg ? 'jpg' : 'png');
  if (S.downloads) {
    try { await S.downloads.save({ filename, data: blob }); toast('已保存'); return; }
    catch (e) { if (e && e.code === 'declined') return; }
  }
  const url = URL.createObjectURL(blob);
  /* phones: the share sheet saves straight to Photos */
  const file = typeof File === 'function' ? new File([blob], filename, { type: blob.type }) : null;
  let share = false;
  try { share = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { share = false; }
  $('sheetShare').hidden = !share;
  $('sheetShare').onclick = () => { navigator.share({ files: [file], title: filename }).catch(() => {}); };
  $('sheetImg').src = url;
  /* a direct link only works when the page is opened on its own, not inside a viewer frame */
  $('sheetLink').hidden = window.self !== window.top;
  $('sheetLink').href = url; $('sheetLink').download = filename;
  $('sheet').hidden = false;
}
/* the save button and the sheet that shows the result */
function saveInit() {
  $('btnSave').onclick = save;
  $('sheetClose').onclick = () => { $('sheet').hidden = true; const u = $('sheetImg').src; $('sheetImg').removeAttribute('src'); if (u) URL.revokeObjectURL(u); };
}
