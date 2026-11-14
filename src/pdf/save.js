const PDF_WHY = {
  image: '那里不是 PDF 文字（扫描件或图片里的字）', nested: '旧文字在嵌套的对象里', hidden: '那里是扫描件上的隐藏文字层', strip: '旧文字的写法特殊，没法干净地去掉', ops: '页面内容的结构特殊',
  annot: '改动处有批注或表单域', overlap: '和另一处改动重叠', sysfont: '新文字用的是设备自带的字体，放不进 PDF', synth: '用到了字体本身没有的粗体或斜体', glyph: '字体里缺少要用的字',
  file: '字体文件没取到（离线时需要先下载字体包）', font: '选的是其它页的字体', script: '新文字需要连写排版', soft: '原文字边缘是虚的', look: '写成文字后和屏幕上的样子对不上'
};
function pdfReportText(r) {
  const pl = a => '第 ' + a.join('、') + ' 页';
  if (r.whole) return (r.why === 'protected' ? '这个 PDF 有保护，不能在原文件上改。' : '这个 PDF 的内部结构比较特别，没法在原文件上改。') + '已另存为新文件：每一页都转成了图片，文字不能再选中或搜索。';
  if (r.flat) return pl(r.pages) + '已整页转成图片：旧文字不在文件里了，这些页上的文字也不能再选中或搜索。其它页没有变。';
  let t = '改动在' + pl(r.pages) + '。';
  const whys = Object.keys(r.why).map(k => PDF_WHY[k] || k);
  if (r.text && !r.pics) t += '新文字是真正的文字，已写进 PDF，可以选中、搜索和复制；其它内容没有变。';
  else if (r.text) t += '其中 ' + r.text + ' 处的新文字是真正的文字，可以选中、搜索和复制；另外 ' + r.pics + ' 处是贴上去的图片（' + whys.join('；') + '）。';
  else t += '新文字是贴上去的图片（' + r.dpi + ' dpi），不能选中或搜索' + (whys.length ? '：' + whys.join('；') : '') + '。其它内容没有变。';
  if (r.covered) t += ' 注意：' + pl(r.coveredPages) + '有 ' + r.covered + ' 个旧字没能从文件里去掉，只是被盖住了，搜索或复制还能找到。要彻底去掉，请勾选下面的“整页转成图片”。';
  else if (!r.checked) t += ' 没能复查旧文字是否去净；要保险，请勾选下面的“整页转成图片”。';
  else t += ' 已复查：被替换的旧文字已从文件里去掉，搜索和复制都找不到了。';
  if (r.annots) t += ' 改动处原有的 ' + r.annots + ' 个批注或表单域已并入页面。';
  return t;
}

async function pdfSave() {
  const P = S.pdf;
  if (!P || PDFS.saving) return;
  if (S.edit && S.edit.live) commit('text', true);
  pdfStash();
  if (![...P.pages.values()].some(pg => pg.edits.length)) { toast('这份 PDF 还没有改动'); return; }
  const flat = $('pdfFlat').checked;
  PDFS.saving = true;
  $('sheetTitle').textContent = '保存 PDF'; $('saveNote').textContent = '修改后的文件请合法使用，后果由使用者自负。';
  $('sheetHow').textContent = '正在生成 PDF…';
  $('pdfOpts').hidden = false; $('sheetImg').parentElement.hidden = true;
  $('sheetShare').hidden = true; $('sheetLink').hidden = true;
  $('sheet').hidden = false;
  try {
    const out = await pdfBuild(flat);
    const blob = new Blob([out.bytes], { type: 'application/pdf' }), filename = P.name + '-改字.pdf';
    if (PDFS.out) URL.revokeObjectURL(PDFS.out.url);
    PDFS.out = { url: URL.createObjectURL(blob), report: out.report, size: blob.size };
    const fl = pdfFindLeft();
    $('sheetHow').textContent = pdfReportText(out.report) + '（' + mb(blob.size) + '）' + (fl > 0 ? ' 提醒：查找的“' + P.find.q + '”还有 ' + fl + ' 处没改。' : '');
    if (out.report.whole) { $('pdfFlat').checked = true; $('pdfFlat').disabled = true; }
    const file = typeof File === 'function' ? new File([blob], filename, { type: 'application/pdf' }) : null;
    let share = false;
    try { share = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { share = false; }
    $('sheetShare').hidden = !share; $('sheetShare').textContent = '存到“文件” / 分享';
    $('sheetShare').onclick = () => { navigator.share({ files: [file], title: filename }).catch(() => {}); };
    $('sheetLink').hidden = window.self !== window.top; $('sheetLink').textContent = '下载 PDF';
    $('sheetLink').href = PDFS.out.url; $('sheetLink').download = filename;
  } catch (e) {
    const m = String((e && e.message) || e);
    $('sheetHow').textContent = m === 'protected' ? '这个 PDF 有保护，超过 40 页，没法整份另存成图片。可以先用其它工具去掉保护再来。' : m === 'unreadable' ? '这个 PDF 的内部结构比较特别，超过 40 页，没法整份另存成图片。' : '生成 PDF 时出错了（' + m.slice(0, 80) + '）。可以勾选“整页转成图片”再试一次。';
  } finally { PDFS.saving = false; }
}

function pdfInit() {
  if (BUILD !== 'pages') return;
  $('fileInput').accept = 'image/*,application/pdf,.pdf';
  $('btnOpen').textContent = '打开图片 / PDF';
  $('dropHint').textContent = '松开，打开这个文件';
  $('pgPrev').onclick = () => { if (S.pdf) pdfGo(S.pdf.cur - 1); };
  $('pgNext').onclick = () => { if (S.pdf) pdfGo(S.pdf.cur + 1); };
  $('pgNum').onclick = () => { const P = S.pdf; if (!P || P.n < 2) return; const v = window.prompt('跳到第几页？（1 – ' + P.n + '）', String(P.cur)); if (v != null && +v >= 1) pdfGo(+v); };
  $('pdfFlat').onchange = () => { PDFS.out = null; pdfSave(); };
  $('findGo').onclick = () => pdfFind($('findIn').value);
  $('findIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('findIn').blur(); pdfFind($('findIn').value); } });
  $('findIn').addEventListener('search', () => { if (!$('findIn').value) pdfFind(''); });
  $('ocrGo').onclick = () => pdfOcrRun();
  $('findNext').onclick = () => pdfFindStep(1);
  $('findPrev').onclick = () => pdfFindStep(-1);
  for (const el of [$('pgPrev'), $('pgNext'), $('pgNum')]) el.addEventListener('pointerdown', e => e.stopPropagation());
}
