/* =====================================================================
   app/find.js — finding a text everywhere, so that no occurrence is missed when the same thing has to be changed
   in several places (installable build only).
   In a PDF the text comes from the file. Text inside pictures and scans, and in a plain picture, is not text yet: the
   built-in reader reads it once, when the user asks for it, and the lines it could read can then be found like any other.

   What is searched is findCtx(): the open PDF (S.pdf) or the open picture (S.pic). Both carry these fields (findNew):
     isPic     it is a plain picture: one "page", and all of its text has to be read first
     n, cur    number of pages, and the page on screen (1 and 1 for a picture)
     lines     Map page → the text of the page for searching: [{ c: [character], b: Float32Array(x0, x1, y0, y1 for each), ocr }]
               Characters are folded (findFold) and spaces are left out, so a search ignores case, width and spacing.
     imgs      Map page → the pictures on the page that are large enough to hold text [{ x, y, w, h }]
     ocr       reading the pictures → { state: 'none' | 'run' | 'done' · lines: Map page → lines that were read
                                        stop: the user asked to stop · at: the page being read · note: what to show meanwhile }
     find      the search, or null → { q: what is looked for · hits: [{ no: page, x, y, w, h: the box to select, ocr: it was read }]
                                       at: the hit shown last (−1: none yet) · done: every page has been looked at
                                       pages: how many have · repl: the replacement typed for a hit, offered for the next }
   A hit counts as edited when an applied edit overlaps it (findEdited); nothing else is kept about it.
   ===================================================================== */
const findCtx = () => S.pdf || S.pic;         // what is being searched: the open PDF, or the open picture
const findNew = pic => ({ isPic: pic, n: 1, cur: 1, lines: new Map(), imgs: new Map(), find: null, ocr: { state: 'none', lines: new Map(), stop: false, at: 0, note: '' } });
/* a character as it is compared: width and compatibility forms folded, lower case; white space gives nothing */
const findFold = ch => { let t = ch; try { t = ch.normalize('NFKC'); } catch (e) { t = ch; } return Array.from(t.toLowerCase()).filter(c => c.trim()); };
/* the text of a page for searching: every line as its characters (spaces left out, case and width folded) with the box of each
   → [{ c: [char], b: Float32Array(x0, x1, y0, y1 …), ocr }] ; lines read from pictures come after the file's own */
async function findLines(P, no) {
  let base = P.lines.get(no);
  if (!base) {
    base = [];
    if (!P.isPic) try {
      for (const L of pdfTextIn(await pdfPageMap(P, no), { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }).lines) {
        let c = [], b = [], lastX = null;
        const flush = () => { if (c.length) base.push({ c, b: Float32Array.from(b) }); c = []; b = []; };
        for (const g of L.g) {
          if (Math.abs(g.a[1] - g.b[1]) > 0.2 * g.rec.h) continue;                      // not set along the page: its box would be wrong
          const x0 = Math.min(g.a[0], g.b[0]), x1 = Math.max(g.a[0], g.b[0]);
          if (lastX !== null && x0 - lastX > 2.5 * g.rec.h) flush();                    // another column or table cell
          lastX = x1;
          for (const ch of findFold(String(g.u == null ? '' : g.u))) { c.push(ch); b.push(x0, x1, Math.min(g.t[1], g.d[1]), Math.max(g.t[1], g.d[1])); }
        }
        flush();
      }
    } catch (e) { /* a page that cannot be read has nothing to find */ }
    P.lines.set(no, base);
  }
  const more = P.ocr.lines.get(no);
  return more && more.length ? base.concat(more) : base;
}
/* read the text in the pictures, once: every page of the PDF that has pictures, or the open picture. A second press while it runs stops it. */
async function findReadPics() {
  const P = findCtx();
  if (!P) return;
  const O = P.ocr;
  if (O.state === 'run') { O.stop = true; return; }
  O.state = 'run'; O.stop = false; O.at = 0; O.note = '';
  findRender();
  const ok = await ocrLoad(t => { O.note = t; findRender(); });
  if (findCtx() !== P) return;
  O.note = '';
  if (!ok) { O.state = 'none'; findRender(); toast('识别没能启动，请再试一次'); return; }
  for (let no = 1; no <= P.n && !O.stop; no++) {
    if (O.lines.has(no)) continue;
    let ctx = S.ictx, W = S.iw, H = S.ih, areas = null, base = [];
    if (!P.isPic) {
      base = await findLines(P, no);
      areas = P.imgs.get(no) || [];
      if (findCtx() !== P) return;
      if (!areas.length) { O.lines.set(no, []); continue; }
      if (no !== P.cur) { const page = await P.doc.getPage(no), c = await pdfDrawPage(page, pdfViewport(page)); ctx = c.getContext('2d', { willReadFrequently: true }); W = c.width; H = c.height; }
    }
    O.at = no;
    findRender();
    await tick();
    /* a line where the file has text of its own needs no reading (a scan that comes with a text layer) */
    const skip = r => base.some(L => { for (let j = 0; j < L.c.length; j++) { const cx = (L.b[4 * j] + L.b[4 * j + 1]) / 2, cy = (L.b[4 * j + 2] + L.b[4 * j + 3]) / 2; if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) return true; } return false; });
    const lines = await ocrPage(ctx, W, H, areas, skip, async () => { await tick(); return findCtx() === P && !O.stop; }, findFold);
    if (findCtx() !== P) return;
    if (lines) O.lines.set(no, lines);
  }
  O.state = O.stop ? 'none' : 'done'; O.stop = false; O.at = 0;
  if (P.find) { const q = P.find.q, repl = P.find.repl; await findAll(q); if (findCtx() === P && P.find) P.find.repl = repl; }
  findRender();
}
/* look for q on every page → P.find = { q, hits: [{ no, x, y, w, h, ocr }], at, done, pages, repl } */
async function findAll(q) {
  const P = findCtx();
  if (!P) return;
  const want = Array.from(q || '').reduce((a, ch) => a.concat(findFold(ch)), []);
  if (!want.length) { P.find = null; findRender(); return; }
  const F = P.find = { q: q.trim(), hits: [], at: -1, done: false, pages: 0, repl: '' };
  findRender();
  for (let no = 1; no <= P.n; no++) {
    const lines = await findLines(P, no);
    if (findCtx() !== P || P.find !== F) return;
    for (const L of lines) {
      for (let i = 0; i + want.length <= L.c.length; i++) {
        let k = 0;
        while (k < want.length && L.c[i + k] === want[k]) k++;
        if (k < want.length) continue;
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let j = i; j < i + k; j++) { x0 = Math.min(x0, L.b[4 * j]); x1 = Math.max(x1, L.b[4 * j + 1]); y0 = Math.min(y0, L.b[4 * j + 2]); y1 = Math.max(y1, L.b[4 * j + 3]); }
        /* the box to select: a little room around the characters (more around read ones, whose boxes hug the ink) */
        const h = y1 - y0, px = (L.ocr ? 0.14 : 0.05) * h, py = (L.ocr ? 0.2 : 0.02) * h;
        F.hits.push({ no, x: x0 - px, y: y0 - py, w: x1 - x0 + 2 * px, h: h + 2 * py, ocr: !!L.ocr });
        i += k - 1;
      }
    }
    F.pages = no;
    if (no % 4 === 0 || no === P.n) { findRender(); await new Promise(r => setTimeout(r, 0)); }
  }
  F.done = true;
  findRender();
}
/* has this occurrence been edited already? */
function findEdited(h) {
  const P = findCtx(), pg = P.isPic ? null : P.pages.get(h.no);
  const eds = P.isPic || h.no === P.cur ? S.undo.map(u => (u.pdf ? u.pdf.sel : { x: u.x, y: u.y, w: u.after.width, h: u.after.height })) : pg ? pg.edits.map(e => (e.pdf ? e.pdf.sel : e)) : [];
  return eds.some(e => pdfHit(h, e));
}
/* how many occurrences are still to be edited (−1: nothing is being looked for) */
function findLeft() {
  const P = findCtx(), F = P && P.find;
  return F && F.hits.length ? F.hits.filter(h => !findEdited(h)).length : -1;
}
/* show the find box as things stand: whether reading the pictures is offered, how far the search is, how many hits are left */
function findRender() {
  const P = findCtx(), box = $('findBox');
  box.hidden = !P || BUILD !== 'pages' || (P.isPic && !S.img);
  if (box.hidden) return;
  const F = P.find, O = P.ocr, pic = P.isPic, info = $('findInfo'), few = a => (a.length > 8 ? a.slice(0, 8).join('、') + '…' : a.join('、'));
  /* reading the pictures is offered once, and only where there are pictures */
  const picPages = pic ? [1] : [...P.imgs.entries()].filter(e => e[1].length).map(e => e[0]).sort((a, b) => a - b), offer = O.state !== 'done' && picPages.length > 0;
  $('ocrRow').hidden = !offer;
  if (offer) {
    $('ocrGo').textContent = O.state === 'run' ? '停止' : '识别图片里的文字';
    $('ocrNote').textContent = O.state === 'run' ? O.note || (pic ? '正在识别图片里的文字…' : '正在识别第 ' + (O.at || picPages[0]) + ' 页的图片…') :
      pic ? '图片里的字要先识别一次，才能查找。' : '第 ' + few(picPages) + ' 页有图片或扫描内容，里面的字要先识别一次，才能查到。';
  }
  $('findIn').placeholder = pic ? '查找图片里的文字' : '查找这份 PDF 里的文字';
  $('findIn').disabled = $('findGo').disabled = pic && O.state !== 'done';
  $('findNav').hidden = !(F && F.hits.length);
  info.hidden = !F;
  if (!F) return;
  const n = F.hits.length, left = findLeft();
  if (!n) {
    info.textContent = !F.done ? '正在查找… 已查 ' + F.pages + ' / ' + P.n + ' 页' : '没有找到“' + F.q + '”。' +
      (offer ? '图片和扫描页里的字，要先点下面的“识别图片里的文字”。' : pic || O.state === 'done' ? '识别不出来的字（手写、艺术字、太模糊的）查不到，跨行的词句也查不到。' : '跨行的词句查不到。');
    return;
  }
  const pages = [...new Set(F.hits.map(h => h.no))];
  info.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = (F.done ? '共 ' : '已找到 ') + n + ' 处';
  info.append(b, (pic ? '' : '（第 ' + few(pages) + ' 页）') + (F.done ? '' : '，还在查 ' + F.pages + ' / ' + P.n + ' 页') + '。' +
    (left === n ? '都还没改。' : left > 0 ? '已改 ' + (n - left) + ' 处，还剩 ' + left + ' 处。' : '全部改过了。') + (F.at >= 0 ? ' 现在是第 ' + (F.at + 1) + ' 处。' : '') +
    (F.hits.some(h => h.ocr) || (O.state === 'done' && [...O.lines.values()].some(l => l.length)) ? ' 图片里的字是识别出来的，可能有错漏，请再人工核对一遍。' : '') +
    (offer && !pic ? ' 图片和扫描页还没识别。' : ''));
  $('findNext').textContent = left > 0 ? '下一处' : '再看一遍';
}
/* go to the next occurrence that has not been edited (when all have been: just the next one) and select it */
async function findStep(dir) {
  const P = findCtx(), F = P && P.find;
  if (!F || !F.hits.length || P.busy) return;
  const n = F.hits.length, any = F.hits.some(h => !findEdited(h));
  let i = F.at < 0 ? (dir > 0 ? -1 : 0) : F.at;
  for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (!any || !findEdited(F.hits[i])) break; }
  const h = F.hits[i];
  F.at = i;
  if (!P.isPic && P.cur !== h.no) await pdfGo(h.no);
  if (findCtx() !== P || (!P.isPic && P.cur !== h.no)) return;
  startEdit({ x: h.x, y: h.y, w: h.w, h: h.h }, false, h);
  if (S.edit) showRect(h);
  findRender();
}
/* the replacement typed for an earlier occurrence, offered again for this one */
function findRepl(ed) {
  const P = findCtx(), F = P && P.find;
  return ed.find && F && F.repl && !findEdited(ed.find) ? F.repl : '';
}
/* an edit was applied: remember its text for the next occurrence → how many occurrences are left (−1 when nothing is being looked for) */
function findApplied(ed, mode) {
  const P = findCtx(), F = P && P.find;
  if (!F) return -1;
  if (ed.find && mode === 'text' && ed.newText.trim() && ed.newText !== ed.origText) F.repl = ed.newText;
  findRender();
  return ed.find ? findLeft() : -1;
}

/* the find box (installable build only: the artifact has no room for it and opens no PDFs) */
function findInit() {
  if (BUILD !== 'pages') return;
  $('findGo').onclick = () => findAll($('findIn').value);
  $('findIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('findIn').blur(); findAll($('findIn').value); } });
  $('findIn').addEventListener('search', () => { if (!$('findIn').value) findAll(''); });
  $('ocrGo').onclick = () => findReadPics();
  $('findNext').onclick = () => findStep(1);
  $('findPrev').onclick = () => findStep(-1);
}
