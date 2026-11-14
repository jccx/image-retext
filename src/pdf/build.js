/* =====================================================================
   pdf/build.js — the edited file.
   pdfBuild() tries until a file comes out whose edited pages, drawn again, show what the screen shows. One round:
     1. plan every edit: text or picture (and why a picture)
     2. take the replaced glyphs out of the content stream of each page (core.js)
     3. write the edits in the order they were made: text operators, or a picture laid over the page
     4. open the result with pdf.js and check it: every new character is there, where it belongs; the page looks as it
        does on screen (pdfInkCheck); nothing of the old text is left under the edits
   An edit that fails a check is forced to a safer way of writing, and the file is built again:
   text coloured with the old text's own colour operators → text in plain RGB → a picture. From the sixth round on,
   every edit is a picture.

   A plan entry (pl), one for each edit of a page:
     { e: the edit (pg.edits) · text: it goes in as text · why: the reason when it does not (a key of PDF_WHY in save.js)
       write: the font plan (write.js) · gl: the glyphs it replaces
       mode: 'exact', colour it with the operators the old text was coloured with, or 'rgb'
       exact: those operators could really be used · ink: what pdfInkCheck found }
   The report:
     { pages: the edited pages · text, pics: how many edits went in as text and as pictures · why: { reason: how many }
       removed: old glyphs taken out · covered, coveredPages: old glyphs that are still in the file under an edit
       checked: the result was opened and looked at · flat: the edited pages were turned into pictures
       whole: the file had to be made anew, every page a picture · annots: notes and form fields merged into the page
       dpi: resolution of the pictures · list: [[page, 1 text or 0 picture, why]] }
   ===================================================================== */
/* Build the edited PDF → { bytes, report }.
   New text goes into the file as text wherever that can be done and comes out looking as it does on screen; an edit that
   cannot be written that way is laid over the page as a small picture. flat: pages with edits become pictures altogether
   (nothing of their old text is left, and nothing on them can be selected). */
async function pdfBuild(flat) {
  /* an edit → 'rgb' (write it with the colour seen on screen) or the reason it has to be a picture. The key is the edit's
     picture: the edit records themselves are made anew every round (pdfStash), the picture stays the same. */
  const force = new Map();
  for (let round = 0; ; round++) {
    const out = await pdfBuildOnce(flat, force, round >= 5);
    if (out.bytes) return out;
  }
}
/* one round → { bytes, report }, or { bytes: null } when `force` has gained entries and the file has to be built again.
   allPic: no edit goes in as text. */
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
