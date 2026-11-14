/* =====================================================================
   pdf.js — PDF files in the app (installable build only).
   A PDF page is drawn as a picture and edited exactly like an image. On saving, the edits go back
   into the PDF: the replaced glyphs are taken out of the page (pdfcore.js) and the new text is written
   in their place as text, in the file's own font or in a library font that is put into the file.
   The saved page is then drawn again and compared with the screen; an edit that cannot be written as
   text, or does not come out the same, is laid over the page as a small picture instead.
   Everything else in the file stays as it was.
   Libraries, hosted alongside the app and loaded only when needed:
     pdf.js (Mozilla, Apache-2.0) draws pages and reports the glyphs; pdf-lib (MIT) writes the file;
     fontkit (MIT) cuts a library font down to the characters used.
   ===================================================================== */
const PDFS = { libP: null, wrP: null, fkP: null, saving: false, out: null, css: new Map(), files: new Map(), findHit: null, log: null };
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
function pdfScript(key, file, name) {
  if (!PDFS[key]) {
    PDFS[key] = new Promise((res, rej) => {
      if (window[name]) { res(window[name]); return; }
      const s = document.createElement('script');
      s.src = pdfUrl(file);
      s.onload = () => (window[name] ? res(window[name]) : rej(new Error(name)));
      s.onerror = () => rej(new Error(name));
      document.head.appendChild(s);
    });
    PDFS[key].catch(() => { PDFS[key] = null; });
  }
  return PDFS[key];
}
const pdfFontkit = () => pdfScript('fkP', 'fontkit.umd.min.js', 'fontkit');
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
  S.pdf = { name: (name || 'document').replace(/\.pdf$/i, ''), bytes, doc, lib, n: doc.numPages, cur: 0, pages: new Map(), busy: false, pw, fonts: new Map(), lines: new Map(), find: null };
  PDFS.out = null;
  $('findIn').value = ''; pdfFindInfo();
  await pdfGo(1);
  warmReader();
  pdfScanFonts(S.pdf);
}

/* the size a page is drawn at: three picture pixels per PDF point (216 dpi) where the page allows it; phones cap the size of a canvas */
function pdfViewport(page) {
  const v1 = page.getViewport({ scale: 1 }), side = Math.max(v1.width, v1.height);
  return page.getViewport({ scale: Math.max(0.5, Math.min(Math.max(3, 1500 / side), Math.sqrt(9e6 / (v1.width * v1.height)), 4096 / side)) });
}
async function pdfDrawPage(page, vp) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvas: null, canvasContext: x, viewport: vp, background: '#fff' }).promise;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  return c;
}
/* draw one page → { c, x, vp, map, annots } */
async function pdfRender(no) {
  const P = S.pdf, lib = P.lib, page = await P.doc.getPage(no), vp = pdfViewport(page);
  const c = await pdfDrawPage(page, vp), x = c.getContext('2d', { willReadFrequently: true });
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
  if (pg) pg.edits = S.undo.map(u => ({ x: u.x, y: u.y, w: u.after.width, h: u.after.height, after: u.after, pdf: u.pdf || null }));
}
function pdfApplyEdits(x, edits, undo) {
  for (const e of edits) {
    if (undo) undo.push({ x: e.x, y: e.y, data: x.getImageData(e.x, e.y, e.w, e.h), after: e.after, pdf: e.pdf || null });
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
    pdfFindInfo();
    requestDraw();
  } catch (e) { toast('第 ' + no + ' 页没能显示出来'); }
  finally { P.busy = false; pdfPager(); if ($('stageNote').textContent.startsWith('正在打开')) $('stageNote').textContent = ''; }
}
function pdfPager() {
  const P = S.pdf, el = $('pager');
  el.hidden = !P;
  $('findBox').hidden = !P;
  if (!P) return;
  $('pgNum').textContent = P.cur + ' / ' + P.n;
  $('pgPrev').disabled = P.cur <= 1; $('pgNext').disabled = P.cur >= P.n;
}
function pdfClose() {
  if (S.pdf) pdfDestroy(S.pdf.doc);
  pdfDropFonts();
  S.pdf = null; PDFS.out = null;
  $('findIn').value = ''; pdfFindInfo();
  pdfPager();
}

/* ---------- finding a text everywhere in the file, so that no occurrence is missed ---------- */
const pdfFold = ch => { let t = ch; try { t = ch.normalize('NFKC'); } catch (e) { t = ch; } return Array.from(t.toLowerCase()).filter(c => c.trim()); };
/* the text of a page for searching: every line as its characters (spaces left out, case and width folded) with the box of each → [{ c: [char], b: Float32Array(x0, x1, y0, y1 …) }] */
async function pdfPageLines(P, no) {
  if (P.lines.has(no)) return P.lines.get(no);
  const out = [];
  try {
    let map = P.pages.has(no) ? P.pages.get(no).map : null;
    if (!map) {
      const page = await P.doc.getPage(no), ol = await page.getOperatorList({ annotationMode: P.lib.AnnotationMode.DISABLE });
      map = pdfGlyphMap(ol, P.lib.OPS, id => { try { return page.commonObjs.get(id); } catch (e) { return null; } }, pdfViewport(page).transform);
      if (no !== P.cur) page.cleanup();
    }
    for (const L of pdfTextIn(map, { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }).lines) {
      let c = [], b = [], lastX = null;
      const flush = () => { if (c.length) out.push({ c, b: Float32Array.from(b) }); c = []; b = []; };
      for (const g of L.g) {
        if (Math.abs(g.a[1] - g.b[1]) > 0.2 * g.rec.h) continue;                      // not set along the page: its box would be wrong
        const x0 = Math.min(g.a[0], g.b[0]), x1 = Math.max(g.a[0], g.b[0]);
        if (lastX !== null && x0 - lastX > 2.5 * g.rec.h) flush();                    // another column or table cell
        lastX = x1;
        for (const ch of pdfFold(String(g.u == null ? '' : g.u))) { c.push(ch); b.push(x0, x1, Math.min(g.t[1], g.d[1]), Math.max(g.t[1], g.d[1])); }
      }
      flush();
    }
  } catch (e) { /* a page that cannot be read has nothing to find */ }
  P.lines.set(no, out);
  return out;
}
/* look for q on every page → P.find = { q, hits: [{ no, x, y, w, h }], at, done, pages } */
async function pdfFind(q) {
  const P = S.pdf;
  if (!P) return;
  const want = Array.from(q || '').reduce((a, ch) => a.concat(pdfFold(ch)), []);
  if (!want.length) { P.find = null; pdfFindInfo(); return; }
  const F = P.find = { q: q.trim(), hits: [], at: -1, done: false, pages: 0, repl: '' };
  pdfFindInfo();
  for (let no = 1; no <= P.n; no++) {
    const lines = await pdfPageLines(P, no);
    if (S.pdf !== P || P.find !== F) return;
    for (const L of lines) {
      for (let i = 0; i + want.length <= L.c.length; i++) {
        let k = 0;
        while (k < want.length && L.c[i + k] === want[k]) k++;
        if (k < want.length) continue;
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let j = i; j < i + k; j++) { x0 = Math.min(x0, L.b[4 * j]); x1 = Math.max(x1, L.b[4 * j + 1]); y0 = Math.min(y0, L.b[4 * j + 2]); y1 = Math.max(y1, L.b[4 * j + 3]); }
        const h = y1 - y0;
        F.hits.push({ no, x: x0 - 0.05 * h, y: y0 - 0.02 * h, w: x1 - x0 + 0.1 * h, h: h * 1.04 });
        i += k - 1;
      }
    }
    F.pages = no;
    if (no % 4 === 0 || no === P.n) { pdfFindInfo(); await new Promise(r => setTimeout(r, 0)); }
  }
  F.done = true;
  pdfFindInfo();
}
/* has this occurrence been edited already? */
function pdfFindDone(h) {
  const P = S.pdf, pg = P.pages.get(h.no);
  const eds = h.no === P.cur ? S.undo.map(u => (u.pdf ? u.pdf.sel : { x: u.x, y: u.y, w: u.after.width, h: u.after.height })) : pg ? pg.edits.map(e => (e.pdf ? e.pdf.sel : e)) : [];
  return eds.some(e => pdfHit(h, e));
}
/* how many occurrences are still to be edited (−1: nothing is being looked for) */
function pdfFindLeft() {
  const P = S.pdf, F = P && P.find;
  return F && F.hits.length ? F.hits.filter(h => !pdfFindDone(h)).length : -1;
}
function pdfFindInfo() {
  const P = S.pdf, F = P && P.find, info = $('findInfo');
  $('findNav').hidden = !(F && F.hits.length);
  info.hidden = !F;
  if (!F) return;
  const n = F.hits.length, left = pdfFindLeft();
  if (!n) { info.textContent = F.done ? '没有找到“' + F.q + '”。扫描件和图片里的字查不到，跨行的词句也查不到。' : '正在查找… 已查 ' + F.pages + ' / ' + P.n + ' 页'; return; }
  const pages = [...new Set(F.hits.map(h => h.no))];
  info.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = (F.done ? '共 ' : '已找到 ') + n + ' 处';
  info.append(b, '（第 ' + (pages.length > 8 ? pages.slice(0, 8).join('、') + '… ' : pages.join('、') + ' ') + '页）' + (F.done ? '' : '，还在查 ' + F.pages + ' / ' + P.n + ' 页') + '。' +
    (left === n ? '都还没改。' : left > 0 ? '已改 ' + (n - left) + ' 处，还剩 ' + left + ' 处。' : '全部改过了。') + (F.at >= 0 ? ' 现在是第 ' + (F.at + 1) + ' 处。' : ''));
  $('findNext').textContent = left > 0 ? '下一处' : '再看一遍';
}
/* go to the next occurrence that has not been edited (when all have been: just the next one) and select it */
async function pdfFindStep(dir) {
  const P = S.pdf, F = P && P.find;
  if (!F || !F.hits.length || P.busy) return;
  const n = F.hits.length, any = F.hits.some(h => !pdfFindDone(h));
  let i = F.at < 0 ? (dir > 0 ? -1 : 0) : F.at;
  for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (!any || !pdfFindDone(F.hits[i])) break; }
  const h = F.hits[i];
  F.at = i;
  if (P.cur !== h.no) await pdfGo(h.no);
  if (S.pdf !== P || P.cur !== h.no) return;
  PDFS.findHit = h;
  startEdit({ x: h.x, y: h.y, w: h.w, h: h.h }, false);
  PDFS.findHit = null;
  if (S.edit) showRect(h);
  pdfFindInfo();
}
/* the replacement typed for an earlier occurrence, offered again for this one */
function pdfFindRepl(ed) {
  const F = S.pdf && S.pdf.find;
  return ed.find && F && F.repl && !pdfFindDone(ed.find) ? F.repl : '';
}
/* an edit was applied: remember its text for the next occurrence → how many occurrences are left (−1 when nothing is being looked for) */
function pdfFindApplied(ed, mode) {
  const P = S.pdf, F = P && P.find;
  if (!F) return -1;
  if (ed.find && mode === 'text' && ed.newText.trim() && ed.newText !== ed.origText) F.repl = ed.newText;
  pdfFindInfo();
  return ed.find ? pdfFindLeft() : -1;
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
      pdf: { id, css: (f.systemFontInfo && f.systemFontInfo.css) || '"' + (f.loadedName || id) + '", ' + (f.fallbackName || 'sans-serif'), fs: f.italic ? 'italic' : 'normal', fw: f.black ? '900' : f.bold ? 'bold' : 'normal', map: new Map(), whole: !!f.systemFontInfo, fo: f } };
    P.fonts.set(id, fam); FAM.set(fam.n, fam);
    PDFS.famDirty = true;
  }
  const m = fam.pdf.map;
  for (const g of glyphs) {
    if (typeof g === 'number' || !g.fontChar || (!g.isInFont && !f.missingFile)) continue;
    const u = g.unicode;
    /* fc: what draws the glyph on screen; code and w: its character code and width in the file, for writing it back */
    if (typeof u === 'string' && u && !m.has(u) && Array.from(u).length === 1 && Array.from(g.fontChar).length === 1) m.set(u, { fc: g.fontChar, code: g.originalCharCode, w: g.width });
  }
}
function pdfEnc(pdf, t) { let out = ''; for (const ch of t) { const e = pdf.map.get(ch); out += e ? e.fc : ch; } return out; }
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
    /* a font that can be put into the file keeps the new text real text; a device font would make it a picture */
    const others = ed.cands.filter(r => !r.fam.pdf && !r.rough), emb = others.find(r => pdfEmbeddable(r.fam));
    const alt = emb && emb.score >= others[0].score - 0.1 ? emb : others[0];
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

/* say so when the font in use cannot go into the file (the edit is then saved as a picture) */
function pdfFontNote(ed) {
  if (!S.pdf || BUILD !== 'pages' || ed.st.fam.pdf || pdfEmbeddable(ed.st.fam)) return;
  const el = $('matchStatus');
  setStatus((el.textContent ? el.textContent + ' ' : '') + '这款是设备自带的字体，放不进 PDF：保存后这处是贴上去的图片。想要真正的文字，可以在“微调”里换一款字体库里的字体。', el.classList.contains('warn'));
}

/* the characters of t that a library family cannot draw (the browser would use some other font for them).
   The font files themselves are asked: a family's style sheet claims some characters its files do not have. */
async function pdfUncovered(fam, weight, italic, t) {
  const fams = fam.stack || [fam], sets = [];
  for (const m of fams) {
    if (m.sys || m.pdf || !SELF_FONTS[m.n]) continue;
    const w = fam.stack ? nearW(m, weight) : weight, style = italic && m.it ? 'italic' : 'normal';
    sets.push((await pdfFaceRules(m)).filter(r => r.w === w && r.style === style));
  }
  let miss = '';
  for (const ch of new Set(t)) {
    if (!ch.trim()) continue;
    const cp = ch.codePointAt(0);
    let ok = false;
    for (const rs of sets) for (const r of rs) {
      if (ok || !r.ranges.some(q => cp >= q[0] && cp <= q[1])) continue;
      const ff = await pdfFontFile(r.url);
      ok = !ff || ff.fk.hasGlyphForCodePoint(cp);           // a file that cannot be read now is given the benefit of the doubt
    }
    if (!ok) miss += ch;
  }
  return miss;
}
/* the new text has characters the library font in use cannot draw: change to the closest font that has them all
   (text in a font with gaps is drawn partly in some other font, and is saved as a picture) */
async function pdfCoverNote(ed) {
  const st = ed.st, t = ed.newText, fam = st.fam;
  if (!S.pdf || BUILD !== 'pages' || fam.pdf || !pdfEmbeddable(fam) || !t) return;
  const miss = await pdfUncovered(fam, st.weight, st.italic, t), same = () => S.edit === ed && ed.newText === t && ed.st.fam === fam;
  if (!same() || !miss) return;
  const what = '“' + famLabel(fam) + '”里没有“' + Array.from(miss).slice(0, 8).join('') + '”';
  if (!st.famUser) for (const r of ed.cands) {
    if (r.rough || r.fam === fam || r.fam.pdf || !pdfEmbeddable(r.fam) || (await pdfUncovered(r.fam, r.weight, r.italic, t + ed.origText))) continue;
    if (!same()) return;
    adopt(r, true); renderCands();
    setStatus(what + '，新文字改用最接近的字体：' + famLabel(r.fam) + '。', true);
    return;
  }
  if (same()) setStatus(what + '，这几个字会用别的字体显示，保存后这处是贴上去的图片。可以在“微调”里换一款字体。', true);
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
  if (pdfTouched(ed.userRect)) return null;        // an earlier edit changed this spot: the file's text no longer describes it
  const r = pdfTextIn(pg.map, ed.userRect);
  if (!r.text || r.bad) return null;
  /* one font for the whole selection: that font itself can be tried */
  const ids = new Set();
  for (const g of pdfGlyphsIn(pg.map, ed.userRect)) if (String(g.u || '').trim()) ids.add(g.rec.font);
  if (PDFS.famDirty) { PDFS.famDirty = false; buildFamilySelect(); }
  return { text: r.text, hint: pdfFontHint(r.fonts[0]), fam: ids.size === 1 ? P.fonts.get([...ids][0]) || null : null, lines: r.lines };
}

/* ---------- what an edit did, kept with it for saving ---------- */
const pdfHit = (a, b) => !!a && !!b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/* has an earlier edit of this page changed what lies in r? */
function pdfTouched(r) {
  return S.undo.some(u => (u.pdf ? pdfHit(r, u.pdf.sel) || pdfHit(r, u.pdf.ink) : pdfHit(r, { x: u.x, y: u.y, w: u.after.width, h: u.after.height })));
}
/* On a PDF page the glyphs are known: the ink of a glyph that the selection does not take in is not part of the old text,
   however close it sits, and stays untouched. */
function pdfProtect(ed) {
  const P = S.pdf, pg = P && P.pages.get(P.cur), an = ed.an, r = ed.rect, ur = ed.userRect;
  if (!pg || !an || !an.found) return;
  const keep = [], mine = [];
  for (const s of pg.map.shows) for (const g of s.g) {
    if (!String(g.u || '').trim() || Math.abs(g.a[1] - g.b[1]) > 0.2 * s.h) continue;
    const b = { x0: Math.min(g.a[0], g.b[0]) - r.x, x1: Math.max(g.a[0], g.b[0]) - r.x, y0: Math.min(g.t[1], g.d[1]) - r.y, y1: Math.max(g.t[1], g.d[1]) - r.y };
    if (b.x1 <= 0 || b.x0 >= an.w || b.y1 <= 0 || b.y0 >= an.h) continue;
    (g.c[0] >= ur.x && g.c[0] < ur.x + ur.w && g.c[1] >= ur.y && g.c[1] < ur.y + ur.h ? mine : keep).push(b);
  }
  if (!keep.length || !mine.length) return;
  for (const b of keep) {
    const x0 = Math.max(0, Math.ceil(b.x0)), x1 = Math.min(an.w, Math.floor(b.x1)), y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.min(an.h, Math.ceil(b.y1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (mine.some(m => x >= m.x0 && x < m.x1 && y >= m.y0 && y < m.y1)) continue;
      const i = y * an.w + x;
      an.hole[i] = 0; an.alpha[i] = 0;
    }
  }
}
/* → { sel, area, rm, why, set, ink, cov } or null when the spot is not text of the PDF (a scan, a picture, an earlier edit).
   rm: the glyphs replaced; set: font, size, colour and where every character of the new text goes; why: set when the
   edit cannot be written as text for a reason known already. */
function pdfEditInfo(ed, mode, out) {
  const P = S.pdf, pg = P && P.pages.get(P.cur);
  if (!pg || pdfTouched(ed.rect)) return null;
  const gl = pdfGlyphsIn(pg.map, ed.userRect).filter(g => g.rec.h > 0);
  if (!gl.length) return null;
  const info = { sel: Object.assign({}, ed.userRect), area: Object.assign({}, ed.rect), rm: gl.map(g => [g.rec.k, g.j]), why: '', set: null, ink: null, cov: null };
  if (gl.some(g => !g.rec.top)) info.why = 'nested';
  else if (gl.some(g => g.rec.mode % 4 === 3 || g.rec.mode > 3)) info.why = 'hidden';
  if (mode === 'erase') return info;
  const st = ed.st, px = st.px * st.sizeAdj, tr = (st.trEm + st.trAdj) * px, c = { fam: st.fam, weight: st.weight, italic: st.italic }, r = ed.rect;
  const lines = layoutNew(ed), ctx = mctx(8, 8), runs = [];      // layoutNew measures with the same canvas: set the font after it
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = fontCss(c, px);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const l of lines) {
    if (!l.text) continue;
    if (COMPLEX_RE.test(l.text)) info.why = info.why || 'script';
    const chars = [];
    let prefix = '', i = 0;
    for (const ch of l.text) {          // the same arithmetic as drawRun
      const e = encT(st.fam, ch);
      chars.push({ ch, x: r.x + l.ox + ctx.measureText(prefix + e).width - ctx.measureText(e).width + i * tr });
      prefix += e; i++;
    }
    runs.push({ y: r.y + l.oy, chars });
    x0 = Math.min(x0, r.x + l.ox - l.m.L); x1 = Math.max(x1, r.x + l.ox + l.inkR); y0 = Math.min(y0, r.y + l.oy - l.m.A); y1 = Math.max(y1, r.y + l.oy + l.m.D);
  }
  if (!runs.length) return info;
  if (st.blur > 0.8) info.why = info.why || 'soft';
  info.set = { fam: st.fam, weight: st.weight, italic: st.italic, px, color: st.color.slice(0, 3), userColor: !!ed.userColor, runs };
  info.ink = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (out.cov) { const a = new Uint8Array(out.cov.length); for (let k = 0; k < a.length; k++) a[k] = Math.round(clamp(out.cov[k], 0, 1) * 255); info.cov = { x: out.x, y: out.y, w: out.w, h: out.h, a }; }
  return info;
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
  const key = page.node.newXObject('Ovw', img.ref);
  page.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(br[0] - bl[0], br[1] - bl[1], tl[0] - bl[0], tl[1] - bl[1], bl[0], bl[1]), L.drawObject(key), L.popGraphicsState());
}

/* ---------- the new text as text: which font writes it ---------- */
const pdfEmbeddable = fam => (fam.stack || [fam]).every(m => !m.sys && !m.pdf && !!SELF_FONTS[m.n]);
/* glyph names, for fonts that are not in the file (their characters are found through the encoding, by name) */
const PDF_NAMES = { ' ': 'space', '!': 'exclam', '"': 'quotedbl', '#': 'numbersign', $: 'dollar', '%': 'percent', '&': 'ampersand', "'": 'quotesingle', '(': 'parenleft', ')': 'parenright', '*': 'asterisk', '+': 'plus', ',': 'comma', '-': 'hyphen', '.': 'period', '/': 'slash', ':': 'colon', ';': 'semicolon', '<': 'less', '=': 'equal', '>': 'greater', '?': 'question', '@': 'at', '[': 'bracketleft', '\\': 'backslash', ']': 'bracketright', '^': 'asciicircum', _: 'underscore', '`': 'grave', '{': 'braceleft', '|': 'bar', '}': 'braceright', '~': 'asciitilde', '’': 'quoteright', '‘': 'quoteleft', '“': 'quotedblleft', '”': 'quotedblright', '–': 'endash', '—': 'emdash', '•': 'bullet', '€': 'Euro', '£': 'sterling', '¥': 'yen', '©': 'copyright', '®': 'registered', '°': 'degree', '·': 'periodcentered' };
const PDF_DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/* the code and width of a character in one of the file's fonts, or null */
function pdfCodeOf(pdf, ch) {
  const e = pdf.map.get(ch);
  if (e && e.code != null && e.w >= 0) return { code: e.code, w: e.w };
  const f = pdf.fo;
  if (pdf.whole && f && f.composite) {
    /* a font that is not in the file, with codes that are the characters' own Unicode numbers (the UCS-2 character maps of
       Chinese, Japanese and Korean fonts): any full-width character can be written, at the width the file gives them all */
    const wide = c => (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6);
    let n = 0, ok = f.defaultWidth > 0;
    for (const [u, q] of pdf.map) { const c = u.codePointAt(0); n++; if (q.code !== c || (wide(c) && q.w !== f.defaultWidth)) ok = false; }
    const cp = ch.codePointAt(0);
    return ok && n >= 3 && wide(cp) ? { code: cp, w: f.defaultWidth } : null;
  }
  if (!pdf.whole || !f || f.composite || !f.defaultEncoding) return null;
  const name = /^[A-Za-z]$/.test(ch) ? ch : /^[0-9]$/.test(ch) ? PDF_DIGITS[+ch] : PDF_NAMES[ch];
  if (!name) return null;
  let code = -1;
  const d = f.differences;
  if (d && typeof d.forEach === 'function') d.forEach((n, c) => { if (n === name && code < 0) code = +c; });
  if (code < 0) code = f.defaultEncoding.indexOf(name);
  if (code < 0 || code > 255) return null;
  const w = f.widths && f.widths[code] != null ? f.widths[code] : f.defaultWidth;
  return w > 0 ? { code, w } : null;
}
/* the file's own font: its name on this page, the size of its codes, and a code for every character → { enc } or { why } */
function pdfOwnPlan(info, byK, scan, content) {
  const pdf = info.set.fam.pdf;
  let ref = null;
  for (const [k] of info.rm) { const s = byK.get(k); if (s && s.font === pdf.id) { ref = s; break; } }
  if (!ref) for (const s of byK.values()) if (s.font === pdf.id) { ref = s; break; }
  if (!ref) return { why: 'font' };                // a font of another page: this page has no name for it
  const st = scan[ref.k].st, nb = pdf.fo && pdf.fo.composite ? pdfCodeBytes(content, scan[ref.k], ref) : 1;
  if (!st.font || !nb) return { why: 'ops' };
  const enc = new Map();
  for (const run of info.set.runs) for (const { ch } of run.chars) {
    if (enc.has(ch)) continue;
    const c = pdfCodeOf(pdf, ch);
    if (!c || c.code >= Math.pow(256, nb)) { if (ch.trim()) return { why: 'glyph' }; continue; }
    enc.set(ch, { hex: c.code.toString(16).padStart(2 * nb, '0'), adv: c.w * ref.fm0, font: st.font });
  }
  return { enc };
}
/* the @font-face rules of a library family: which file serves which characters */
function pdfFaceRules(m) {
  const id = SELF_FONTS[m.n].id;
  if (!PDFS.css.has(id)) {
    const p = fetch('fonts/' + id + '/' + id + '.css').then(r => (r.ok ? r.text() : '')).then(css => {
      const rules = [];
      for (const blk of css.split('@font-face').slice(1)) {
        const w = /font-weight:\s*(\d+)/.exec(blk), url = /url\(['"]?([^'")]+\.woff2)['"]?\)/.exec(blk), st = /font-style:\s*(\w+)/.exec(blk), ur = /unicode-range:\s*([^;}]+)/.exec(blk);
        if (!w || !url) continue;
        const ranges = [];
        for (const t of ur ? ur[1].split(',') : ['U+0-10FFFF']) { const q = /U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?/.exec(t); if (q) ranges.push([parseInt(q[1].replace(/\?/g, '0'), 16), parseInt(q[2] || q[1].replace(/\?/g, 'F'), 16)]); }
        rules.push({ w: +w[1], style: st ? st[1] : 'normal', url: 'fonts/' + id + '/' + url[1], ranges });
      }
      return rules.reverse();          // of two rules that cover a character, the browser takes the later one
    }).catch(() => []);
    PDFS.css.set(id, p);
    p.then(r => { if (!r.length) PDFS.css.delete(id); });
  }
  return PDFS.css.get(id);
}
/* a font file of the library, read → { bytes, fk } or null */
function pdfFontFile(url) {
  if (!PDFS.files.has(url)) {
    const p = Promise.all([pdfFontkit(), fetch(url).then(r => (r.ok ? r.arrayBuffer() : null))]).then(([fk, buf]) => (buf ? { bytes: new Uint8Array(buf), fk: fk.create(new Uint8Array(buf)) } : null)).catch(() => null);
    PDFS.files.set(url, p);
    p.then(r => { if (!r) PDFS.files.delete(url); });
    if (PDFS.files.size > 400) PDFS.files.clear();
  }
  return PDFS.files.get(url);
}
/* a library font, to be put into the file: the font file that holds each character → { enc } or { why } */
async function pdfLibPlan(info) {
  const set = info.set, fams = set.fam.stack || [set.fam], enc = new Map();
  if (!pdfEmbeddable(set.fam)) return { why: 'sysfont' };
  try { await pdfFontkit(); } catch (e) { return { why: 'file' }; }
  for (const run of set.runs) for (const { ch } of run.chars) {
    if (enc.has(ch) || !ch.trim()) continue;
    const cp = ch.codePointAt(0);
    let got = null, why = 'glyph';
    for (const m of fams) {
      const rules = await pdfFaceRules(m), w = set.fam.stack ? nearW(m, set.weight) : set.weight, style = set.italic ? 'italic' : 'normal';
      if (!rules.length) { why = 'file'; continue; }
      if (!rules.some(r => r.w === w && r.style === style)) { why = 'synth'; continue; }      // the browser fakes this weight or slant
      for (const r of rules) {
        if (r.w !== w || r.style !== style || !r.ranges.some(q => cp >= q[0] && cp <= q[1])) continue;
        const ff = await pdfFontFile(r.url);
        if (!ff) { why = 'file'; continue; }
        if (ff.fk.hasGlyphForCodePoint(cp)) { got = { url: r.url }; break; }
      }
      if (got) break;
    }
    if (!got) return { why };
    enc.set(ch, got);
  }
  /* spaces, when a font already in use has one (text can then be copied with its spaces) */
  for (const { url } of [...enc.values()]) { const ff = await pdfFontFile(url); if (ff && ff.fk.hasGlyphForCodePoint(32)) { enc.set(' ', { url }); break; } }
  return { enc };
}
/* a glyph outline (a fontkit path of lines and quadratic curves) as a TrueType simple glyph; Buf: fontkit's buffer class */
function pdfGlyf(path, Buf) {
  const pts = [], ends = [];
  let start = 0;
  const close = () => {
    if (pts.length <= start) return;
    const f = pts[start], l = pts[pts.length - 1];
    if (pts.length - start > 2 && l[2] && f[0] === l[0] && f[1] === l[1]) pts.pop();      // the closing point repeats the first
    ends.push(pts.length - 1); start = pts.length;
  };
  for (const c of path.commands) {
    const a = c.args.map(Math.round);
    if (c.command === 'moveTo') { close(); pts.push([a[0], a[1], 1]); }
    else if (c.command === 'lineTo') pts.push([a[0], a[1], 1]);
    else if (c.command === 'quadraticCurveTo') pts.push([a[0], a[1], 0], [a[2], a[3], 1]);
    else if (c.command === 'closePath') close();
    else throw new Error('outline');             // cubic curves: not a TrueType outline
  }
  close();
  if (!pts.length) return Buf.alloc(0);
  let x0 = 32767, y0 = 32767, x1 = -32768, y1 = -32768;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const n = pts.length, size = 10 + 2 * ends.length + 2 + 5 * n, out = Buf.alloc(size + ((4 - (size % 4)) % 4)), dv = new DataView(out.buffer, out.byteOffset, out.length);
  dv.setInt16(0, ends.length); dv.setInt16(2, x0); dv.setInt16(4, y0); dv.setInt16(6, x1); dv.setInt16(8, y1);
  let o = 10, last = 0;
  for (const e of ends) { dv.setUint16(o, e); o += 2; }
  dv.setUint16(o, 0); o += 2;                    // no instructions
  for (const p of pts) out[o++] = p[2];          // on-curve or not; every coordinate is written in full
  for (const p of pts) { dv.setInt16(o, p[0] - last); last = p[0]; o += 2; }
  last = 0;
  for (const p of pts) { dv.setInt16(o, p[1] - last); last = p[1]; o += 2; }
  return out;
}
/* fontkit copies glyph outlines byte for byte when it cuts a font down, which fails for WOFF2 files (the outlines are stored
   packed there), and its own outline writer drops a byte now and then: write each outline here */
function pdfFixSubset(font) {
  const em = font.embedder, fk = em && em.font, sub = em && em.subset, t = fk && fk.directory && fk.directory.tables;
  if (!sub || !t || !t.glyf || !t.glyf.transformed || sub.__fixed) return;
  sub.__fixed = true;
  sub._addGlyph = function (gid) {
    const glyph = this.font.getGlyph(gid), buffer = pdfGlyf(glyph.path, this.font.stream.buffer.constructor);
    this.glyf.push(buffer); this.loca.offsets.push(this.offset);
    this.hmtx.metrics.push({ advance: glyph.advanceWidth, bearing: glyph._getMetrics().leftBearing });
    this.offset += buffer.length;
    return this.glyf.length - 1;
  };
}
/* write the new text of one edit onto the page. Throws when a character cannot be written after all. */
async function pdfWriteText(L, doc, page, pg, pl, scan, fonts, keys) {
  const set = pl.e.pdf.set, vp = pg.vp;
  const glyph = async ch => {
    const c = pl.write.enc.get(ch);
    if (!c || !c.url) return c || null;
    let f = fonts.get(c.url);
    if (!f) {
      const ff = await pdfFontFile(c.url);
      if (!ff) throw new Error('file');
      if (!fonts.has('')) { doc.registerFontkit(await pdfFontkit()); fonts.set('', true); }
      f = await doc.embedFont(ff.bytes, { subset: true });
      pdfFixSubset(f); fonts.set(c.url, f);
    }
    if (!keys.has(c.url)) keys.set(c.url, page.node.newFontDictionary('OvwF', f.ref).toString());
    return { hex: f.encodeText(ch).toString().slice(1, -1), adv: f.widthOfTextAtSize(ch, 1), font: keys.get(c.url) };
  };
  /* colour: the very operators the old text was coloured with (the colour then stays in its colour space), or else the colour seen on screen */
  let col = '', gs = [];
  if (pl.mode === 'exact' && !set.userColor) {
    const sts = pl.gl.filter(g => String(g.u || '').trim()).map(g => scan[g.rec.k].st);
    if (sts.length && sts.every(t => t.fill !== null && t.fill === sts[0].fill && t.gs.join(' ') === sts[0].gs.join(' '))) { col = sts[0].fill || '0 g'; gs = sts[0].gs; }
  }
  pl.exact = !!col;
  if (!col) col = set.color.map(v => pdfNum(clamp(v, 0, 255) / 255)).join(' ') + ' rg';
  const parts = ['q'];
  for (const n of gs) parts.push(n + ' gs');
  parts.push(col, 'BT 0 Tc 0 Tw 100 Tz 0 Ts 0 Tr');
  for (const run of set.runs) {
    const chars = [];
    let X = null;
    for (const c of run.chars) {
      const g = await glyph(c.ch);
      if (!g) { if (c.ch.trim()) throw new Error('glyph'); continue; }
      if (X === null) { if (!c.ch.trim()) continue; X = c.x; }
      chars.push({ hex: g.hex, adv: g.adv, x: (c.x - X) / set.px, font: g.font });
    }
    if (!chars.length) continue;
    /* text space: one unit along the line and one unit up, as the page picture has them */
    const o = vp.convertToPdfPoint(X, run.y), a = vp.convertToPdfPoint(X + 1, run.y), b = vp.convertToPdfPoint(X, run.y - 1);
    const ex = [a[0] - o[0], a[1] - o[1]], ey = [b[0] - o[0], b[1] - o[1]], lx = Math.hypot(ex[0], ex[1]), ly = Math.hypot(ey[0], ey[1]);
    parts.push([ex[0] / lx, ex[1] / lx, ey[0] / ly, ey[1] / ly, o[0], o[1]].map(pdfNum).join(' ') + ' Tm', pdfLineOps(chars, set.px * lx));
  }
  parts.push('ET');
  page.pushOperators(L.PDFOperator.of('Q', [parts.join('\n')]));
}

/* Build the edited PDF → { bytes, report }.
   New text goes into the file as text wherever that can be done and comes out looking as it does on screen; an edit that
   cannot be written that way is laid over the page as a small picture. flat: pages with edits become pictures altogether
   (nothing of their old text is left, and nothing on them can be selected). */
async function pdfBuild(flat) {
  const force = new Map();       // an edit (by its picture) → 'rgb' (write it with the colour seen on screen) or the reason it has to be a picture
  for (let round = 0; ; round++) {
    const out = await pdfBuildOnce(flat, force, round >= 5);
    if (out.bytes) return out;
  }
}
async function pdfBuildOnce(flat, force, allPic) {
  const P = S.pdf;
  pdfStash();
  const edited = [...P.pages.entries()].filter(e => e[1].edits.length).sort((p, q) => p[0] - q[0]);
  const L = await pdfWriter();
  const report = { pages: edited.map(e => e[0]), removed: 0, covered: 0, coveredPages: [], flat: !!flat, whole: false, checked: false, annots: 0, dpi: edited.length ? Math.round(edited[0][1].vp.scale * 72) : 216, text: 0, pics: 0, why: {} };
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
  const fonts = new Map(), plans = new Map();
  let retry = false;
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
      const old = pdfContent(L, doc, node), scan = pdfScanShows(old.bytes), sameOps = scan.length === pg.map.nTop, byK = new Map();
      for (const s of pg.map.shows) if (s.top) byK.set(s.k, s);
      /* which edits go in as text */
      const plan = [];
      for (const e of pg.edits) {
        const info = e.pdf, pl = { e, text: false, why: '', write: null, gl: null, mode: force.get(e.after) === 'rgb' ? 'rgb' : 'exact', exact: false };
        plan.push(pl);
        if (!info) pl.why = 'image';
        else if (allPic) pl.why = 'look';
        else if (info.why) pl.why = info.why;
        else if (hit.some(a => pdfHit(a, e))) pl.why = 'annot';
        else if (!sameOps) pl.why = 'ops';
        else if (force.has(e.after) && force.get(e.after) !== 'rgb') pl.why = force.get(e.after);
        else {
          pl.gl = info.rm.map(([k, j]) => { const s = byK.get(k); return (s && s.g.find(g => g.j === j)) || null; });
          if (pl.gl.some(g => !g)) pl.why = 'ops';
          else if (info.set) { pl.write = info.set.fam.pdf ? pdfOwnPlan(info, byK, scan, old.bytes) : await pdfLibPlan(info); pl.why = pl.write.why || ''; }
          pl.text = !pl.why;
        }
      }
      /* a later edit made over the new text of an earlier one, or a picture laid over it: the earlier one becomes a picture too
         (its text would otherwise stay in the file underneath, to be found by a search) */
      for (let changed = true; changed;) {
        changed = false;
        for (let j = 1; j < plan.length; j++) for (let i = 0; i < j; i++) {
          const a = plan[i], b = plan[j];
          if (!a.text || !a.e.pdf.ink || !pdfHit(b.text ? b.e.pdf.area : b.e, a.e.pdf.ink)) continue;
          a.text = false; a.why = 'overlap'; changed = true;
          if (b.text) { b.text = false; b.why = 'overlap'; }
        }
      }
      /* take the replaced glyphs out of the page */
      const jobs = new Map();
      let want = 0, nested = 0;
      for (const pl of plan) for (const g of pl.text ? pl.gl : pdfUnder(pg, pl.e)) {
        if (!g.rec.top) { nested++; continue; }
        if (!jobs.has(g.rec.k)) jobs.set(g.rec.k, new Set());
        if (!jobs.get(g.rec.k).has(g.j)) { jobs.get(g.rec.k).add(g.j); want++; }
      }
      let left = nested;
      if (jobs.size) {
        const res = pdfStrip(old.bytes, pg.map, jobs);
        if (res.bytes && res.done.length) {
          node.set(Contents, ctx.register(ctx.flateStream(res.bytes)));
          for (const r of old.refs) if ((uses.get(r.tag) || 0) <= 1) ctx.delete(r);
        }
        for (const f of res.failed) {
          left += jobs.get(f.k).size;
          /* text written over glyphs that are still there would double them: those edits are covered with pictures */
          for (const pl of plan) if (pl.text && pl.gl.some(g => g.rec.k === f.k)) { force.set(pl.e.after, 'strip'); retry = true; }
        }
        report.removed += want - (left - nested);
      }
      if (left) { report.covered += left; report.coveredPages.push(no); }
      if (retry) continue;
      /* the edits, in the order they were made */
      const keys = new Map();
      for (const pl of plan) {
        if (!pl.text) { pdfDrawPatch(L, page, pg.vp, await doc.embedPng(await pdfPng(pl.e.after)), pl.e.x, pl.e.y, pl.e.w, pl.e.h); continue; }
        if (!pl.e.pdf.set) continue;                 // erased: the glyphs are gone, nothing takes their place
        try { await pdfWriteText(L, doc, page, pg, pl, scan, fonts, keys); } catch (err) { if (PDFS.log) PDFS.log.push({ write: String((err && err.stack) || err).slice(0, 300) }); force.set(pl.e.after, /file/.test(String(err && err.message)) ? 'file' : 'glyph'); retry = true; }
      }
      plans.set(no, plan);
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
  if (retry) return { bytes: null };
  const bytes = await doc.save();
  const texts = [...plans.values()].reduce((a, pl) => a.concat(pl.filter(q => q.text)), []);
  /* read the result back: the old text must be gone, and the new text must be there, where it belongs and looking as it does on screen */
  try {
    const chk = await pdfOpenDoc(P.lib, bytes, () => null);
    let still = 0;
    const pagesLeft = [], bad = [];
    for (const [no, pg] of edited) {
      const page = await chk.getPage(no), ol = await page.getOperatorList({ annotationMode: P.lib.AnnotationMode.DISABLE });
      const map = pdfGlyphMap(ol, P.lib.OPS, id => { try { return page.commonObjs.get(id); } catch (e) { return null; } }, pg.vp.transform);
      const plan = plans.get(no) || pg.edits.map(e => ({ e, text: false })), all = [], used = new Set();
      for (const s of map.shows) for (const g of s.g) all.push(g);
      let shot = null, n = 0;
      /* first find the glyphs of the new text: what is left under the edits after that is old text */
      for (const pl of plan) {
        if (!pl.text || !pl.e.pdf.set) continue;
        const set = pl.e.pdf.set, cov = pl.e.pdf.cov;
        let ok = true;
        for (const run of set.runs) for (const c of run.chars) {
          const sp = !c.ch.trim(), g = all.find(q => !used.has(q) && (sp ? q.sp || !String(q.u || '').trim() : String(q.u) === c.ch) && Math.abs(q.a[0] - c.x) <= 1.2 && Math.abs(q.a[1] - run.y) <= 1.2);
          if (g) used.add(g); else if (!sp) { ok = false; if (PDFS.log) PDFS.log.push({ lost: c.ch, x: c.x, y: run.y, near: all.filter(q => Math.abs(q.a[0] - c.x) < 30 && Math.abs(q.a[1] - run.y) < 30).slice(0, 4).map(q => [String(q.u), +q.a[0].toFixed(1), +q.a[1].toFixed(1)]) }); }
        }
        if (ok && cov) {
          if (!shot) shot = { out: await pdfDrawPage(page, pg.vp), app: await canvasOf(no, pg) };
          const A = shot.app.getContext('2d').getImageData(cov.x, cov.y, cov.w, cov.h).data, B = shot.out.getContext('2d').getImageData(cov.x, cov.y, cov.w, cov.h).data;
          pl.ink = pdfInkCheck(cov.a, A, B, cov.w, cov.h, set.color);
          if (pl.ink.miss > 0.03 * pl.ink.core + 2 || pl.ink.extra > 0.08 * pl.ink.core + 6) ok = false;
          if (PDFS.log) PDFS.log.push({ ink: pl.ink, mode: pl.mode, exact: pl.exact, ok });
        }
        if (!ok) bad.push(pl);
      }
      for (const pl of plan) n += (pl.text ? pdfGlyphsIn(map, pl.e.pdf.sel) : pdfUnder({ map }, pl.e)).filter(g => !used.has(g)).length;
      if (n) { still += n; pagesLeft.push(no); }
    }
    pdfDestroy(chk);
    if (bad.length) { if (PDFS.log) PDFS.bad = bytes; for (const pl of bad) force.set(pl.e.after, pl.exact ? 'rgb' : 'look'); return { bytes: null }; }
    report.checked = true; report.covered = still; report.coveredPages = pagesLeft;
  } catch (e) {
    if (PDFS.log) PDFS.log.push({ err: String((e && e.stack) || e).slice(0, 300) });
    /* text that could not be looked at is not trusted: once more, with pictures */
    if (texts.length) { for (const pl of texts) force.set(pl.e.after, 'look'); return { bytes: null }; }
    report.checked = false; report.checkErr = String((e && e.message) || e);
  }
  report.list = [];
  for (const [no, plan] of plans) for (const pl of plan) {
    report.list.push([no, pl.text ? 1 : 0, pl.why]);
    if (pl.text) report.text++; else { report.pics++; report.why[pl.why] = (report.why[pl.why] || 0) + 1; }
  }
  return { bytes, report };
}

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
  $('findNext').onclick = () => pdfFindStep(1);
  $('findPrev').onclick = () => pdfFindStep(-1);
  for (const el of [$('pgPrev'), $('pgNext'), $('pgNum')]) el.addEventListener('pointerdown', e => e.stopPropagation());
}
