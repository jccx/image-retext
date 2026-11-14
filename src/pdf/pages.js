/* =====================================================================
   pdf/pages.js — the open PDF: opening it, drawing a page as the picture that is edited, going from page to page.

   S.pdf, the open document (null while a plain picture is open):
     name: the file name without .pdf · bytes: the file as it was opened · pw: its password, if it has one
     doc, lib: the pdf.js document and module · n: number of pages · cur: the page on screen (1…n; 0 until the first is shown)
     busy: a page is being opened
     pages: Map page number → pg, for every page that has been on screen:
       { edits: the edits made on it · vp: the pdf.js viewport it was drawn with · map: its glyph map (core.js)
         annots: its notes and form fields [{ id, subtype, x, y, w, h }] · w, h: the size of its picture }
     fonts: Map pdf.js font id → the family record made for that font (fonts.js)
     and the fields of everything that can be searched (findNew in app/find.js): isPic, lines, imgs, find, ocr

   One page at a time is the picture being edited (S.img), and the edits made on it are the undo list (S.undo).
   When the page is left they are kept in pg.edits (pdfStash) as
     { x, y, w, h: where · after: the pixels after the edit · pdf: what saving needs to know (pdfEditInfo in edit.js), or null }
   and painted on again when the page comes back (pdfApplyEdits).
   ===================================================================== */
/* open a file with pdf.js → promise of the document. askPassword(reason, tries) gives a password, or null to give up. */
function pdfOpenDoc(lib, bytes, askPassword) {
  const task = lib.getDocument({
    data: bytes.slice(), cMapUrl: pdfUrl('cmaps/'), cMapPacked: true, standardFontDataUrl: pdfUrl('standard_fonts/'), wasmUrl: pdfUrl('wasm/'), iccUrl: pdfUrl('iccs/'),
    fontExtraProperties: true, disableWorkerRendering: true, isEvalSupported: false, verbosity: 0
  });
  let tries = 0;
  task.onPassword = (update, reason) => {
    const pw = askPassword ? askPassword(reason, tries++) : null;
    if (pw == null) task.destroy(); else update(pw);
  };
  return task.promise;
}

/* open a PDF the user picked; it takes the place of whatever is open */
async function openPdf(blob, name) {
  if (BUILD !== 'pages') { toast('这个版本只能打开图片；PDF 请用网页版'); return; }
  $('stageNote').textContent = '正在打开 PDF…';
  let lib, doc, pw = null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try { lib = await pdfLib(); } catch (e) { $('stageNote').textContent = ''; toast('PDF 组件没加载成功，请联网后再试一次'); return; }
  try {
    doc = await pdfOpenDoc(lib, bytes, (reason, n) => (pw = window.prompt(n ? '密码不对，请再输入一次' : '这个 PDF 设了打开密码，请输入')));
  } catch (e) { $('stageNote').textContent = ''; toast(pw != null || /password/i.test(String(e && e.name)) ? '没有密码，打不开这个 PDF' : '这个 PDF 打不开，文件可能已损坏'); return; }
  if (S.pdf) pdfDestroy(S.pdf.doc);
  if (S.edit) dropEdit();
  pdfDropFonts();
  S.pdf = Object.assign(findNew(false), { name: (name || 'document').replace(/\.pdf$/i, ''), bytes, doc, lib, n: doc.numPages, cur: 0, pages: new Map(), busy: false, pw, fonts: new Map() });
  S.pic = null;
  PDFS.out = null;
  $('findIn').value = ''; findRender();
  await pdfGo(1);
  warmReader();
  pdfScanPages(S.pdf);
}

/* the size a page is drawn at: three picture pixels per PDF point (216 dpi) where the page allows it; phones cap the size of a canvas */
function pdfViewport(page) {
  const v1 = page.getViewport({ scale: 1 }), side = Math.max(v1.width, v1.height);
  return page.getViewport({ scale: Math.max(0.5, Math.min(Math.max(3, 1500 / side), Math.sqrt(9e6 / (v1.width * v1.height)), 4096 / side)) });
}
/* draw a page → a canvas of the viewport's size, white where the page is empty */
async function pdfDrawPage(page, vp) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvas: null, canvasContext: x, viewport: vp, background: '#fff' }).promise;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  return c;
}
/* draw one page and read where its glyphs, pictures, notes and form fields are → { c: canvas, x: its context, vp, map, annots } */
async function pdfRender(no) {
  const P = S.pdf, lib = P.lib, page = await P.doc.getPage(no), vp = pdfViewport(page);
  const c = await pdfDrawPage(page, vp), x = c.getContext('2d', { willReadFrequently: true });
  let map = { shows: [], nTop: 0 }, annots = [];
  try {
    const ol = await page.getOperatorList({ annotationMode: lib.AnnotationMode.DISABLE });
    map = pdfGlyphMap(ol, lib.OPS, id => { try { return page.commonObjs.get(id); } catch (e) { return null; } }, vp.transform);
    for (const s of map.shows) pdfNoteFont(P, s.font, s.fo, s.glyphs);
    pdfNotePics(P, no, map);
  } catch (e) { /* no text information: the page is treated as a picture */ }
  try {
    for (const a of await page.getAnnotations()) {
      if (!a.rect || a.subtype === 'Link' || a.subtype === 'Popup') continue;
      const p = vp.convertToViewportPoint(a.rect[0], a.rect[1]), q = vp.convertToViewportPoint(a.rect[2], a.rect[3]);
      annots.push({ id: a.id, subtype: a.subtype, x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) });
    }
  } catch (e) { annots = []; }
  return { c, x, vp, map, annots };
}
/* the pictures of a page that are large enough to hold text */
function pdfNotePics(P, no, map) { P.imgs.set(no, (map.imgs || []).filter(r => r.w >= 60 && r.h >= 24 && r.w * r.h >= 6000)); }
/* where the glyphs of a page are; a page that is not on screen is worked out and forgotten again (its fonts and pictures are noted) */
async function pdfPageMap(P, no) {
  if (P.pages.has(no)) return P.pages.get(no).map;
  const page = await P.doc.getPage(no), ol = await page.getOperatorList({ annotationMode: P.lib.AnnotationMode.DISABLE });
  const map = pdfGlyphMap(ol, P.lib.OPS, id => { try { return page.commonObjs.get(id); } catch (e) { return null; } }, pdfViewport(page).transform);
  for (const s of map.shows) pdfNoteFont(P, s.font, s.fo, s.glyphs);
  pdfNotePics(P, no, map);
  if (no !== P.cur) page.cleanup();
  return map;
}

/* keep the edits of the page being left, so they can be put back and written out later */
function pdfStash() {
  const P = S.pdf;
  if (!P || !P.cur) return;
  const pg = P.pages.get(P.cur);
  if (pg) pg.edits = S.undo.map(u => ({ x: u.x, y: u.y, w: u.after.width, h: u.after.height, after: u.after, pdf: u.pdf || null }));
}
/* paint edits onto a page picture. undo: the list that receives what was there before (to make them undoable), or null */
function pdfApplyEdits(x, edits, undo) {
  for (const e of edits) {
    if (undo) undo.push({ x: e.x, y: e.y, data: x.getImageData(e.x, e.y, e.w, e.h), after: e.after, pdf: e.pdf || null });
    x.putImageData(e.after, e.x, e.y);
  }
}
/* show page `no`: the edits of the page being left are kept, those of the page shown are painted back on */
async function pdfGo(no) {
  const P = S.pdf;
  if (!P || P.busy) return;
  no = clamp(Math.round(no) || 1, 1, P.n);
  if (S.edit) { if (S.edit.live && S.edit.newText !== S.edit.origText) commit('text', true); else dropEdit(); }
  pdfStash();
  P.busy = true;
  $('stageNote').textContent = '正在打开第 ' + no + ' 页…';
  try {
    const r = await pdfRender(no);
    if (S.pdf !== P) return;
    const old = P.pages.get(no), pg = { edits: old ? old.edits : [], vp: r.vp, map: r.map, annots: r.annots, w: r.c.width, h: r.c.height };
    P.pages.set(no, pg); P.cur = no;
    setImage(r.c, r.x, P.name, 'image/png', false);
    pdfApplyEdits(S.ictx, pg.edits, S.undo);
    $('btnUndo').disabled = !S.undo.length;
    PDFS.out = null;
    findRender();
    requestDraw();
  } catch (e) { toast('第 ' + no + ' 页没能显示出来'); }
  finally { P.busy = false; pdfPager(); if ($('stageNote').textContent.startsWith('正在打开')) $('stageNote').textContent = ''; }
}
/* the page number between its two arrows */
function pdfPager() {
  const P = S.pdf, el = $('pager');
  el.hidden = !P;
  findRender();
  if (!P) return;
  $('pgNum').textContent = P.cur + ' / ' + P.n;
  $('pgPrev').disabled = P.cur <= 1; $('pgNext').disabled = P.cur >= P.n;
}
/* a plain picture takes the place of the PDF */
function pdfClose() {
  if (S.pdf) pdfDestroy(S.pdf.doc);
  pdfDropFonts();
  S.pdf = null; PDFS.out = null;
  $('findIn').value = ''; findRender();
  pdfPager();
}
/* look through the other pages (a 7 that page 1 lacks may be on page 5): more characters of the same fonts, which pages
   have pictures, and the text to search */
async function pdfScanPages(P) {
  for (let no = 1; no <= Math.min(P.n, 40); no++) {
    await new Promise(r => setTimeout(r, 30));
    if (S.pdf !== P) return;
    if (P.lines.has(no)) continue;
    await findLines(P, no);
    if (S.pdf === P && no % 5 === 0) findRender();
  }
  if (S.pdf !== P) return;
  findRender();
  if (PDFS.famDirty) { PDFS.famDirty = false; buildFamilySelect(); }
}
