/* =====================================================================
   pdf.js — PDF files in the app (installable build only).
   A PDF page is drawn as a picture and edited exactly like an image. On saving, the edits go back
   into the PDF: the replaced glyphs are taken out of the page (pdfcore.js) and each edit is laid
   over the page as a small picture; everything else in the file stays as it was.
   Libraries, hosted alongside the app and loaded only when a PDF is opened:
     pdf.js (Mozilla, Apache-2.0) draws pages and reports the glyphs; pdf-lib (MIT) writes the file.
   ===================================================================== */
const PDFS = { libP: null, wrP: null, saving: false, out: null };
const PDF_DIR = 'pdf/';
const pdfUrl = f => new URL(PDF_DIR + f, document.baseURI).href;

function pdfLib() {
  if (!PDFS.libP) {
    PDFS.libP = import(pdfUrl('pdf.min.js')).then(m => { m.GlobalWorkerOptions.workerSrc = pdfUrl('pdf.worker.min.js'); return m; });
    PDFS.libP.catch(() => { PDFS.libP = null; });
  }
  return PDFS.libP;
}
function pdfWriter() {
  if (!PDFS.wrP) {
    PDFS.wrP = new Promise((res, rej) => {
      if (window.PDFLib) { res(window.PDFLib); return; }
      const s = document.createElement('script');
      s.src = pdfUrl('pdf-lib.min.js');
      s.onload = () => (window.PDFLib ? res(window.PDFLib) : rej(new Error('pdf-lib')));
      s.onerror = () => rej(new Error('pdf-lib'));
      document.head.appendChild(s);
    });
    PDFS.wrP.catch(() => { PDFS.wrP = null; });
  }
  return PDFS.wrP;
}
const pdfDestroy = doc => { try { doc.loadingTask.destroy(); } catch (e) { /* already gone */ } };
const isPdf = (blob, name) => /pdf/i.test(blob.type || '') || /\.pdf$/i.test(name || '');

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
  S.pdf = { name: (name || 'document').replace(/\.pdf$/i, ''), bytes, doc, lib, n: doc.numPages, cur: 0, pages: new Map(), busy: false, pw, fonts: new Map() };
  PDFS.out = null;
  await pdfGo(1);
  warmReader();
  pdfScanFonts(S.pdf);
}

/* draw one page → { c, x, vp, map, annots } */
async function pdfRender(no) {
  const P = S.pdf, lib = P.lib, page = await P.doc.getPage(no);
  const v1 = page.getViewport({ scale: 1 }), side = Math.max(v1.width, v1.height);
  /* three picture pixels per PDF point (216 dpi) where the page allows it; phones cap the size of a canvas */
  const scale = Math.max(0.5, Math.min(Math.max(3, 1500 / side), Math.sqrt(9e6 / (v1.width * v1.height)), 4096 / side));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvas: null, canvasContext: x, viewport: vp, background: '#fff' }).promise;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  let map = { shows: [], nTop: 0 }, annots = [];
  try {
    const ol = await page.getOperatorList({ annotationMode: lib.AnnotationMode.DISABLE });
    map = pdfGlyphMap(ol, lib.OPS, id => { try { return page.commonObjs.get(id); } catch (e) { return null; } }, vp.transform);
    for (const s of map.shows) pdfNoteFont(P, s.font, s.fo, s.glyphs);
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

/* keep the edits of the page being left, so they can be put back and written out later */
function pdfStash() {
  const P = S.pdf;
  if (!P || !P.cur) return;
  const pg = P.pages.get(P.cur);
  if (pg) pg.edits = S.undo.map(u => ({ x: u.x, y: u.y, w: u.after.width, h: u.after.height, after: u.after }));
}
function pdfApplyEdits(x, edits, undo) {
  for (const e of edits) {
    if (undo) undo.push({ x: e.x, y: e.y, data: x.getImageData(e.x, e.y, e.w, e.h), after: e.after });
    x.putImageData(e.after, e.x, e.y);
  }
}
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
    requestDraw();
  } catch (e) { toast('第 ' + no + ' 页没能显示出来'); }
  finally { P.busy = false; pdfPager(); if ($('stageNote').textContent.startsWith('正在打开')) $('stageNote').textContent = ''; }
}
function pdfPager() {
  const P = S.pdf, el = $('pager');
  el.hidden = !P;
  if (!P) return;
  $('pgNum').textContent = P.cur + ' / ' + P.n;
  $('pgPrev').disabled = P.cur <= 1; $('pgNext').disabled = P.cur >= P.n;
}
function pdfClose() {
  if (S.pdf) pdfDestroy(S.pdf.doc);
  pdfDropFonts();
  S.pdf = null; PDFS.out = null;
  pdfPager();
}

/* ---------- reading: the PDF knows its own text ---------- */
const PDF_ALIAS = [
  [/arial|helvetica|liberationsans|nimbussans|arimo/, 'Arimo'], [/timesnewroman|^times|liberationserif|nimbusroman|tinos/, 'Tinos'], [/courier|liberationmono|nimbusmono|cousine/, 'Cousine'],
  [/calibri|carlito/, 'Carlito'], [/cambria|caladea/, 'Caladea'], [/georgia/, 'Gelasio'],
  [/simsun|songti|stsong|sourcehanserif|notoserifcjk|notoserifsc|fangsong/, 'Noto Serif SC'],
  [/simhei|yahei|msyh|pingfang|heiti|sourcehansans|notosanscjk|notosanssc|dengxian|stxihei/, 'Noto Sans SC']
];
const pdfSquash = s => s.toLowerCase().replace(/[^a-z0-9㐀-鿿]/g, '');
/* a font name as PDFs write it (ABCDEF+TimesNewRomanPS-BoldMT) → { label, fams: families worth trying first, weight, italic } */
function pdfFontHint(name) {
  const raw = String(name || '').replace(/^[A-Z]{6}\+/, '');
  if (!raw || /^g_d\d|^CIDFont|^F\d+$|^T\d+$/i.test(raw)) return null;
  const [base, style = ''] = raw.split(/[-,]/, 2), sq = pdfSquash(base), st = (style + ' ' + base).toLowerCase();
  const fams = [];
  let bestLen = 0;
  for (const f of FAM.values()) { const q = pdfSquash(f.n); if (q.length >= 4 && sq.startsWith(q) && q.length >= bestLen) { if (q.length > bestLen) fams.length = 0; bestLen = q.length; fams.push(f); } }
  for (const [re, n] of PDF_ALIAS) if (re.test(sq) && FAM.has(n) && !fams.includes(FAM.get(n))) fams.push(FAM.get(n));
  const weight = /black|heavy/.test(st) ? 900 : /extrabold|ultrabold/.test(st) ? 800 : /semibold|demi/.test(st) ? 600 : /bold/.test(st) ? 700 : /medium/.test(st) ? 500 : /extralight|thin/.test(st) ? 200 : /light/.test(st) ? 300 : 400;
  return { label: raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' '), fams, weight, italic: /italic|oblique/.test(st) };
}
/* ---------- the PDF's own fonts ----------
   pdf.js loads every font of the file to draw the pages. The same fonts can draw the new text, which then matches the
   old exactly, but only with the characters the file carries (fonts in a PDF are usually cut down to what the document uses). */
function pdfNoteFont(P, id, f, glyphs) {
  if (!id || !f || f.isType3Font || f.vertical || f.disableFontFace || f.isInvalidPDFjsFont) return;
  let fam = P.fonts.get(id);
  if (!fam) {
    const hint = pdfFontHint(f.name) || { label: id, weight: 400, italic: false };
    fam = { n: 'pdf:' + id, label: 'PDF 自带 · ' + hint.label, c: f.isMonospace ? 'm' : f.isSerifFont ? 'r' : 's', w: [hint.weight], it: 0, tier: 0, sc: '', sys: true, cjk: true,
      pdf: { id, css: (f.systemFontInfo && f.systemFontInfo.css) || '"' + (f.loadedName || id) + '", ' + (f.fallbackName || 'sans-serif'), fs: f.italic ? 'italic' : 'normal', fw: f.black ? '900' : f.bold ? 'bold' : 'normal', map: new Map(), whole: !!f.systemFontInfo } };
    P.fonts.set(id, fam); FAM.set(fam.n, fam);
    PDFS.famDirty = true;
  }
  const m = fam.pdf.map;
  for (const g of glyphs) {
    if (typeof g === 'number' || !g.fontChar || (!g.isInFont && !f.missingFile)) continue;
    const u = g.unicode;
    if (typeof u === 'string' && u && !m.has(u) && Array.from(u).length === 1 && Array.from(g.fontChar).length === 1) m.set(u, g.fontChar);
  }
}
function pdfEnc(pdf, t) { let out = ''; for (const ch of t) out += pdf.map.get(ch) || ch; return out; }
/* the characters of t that the PDF's font cannot draw */
function pdfMissing(fam, t) {
  if (!fam.pdf || fam.pdf.whole) return '';
  const miss = [];
  for (const ch of t) if (ch.trim() && !fam.pdf.map.has(ch) && !miss.includes(ch)) miss.push(ch);
  return miss.join('');
}
function pdfDropFonts() {
  let any = false;
  for (const [k, f] of [...FAM.entries()]) if (f.pdf) { FAM.delete(k); any = true; }
  if (S.lastFam && S.lastFam.pdf) S.lastFam = null;
  if (any) buildFamilySelect();
}
/* look through the other pages for more characters of the same fonts (a 7 that page 1 lacks may be on page 5) */
async function pdfScanFonts(P) {
  const lib = P.lib, OPS = lib.OPS;
  for (let no = 1; no <= Math.min(P.n, 40); no++) {
    await new Promise(r => setTimeout(r, 30));
    if (S.pdf !== P) return;
    if (P.pages.has(no)) continue;
    try {
      const page = await P.doc.getPage(no), ol = await page.getOperatorList({ annotationMode: lib.AnnotationMode.DISABLE }), stack = [];
      let cur = null;
      for (let i = 0; i < ol.fnArray.length; i++) {
        const fn = ol.fnArray[i];
        if (fn === OPS.setFont) cur = ol.argsArray[i][0];
        else if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) stack.push(cur);
        else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) { if (stack.length) cur = stack.pop(); }
        else if (fn === OPS.showText && cur) { let f = null; try { f = page.commonObjs.get(cur); } catch (e) { f = null; } pdfNoteFont(P, cur, f, ol.argsArray[i][0]); }
      }
      if (no !== P.cur) page.cleanup();
    } catch (e) { /* that page adds nothing */ }
  }
  if (PDFS.famDirty) { PDFS.famDirty = false; buildFamilySelect(); }
}
/* The PDF's own font draws the new text while it has every character; otherwise the closest library font does, for the whole text. */
function pdfFontFor(ed) {
  const st = ed.st;
  if (!S.pdf || st.famUser || !ed.cands.length) return;
  const own = ed.cands.find(r => r.fam.pdf && !r.rough);
  if (!own) return;
  const miss = pdfMissing(own.fam, ed.newText);
  if (st.fam === own.fam && miss) {
    const alt = ed.cands.find(r => !r.fam.pdf && !r.rough);
    const what = 'PDF 自带的字体里没有“' + Array.from(miss).slice(0, 8).join('') + '”';
    if (!alt) { setStatus(what + '，这几个字会用别的字体显示。可以在“微调”里换一款字体。', true); return; }
    ed.pdfAlt = true;
    adopt(alt, true); renderCands();
    setStatus(what + '，新文字改用最接近的字体：' + famLabel(alt.fam) + '。', true);
  } else if (ed.pdfAlt && !miss && st.fam !== own.fam) {
    ed.pdfAlt = false;
    adopt(own, true); renderCands();
    setStatus('新文字用的是 PDF 自带的字体，和原文一致。');
  }
}

/* The PDF's own font, placed exactly where the file puts the glyphs: nothing is fitted, the file says where every word
   starts, where the baseline runs and how large the type is. → a candidate like refineCand's, or null. */
function pdfExact(ed, text, T) {
  const fam = ed.pdfFam, L = ed.pdfLines && ed.pdfLines.find(l => l.text === text);
  if (!fam || !L || pdfMissing(fam, text)) return null;
  const words = text.split(' ').filter(Boolean), gs = L.g.filter(g => String(g.u || '').trim());
  const xs = [], hs = [], ys = [];
  let gi = 0, gapSum = 0, gapN = 0;
  for (const w of words) {
    let need = Array.from(w).length, first = true;
    while (need > 0 && gi < gs.length) {
      const g = gs[gi];
      if (first) { xs.push(g.a[0] - ed.rect.x); first = false; } else { gapSum += g.a[0] - gs[gi - 1].b[0]; gapN++; }
      need -= Array.from(String(g.u)).length; hs.push(g.rec.h); ys.push(g.a[1]); gi++;
    }
    if (need !== 0) return null;
  }
  if (gi !== gs.length || !xs.length) return null;
  hs.sort((p, q) => p - q); ys.sort((p, q) => p - q);
  const px = hs[hs.length >> 1], oy = ys[ys.length >> 1] - ed.rect.y, trEm = gapN ? clamp(gapSum / gapN / px, -0.08, 0.6) : 0;
  const c = { fam, weight: fam.w[0], italic: false };
  const r = { fam, weight: c.weight, italic: false, px, trEm, blur: 0, ox: xs[0], oy, xs, words: words.length > 1 ? words : null, im: inkMetrics(c, text, words.length), exact: true };
  /* does this font, with every glyph where the file puts it, give the picture on the page? (It does not when the page
     draws the text some other way, such as outlined to fake a bold.) The new text is set with the font's own spacing. */
  const ctx = mctx(T.tw, T.th);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, T.tw, T.th);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = INK;
  for (const q of gs) { ctx.font = fontCss(c, q.rec.h * T.ky); ctx.fillText(pdfEnc(fam.pdf, String(q.u)), (q.a[0] - ed.rect.x - T.offX) * T.kx, (q.a[1] - ed.rect.y - T.offY) * T.ky); }
  const d = ctx.getImageData(0, 0, T.tw, T.th).data, buf = new Uint8Array(T.tw * T.th);
  let sum = 0;
  for (let i = 0, p = 3; i < buf.length; i++, p += 4) { buf[i] = d[p]; sum += d[p]; }
  r.iou = softIoU(T.A, buf, T.tw, T.th, 0, 0, T.sumA, sum);
  r.score = r.iou + 0.08;        // it is the font the file uses: a look-alike has to fit clearly better to be preferred
  return r;
}

/* the text under a selection, straight from the PDF → { text, hint, fam } or null when the page has no usable text there */
function pdfReadEdit(ed) {
  const P = S.pdf, pg = P && P.pages.get(P.cur);
  if (!pg) return null;
  const r = pdfTextIn(pg.map, ed.userRect);
  if (!r.text || r.bad) return null;
  /* one font for the whole selection: that font itself can be tried */
  const ids = new Set();
  for (const g of pdfGlyphsIn(pg.map, ed.userRect)) if (String(g.u || '').trim()) ids.add(g.rec.font);
  if (PDFS.famDirty) { PDFS.famDirty = false; buildFamilySelect(); }
  return { text: r.text, hint: pdfFontHint(r.fonts[0]), fam: ids.size === 1 ? P.fonts.get([...ids][0]) || null : null, lines: r.lines };
}

/* ---------- writing ---------- */
const pdfBlobBytes = async blob => new Uint8Array(await blob.arrayBuffer());
function pdfPng(imageData) {
  const c = document.createElement('canvas');
  c.width = imageData.width; c.height = imageData.height;
  c.getContext('2d').putImageData(imageData, 0, 0);
  return new Promise((res, rej) => c.toBlob(b => (b ? pdfBlobBytes(b).then(res, rej) : rej(new Error('png'))), 'image/png'));
}
/* a glyph is taken out when it lies under an edit from side to side; one that sticks out stays (its visible part would vanish otherwise) */
function pdfUnder(pg, e) {
  const out = [];
  for (const s of pg.map.shows) {
    if (!s.g.length) continue;
    const tol = 1 + 0.08 * s.h;
    for (const g of s.g) {
      const x0 = Math.min(g.a[0], g.b[0]), x1 = Math.max(g.a[0], g.b[0]);
      if (x0 >= e.x - tol && x1 <= e.x + e.w + tol && g.c[1] >= e.y && g.c[1] < e.y + e.h) out.push(g);
    }
  }
  return out;
}
/* the streams that make up a page's own content */
function pdfContentRefs(L, doc, node) {
  const cont = node.Contents(), raw = node.get(L.PDFName.of('Contents')), refs = [], streams = [];
  if (cont instanceof L.PDFArray) { for (let i = 0; i < cont.size(); i++) { const r = cont.get(i); if (r instanceof L.PDFRef) refs.push(r); streams.push(doc.context.lookup(r)); } }
  else if (cont) { if (raw instanceof L.PDFRef) refs.push(raw); streams.push(cont); }
  return { refs, streams };
}
/* the page's own content, decoded and joined → { bytes, refs } */
function pdfContent(L, doc, node) {
  const { refs, streams } = pdfContentRefs(L, doc, node);
  const chunks = streams.map(s => (s instanceof L.PDFRawStream ? L.decodePDFRawStream(s).decode() : s.getContents ? s.getContents() : new Uint8Array(0)));
  let len = 0;
  for (const c of chunks) len += c.length + 1;
  const bytes = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { bytes.set(c, o); o += c.length; bytes[o++] = 10; }
  return { bytes, refs };
}
/* lay a picture over the rectangle (x, y, w, h) of the page picture */
function pdfDrawPatch(L, page, vp, img, x, y, w, h) {
  const bl = vp.convertToPdfPoint(x, y + h), br = vp.convertToPdfPoint(x + w, y + h), tl = vp.convertToPdfPoint(x, y);
  const key = page.node.newXObject('ReText', img.ref);
  page.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(br[0] - bl[0], br[1] - bl[1], tl[0] - bl[0], tl[1] - bl[1], bl[0], bl[1]), L.drawObject(key), L.popGraphicsState());
}

/* Build the edited PDF. flat: pages with edits become pictures (nothing of their old text is left, and nothing on them can be selected).
   → { bytes, report: { pages, removed, covered, flat, whole, checked } } */
async function pdfBuild(flat) {
  const P = S.pdf;
  pdfStash();
  const edited = [...P.pages.entries()].filter(e => e[1].edits.length).sort((p, q) => p[0] - q[0]);
  const L = await pdfWriter();
  const report = { pages: edited.map(e => e[0]), removed: 0, covered: 0, coveredPages: [], flat: !!flat, whole: false, checked: false, annots: 0, dpi: edited.length ? Math.round(edited[0][1].vp.scale * 72) : 216 };
  let doc = null, why = '';
  try { doc = await L.PDFDocument.load(P.bytes, { updateMetadata: false }); } catch (e) { doc = null; why = /encrypt/i.test(String((e && e.message) || e)) ? 'protected' : 'unreadable'; }
  const canvasOf = async (no, pg) => {
    if (no === P.cur) return S.img;
    const r = await pdfRender(no);
    pdfApplyEdits(r.x, pg.edits, null);
    return r.c;
  };
  const pagePng = async c => {
    let blob = await new Promise(res => c.toBlob(res, 'image/png')), jpg = false;
    if (blob && blob.size > 3.5e6) { const j = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92)); if (j && j.size < blob.size) { blob = j; jpg = true; } }
    return { bytes: await pdfBlobBytes(blob), jpg };
  };
  if (!doc) {
    /* a protected file cannot be rewritten in place: make a new one, every page as a picture */
    if (P.n > 40) throw new Error(why);
    const cur = P.cur, keep = S.img;
    doc = await L.PDFDocument.create();
    for (let no = 1; no <= P.n; no++) {
      const pg = P.pages.get(no), c = no === cur ? keep : await (async () => { const r = await pdfRender(no); if (pg) pdfApplyEdits(r.x, pg.edits, null); return r.c; })();
      const page1 = await P.doc.getPage(no), v1 = page1.getViewport({ scale: 1 }), im = await pagePng(c);
      const page = doc.addPage([v1.width, v1.height]), img = im.jpg ? await doc.embedJpg(im.bytes) : await doc.embedPng(im.bytes);
      page.drawImage(img, { x: 0, y: 0, width: v1.width, height: v1.height });
    }
    report.flat = true; report.whole = true; report.why = why;
    return { bytes: await doc.save(), report };
  }
  const ctx = doc.context, Contents = L.PDFName.of('Contents');
  /* content streams used by more than one page must not be deleted when one page is rewritten */
  const uses = new Map();
  for (const p of doc.getPages()) for (const r of pdfContentRefs(L, doc, p.node).refs) uses.set(r.tag, (uses.get(r.tag) || 0) + 1);
  for (const [no, pg] of edited) {
    const page = doc.getPage(no - 1), node = page.node;
    /* a note, stamp or form field over an edit would be drawn on top of it by the reader: make it part of the picture instead */
    const hit = pg.annots.filter(a => pg.edits.some(e => a.x < e.x + e.w && a.x + a.w > e.x && a.y < e.y + e.h && a.y + a.h > e.y));
    let pageCanvas = null;
    if (flat || hit.length) pageCanvas = await canvasOf(no, pg);
    if (flat) {
      const old = pdfContentRefs(L, doc, node), im = await pagePng(pageCanvas);
      node.set(Contents, ctx.register(ctx.flateStream(new Uint8Array(0))));
      for (const r of old.refs) if ((uses.get(r.tag) || 0) <= 1) ctx.delete(r);
      node.set(L.PDFName.of('Resources'), ctx.obj({}));
      const img = im.jpg ? await doc.embedJpg(im.bytes) : await doc.embedPng(im.bytes);
      pdfDrawPatch(L, page, pg.vp, img, 0, 0, pg.w, pg.h);
    } else {
      const jobs = new Map();
      let want = 0, nested = 0;
      for (const e of pg.edits) for (const g of pdfUnder(pg, e)) {
        if (!g.rec.top) { nested++; continue; }
        if (!jobs.has(g.rec.k)) jobs.set(g.rec.k, new Set());
        if (!jobs.get(g.rec.k).has(g.j)) { jobs.get(g.rec.k).add(g.j); want++; }
      }
      let left = nested;
      if (jobs.size) {
        const old = pdfContent(L, doc, node), res = pdfStrip(old.bytes, pg.map, jobs);
        if (res.bytes && res.done.length) {
          node.set(Contents, ctx.register(ctx.flateStream(res.bytes)));
          for (const r of old.refs) if ((uses.get(r.tag) || 0) <= 1) ctx.delete(r);
        }
        for (const f of res.failed) left += jobs.get(f.k).size;
        report.removed += want - (left - nested);
      }
      if (left) { report.covered += left; report.coveredPages.push(no); }
      for (const e of pg.edits) pdfDrawPatch(L, page, pg.vp, await doc.embedPng(await pdfPng(e.after)), e.x, e.y, e.w, e.h);
    }
    if (hit.length) {
      const arr = node.Annots();
      for (const a of hit) {
        const m = /^(\d+)R(\d*)$/.exec(a.id || '');
        if (!arr || !m) continue;
        for (let i = arr.size() - 1; i >= 0; i--) { const r = arr.get(i); if (r instanceof L.PDFRef && r.objectNumber === +m[1] && r.generationNumber === (+m[2] || 0)) { arr.remove(i); report.annots++; } }
        if (!flat) {
          const x0 = clamp(Math.floor(a.x), 0, pg.w), y0 = clamp(Math.floor(a.y), 0, pg.h), w = Math.min(Math.ceil(a.x + a.w), pg.w) - x0, h = Math.min(Math.ceil(a.y + a.h), pg.h) - y0;
          if (w > 0 && h > 0) pdfDrawPatch(L, page, pg.vp, await doc.embedPng(await pdfPng(pageCanvas.getContext('2d').getImageData(x0, y0, w, h))), x0, y0, w, h);
        }
      }
    }
  }
  const bytes = await doc.save();
  /* read the result back and look under every edit: nothing of the old text may be left there */
  try {
    const chk = await pdfOpenDoc(P.lib, bytes, () => null);
    let still = 0;
    const pagesLeft = [];
    for (const [no, pg] of edited) {
      const page = await chk.getPage(no), ol = await page.getOperatorList({ annotationMode: P.lib.AnnotationMode.DISABLE });
      const map = pdfGlyphMap(ol, P.lib.OPS, id => { try { return page.commonObjs.get(id); } catch (e) { return null; } }, pg.vp.transform);
      let n = 0;
      for (const e of pg.edits) n += pdfUnder({ map }, e).length;
      if (n) { still += n; pagesLeft.push(no); }
    }
    pdfDestroy(chk);
    report.checked = true; report.covered = still; report.coveredPages = pagesLeft;
  } catch (e) { report.checked = false; report.checkErr = String((e && e.message) || e); }
  return { bytes, report };
}

function pdfReportText(r) {
  const pl = a => '第 ' + a.join('、') + ' 页';
  if (r.whole) return (r.why === 'protected' ? '这个 PDF 有保护，不能在原文件上改。' : '这个 PDF 的内部结构比较特别，没法在原文件上改。') + '已另存为新文件：每一页都转成了图片，文字不能再选中或搜索。';
  if (r.flat) return pl(r.pages) + '已整页转成图片：旧文字不在文件里了，这些页上的文字也不能再选中或搜索。其它页没有变。';
  let t = '改动在' + pl(r.pages) + '。新文字是贴上去的图片（' + r.dpi + ' dpi），不能选中或搜索；其它内容没有变。';
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
    $('sheetHow').textContent = pdfReportText(out.report) + '（' + mb(blob.size) + '）';
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
  for (const el of [$('pgPrev'), $('pgNext'), $('pgNum')]) el.addEventListener('pointerdown', e => e.stopPropagation());
}
