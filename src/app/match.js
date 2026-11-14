/* =====================================================================
   app/match.js — finding the font of the old text. runMatch() runs whenever the original text of the open edit
   becomes known or changes:
     1. the families worth trying for the script of the text; their regular and bold faces are loaded
     2. all of them ranked quickly on a small copy of the longest line (stage1)
     3. for text that was read and not typed: the spellings the reader could not tell apart are tried, and the text corrected
     4. every weight of the leading families; for mixed 中英文, pairs of a Latin face in front of a CJK face
     5. the best ten fitted exactly (refineCand), then the weights next to the winner, and on a PDF the file's own font
     6. the winner is adopted (adopt): the style of the edit takes its face, size, spacing and place
   Fonts load and the page is given time in between, so every step checks that the edit it started for is still open
   and unchanged (stale()).
   ===================================================================== */
let matchTimer = 0;
/* run the match in `delay` ms, unless it is asked for again before then (while the user types) */
function scheduleMatch(delay) { clearTimeout(matchTimer); matchTimer = setTimeout(() => runMatch(), delay); }
/* a face as a key */
const vkey = c => c.fam.n + '|' + c.weight + '|' + (c.italic ? 1 : 0);

/* match fonts for the open edit: the steps are listed at the top of this file */
async function runMatch() {
  const ed = S.edit;
  if (!ed || !ed.an.found) return;
  const token = ++ed.matchToken;
  const stale = () => S.edit !== ed || ed.matchToken !== token;
  const lines = ed.origLines;
  ed.bands = findBands(ed.an.alpha, ed.an.w, ed.an.h, lines.length || 0);
  if (!lines.length || !ed.bands.length) { ed.st.matched = false; computeFit(ed); refresh(); return; }
  let pi = 0, bestN = -1;
  lines.forEach((t, i) => { if (i < ed.bands.length) { const n = t.replace(/\s/g, '').length; if (n > bestN) { bestN = n; pi = i; } } });
  const text = lines[pi], band = ed.bands[pi], an = ed.an;
  ed.primary = pi; ed.primaryText = text;
  const H = band.y1 - band.y0;
  const slant = estimateSlant(an.alpha, an.w, an.h, band);
  const fams = candidateFamilies(text, ed.tier);
  /* a PDF names its fonts: the family of that name (or its open look-alike) is tried even when it is not in the short list */
  const hint = ed.pdfHint && ed.ocr && ed.ocr.tier === 'pdf' ? ed.pdfHint : null;
  const hinted = c => !!hint && (hint.fams.includes(c.fam) || (c.fam.stack || []).some(f => hint.fams.includes(f)));
  if (hint) for (const f of hint.fams) if (!fams.includes(f)) fams.push(f);
  /* and the PDF's own font, when the whole selection is set in one */
  if (ed.pdfFam && ed.ocr && ed.ocr.tier === 'pdf' && !fams.includes(ed.pdfFam)) fams.unshift(ed.pdfFam);
  setInk(an.color);
  setStatus('正在载入字体…');
  await ensureCss(fams);
  if (stale()) return;
  let vars = [];
  for (const f of fams) {
    for (const w of new Set([nearW(f, 400), nearW(f, 700)])) {
      vars.push({ fam: f, weight: w, italic: false });
      if (slant) vars.push({ fam: f, weight: w, italic: true });
    }
  }
  vars = await loadFaces(vars, text, (d, t) => { if (!stale()) setStatus('正在载入候选字体 ' + d + ' / ' + t + (d < t ? '（首次较慢）' : '')); });
  if (!stale()) setStatus('正在比对字体…');
  if (stale()) return;
  /* unusual gaps between words (columns, wide word spacing): anchor every word to where it sits.
     If that reading fits badly (the gaps were misjudged), fall back to treating the line as one run. */
  const wr = wordRuns(an.alpha, an.w, an.h, band, text.trim().split(/\s+/).length - 1);
  const pass = async runs => {
    const T1 = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 48 / H), runs);
    const buf = new Uint8Array(T1.tw * T1.th);
    let res = [];
    const run1 = async list => {
      for (let i = 0; i < list.length; i++) {
        const r = stage1(list[i], text, T1, buf);
        if (r) res.push({ c: list[i], score: r.score, iou: r.iou });
        if (i % 80 === 79) { await tick(); if (stale()) return false; }
      }
      return true;
    };
    if (!(await run1(vars))) return null;
    res.sort((a, b) => b.score - a.score);
    /* text that was read automatically may differ from the picture in small ways the reader cannot see
       (full-width or half-width yen sign, a dropped space). Try those spellings on the leading faces and keep the one that fits best. */
    if (!ed.varDone && ed.ocr && ed.origText === ed.ocr.text && lines.length === 1 && res.length && (!runs || res[0].iou >= 0.45)) {
      ed.varDone = true;
      const local = ed.ocr.tier === 'local';
      /* the built-in reader measures dashes and dots itself; there the look-alike table would only undo that */
      const vs = textVariants(text, ed.ocr.maybe), slots = alikeSlots(text).filter(sl => !local || !/[-–—－一·•・.]/.test(Array.from(text)[sl.i]));
      /* the built-in reader also names its runners-up for characters it was not sure of */
      for (const q of ed.ocr.slots || []) {
        const have = slots.find(sl => sl.i === q.i);
        if (have) { for (const a of q.alts) if (!have.alts.includes(a)) have.alts.push(a); }
        else if (slots.length < 10) slots.push({ i: q.i, alts: q.alts.slice() });
      }
      if (vs.length || slots.length) {
        const Ts = runs ? makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 48 / H), null) : T1;
        const top = res.slice(0, 20).map(r => r.c), sb = new Uint8Array(Ts.tw * Ts.th);
        const scoreOf = t => { let m = -1; for (const c of top) { const r = stage1(c, t, Ts, sb); if (r && r.score > m) m = r.score; } return m; };
        const base = scoreOf(text);
        let bv = null, bs = base;
        for (const v of vs) {
          await loadFaces(top, v.t);
          if (stale()) return null;
          const sc = scoreOf(v.t);
          if (sc > base + v.margin && sc > bs) { bs = sc; bv = v.t; }
        }
        /* look-alike characters (dashes, yen signs, middle dots): best alternative at each place, then the lot together */
        if (slots.length) {
          const cur = Array.from(bv || text), start = bv ? bs : base;
          let any = false;
          for (const sl of slots) {
            if (cur.length !== Array.from(text).length) break;      // a space was just inserted: positions no longer line up
            let bestCh = null, bsc = start + (local ? 0.02 : 0.01);
            for (const alt of sl.alts) {
              const arr = cur.slice(); arr[sl.i] = alt;
              const v = arr.join('');
              await loadFaces(top, v);
              if (stale()) return null;
              const sc = scoreOf(v);
              if (sc > bsc) { bsc = sc; bestCh = alt; }
            }
            if (bestCh) { cur[sl.i] = bestCh; any = true; }
          }
          if (any && !bv) { const v = cur.join(''); await loadFaces(top, v); if (stale()) return null; if (scoreOf(v) > base + 0.008) bv = v; }
        }
        if (bv) return { retext: bv };
      }
    }
    const lead = [];
    for (const r of res) { if (!lead.includes(r.c.fam)) lead.push(r.c.fam); if (lead.length >= 10) break; }
    const have = new Set(res.map(r => vkey(r.c)));
    let extra = [];
    for (const f of lead) for (const w of f.w) for (const it of slant ? [false, true] : [false]) {
      const c = { fam: f, weight: w, italic: it };
      if (!have.has(vkey(c))) extra.push(c);
    }
    extra = await loadFaces(extra, text);
    if (stale()) return null;
    if (!(await run1(extra))) return null;
    res.sort((a, b) => b.score - a.score);

    /* mixed 中英文: a Latin face stacked in front of a CJK face, the way pages and apps set such text.
       CJK glyphs are all one em wide, so the Latin face can be chosen first against any CJK face. */
    if (scriptOf(text) !== 'latin' && /[A-Za-z0-9]/.test(text)) {
      const c0 = res.find(r => !r.c.fam.comp);
      const lat = candidateFamilies('a', ed.tier).filter(f => !f.cjk);
      const cjk = fams.filter(f => !f.custom && !f.pdf);
      if (c0) {
        await ensureCss(lat);
        if (stale()) return null;
        const prog = (d, t) => { if (!stale()) setStatus('正在比对中英文字体组合 ' + d + ' / ' + t); };
        const n0 = res.length;
        const scoreNew = async list => { const k = res.length; if (!(await run1(await loadFaces(list, text, prog)))) return null; return res.slice(k).sort((a, b) => b.score - a.score); };
        // 1. Latin face, with the best CJK face held fixed
        let list = [];
        for (const L of lat) for (const w of new Set([nearW(c0.c.fam, 400), nearW(c0.c.fam, 700), c0.c.weight])) list.push({ fam: getComp(L, c0.c.fam), weight: w, italic: c0.c.italic });
        let got = await scoreNew(list);
        if (!got || stale()) return null;
        const topL = [];
        for (const r of got) { const L = r.c.fam.stack[0]; if (!topL.some(t => t.L === L)) topL.push({ L, w: r.c.weight }); if (topL.length >= 3) break; }
        // 2. CJK face behind each leading Latin face
        list = [];
        for (const t of topL) for (const C of cjk) if (C !== c0.c.fam) list.push({ fam: getComp(t.L, C), weight: nearW(C, t.w), italic: c0.c.italic });
        got = await scoreNew(list);
        if (!got || stale()) return null;
        // 3. every weight of the leading pairs
        const pairs = [];
        const seenS = [];
        for (const r of res.slice(n0).sort((a, b) => b.score - a.score)) {
          if (pairs.includes(r.c.fam) || seenS.some(v => Math.abs(v - r.score) < 1e-7)) continue;
          seenS.push(r.score); pairs.push(r.c.fam);
          if (pairs.length >= 5) break;
        }
        const have2 = new Set(res.map(r => vkey(r.c)));
        list = [];
        for (const f of pairs) for (const w of f.w) { const c = { fam: f, weight: w, italic: c0.c.italic }; if (!have2.has(vkey(c))) list.push(c); }
        got = await scoreNew(list);
        if (!got || stale()) return null;
        for (let i = n0; i < res.length; i++) res[i].score -= 0.012;
        res.sort((a, b) => b.score - a.score);
      }
    }
    let T2 = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 150 / H), runs);
    let T2c = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 26 / H), runs);
    const top = [], perFam = new Map(), seenIou = [];
    for (const r of res) {
      const k = perFam.get(r.c.fam) || 0;
      if (k >= 3) continue;
      if (seenIou.some(v => Math.abs(v - r.iou) < 1e-7)) continue;
      seenIou.push(r.iou);
      perFam.set(r.c.fam, k + 1); top.push(r.c);
      if (top.length >= 10) break;
    }
    if (hint && !top.some(hinted)) { const r = res.find(q => hinted(q.c)); if (r) top.push(r.c); }
    if (ed.pdfFam && !top.some(c => c.fam === ed.pdfFam)) { const r = res.find(q => q.c.fam === ed.pdfFam); if (r) top.push(r.c); }
    const refined = [];
    const refine = c => { const r = refineCand(c, text, T2, T2c); if (r) { if (c.fam.comp) r.score -= 0.012; if (hinted(c)) r.score += 0.012; if (c.fam.pdf) r.score += 0.03; refined.push(r); } };   // the file's own font wins a near tie with its look-alikes
    for (let i = 0; i < top.length; i++) { refine(top[i]); if (i % 3 === 2) { await tick(); if (stale()) return null; } }
    refined.sort((a, b) => b.score - a.score);
    /* the neighbouring weights of the winner, in case the first pass ranked them poorly */
    if (refined.length) {
      const b0 = refined[0], done = new Set(refined.map(vkey));
      const ws = b0.fam.w, wi = ws.indexOf(b0.weight);
      for (const w of [ws[wi - 1], ws[wi + 1]]) {
        if (w == null) continue;
        const c = { fam: b0.fam, weight: w, italic: b0.italic };
        if (done.has(vkey(c)) || !(await ensureFace(c, text))) continue;
        if (stale()) return null;
        refine(c);
      }
      refined.sort((a, b) => b.score - a.score);
    }
    /* words were anchored one by one but the spacing turned out ordinary: fit the winner once more as one run, which is more exact */
    if (runs && refined.length) {
      const b0 = refined[0];
      if (plainRef(lineRef(b0, text, b0.xs, b0.words, b0.oy, b0.px, b0.trEm * b0.px, band))) {
        const S2 = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 150 / H), null);
        const S2c = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 26 / H), null);
        const r2 = refineCand(b0, text, S2, S2c);
        if (r2 && r2.iou >= b0.iou - 0.02) { r2.score = b0.score; refined[0] = r2; T2 = S2; T2c = S2c; }
      }
    }
    /* the PDF's own font needs no fitting: the file says where its glyphs sit */
    if (ed.pdfFam && ed.ocr && ed.ocr.tier === 'pdf') {
      const ex = pdfExact(ed, text, T2);
      if (ex) {
        for (let k = refined.length - 1; k >= 0; k--) if (refined[k].fam === ed.pdfFam) refined.splice(k, 1);
        refined.push(ex);
        refined.sort((a, b) => b.score - a.score);
      }
    }
    return { res, refined, T1, T2, T2c };
  };
  let out = await pass(wr && wr.odd ? wr.runs : null);
  if (!out) return;
  const retext = t => {
    const mirror = !ed.newText || ed.newText === ed.origText;
    ed.ocr.text = t;
    if (mirror) { ed.newText = ''; $('inNew').value = ''; }
    setOrig(t, true);
  };
  if (out.retext) { retext(out.retext); return; }
  if (wr && wr.odd && (!out.refined.length || out.refined[0].iou < 0.8)) {
    const o2 = await pass(null);
    if (!o2) return;
    if (o2.retext) { retext(o2.retext); return; }
    if (o2.refined.length && (!out.refined.length || o2.refined[0].iou > out.refined[0].iou)) out = o2;
  }
  const { res, refined, T1, T2 } = out;
  ed.T2 = out.T2; ed.T2c = out.T2c;
  const list = [], seen = new Set(), seenI = [];
  for (const r of refined) { if (seen.has(r.fam)) continue; seen.add(r.fam); list.push(r); }
  for (const r of res) {
    if (list.length >= 10) break;
    if (seen.has(r.c.fam) || seenI.some(v => Math.abs(v - r.iou) < 1e-7)) continue;
    seen.add(r.c.fam); seenI.push(r.iou);
    list.push({ fam: r.c.fam, weight: r.c.weight, italic: r.c.italic, iou: r.iou, score: r.score, rough: true });
  }
  ed.cands = list;
  if (!refined.length) { setStatus('没能比对出字体，可以在“微调”里手动选。', true); renderCands(); return; }
  /* for a PDF, a font that can be put into the file keeps the new text real text, a device font makes it a picture:
     the former is taken when it fits nearly as well */
  let best = refined[0];
  if (S.pdf && BUILD === 'pages' && !best.fam.pdf) {
    const fits = async r => !r.fam.pdf && pdfEmbeddable(r.fam) && !(await pdfUncovered(r.fam, r.weight, r.italic, ed.origText));
    if (!(await fits(best))) for (const r of refined) if (r !== best && r.score >= best.score - 0.1 && (await fits(r))) { best = r; break; }
    if (stale()) return;
  }
  adopt(best, true);
  pdfFontFor(ed);
  if (ed.ocr && !ed.ocr.reread && ed.origText === ed.ocr.text) {
    const gs = glyphScores(best, text, ed.T2, best).map(g => g.iou).sort((p, q) => p - q);
    const med = gs.length ? gs[gs.length >> 1] : 1;
    const dev = gs.map(v => Math.abs(v - med)).sort((p, q) => p - q), mad = dev.length ? dev[dev.length >> 1] : 0;
    /* one character far below the rest, or a poor fit overall: ask the stronger model once */
    const oddChar = gs.length >= 2 && gs[0] < 0.8 && gs[0] < med - Math.max(0.15, 4 * mad);
    if (S.sample && (oddChar || best.iou < 0.68)) { ed.ocr.reread = true; ed.ocr.auto = true; recognize('default'); }
    else if (oddChar || (ed.ocr.tier === 'local' && best.iou < 0.68)) ed.ocr.doubt = true;
  }
  if (ed.ocr && ed.ocr.doubt && !S.sample) { ed.ocr.doubt = false; setStatus(ed.ocr.reread && ed.ocr.tier === 'local' ? '这段字读得没把握，已填上最接近的结果，请核对改正。' : '有的字可能读错了，请核对上面的原文字。', true); }
  else if (best.iou < 0.55) setStatus('没找到很接近的字体。可以在“微调”里手动选，或上传字体文件。', true);
  else setStatus(ed.tier < 2 && scriptOf(text) === 'latin' && best.iou < 0.8 ? '不够像的话，“微调”里可以在更多字体里再找一遍。' : best.fam.pdf && ed.st.fam === best.fam ? '用的是 PDF 自带的字体，和原文一致。' : ed.pdfAlt ? $('matchStatus').textContent : hint ? 'PDF 里这段字写的字体名是 ' + hint.label + '。' : '', !!ed.pdfAlt);
  pdfFontNote(ed);
  renderCands();
}

/* use candidate r for the open edit. auto: the match chose it, so what the user nudged by hand starts afresh */
function adopt(r, auto) {
  const ed = S.edit, st = ed.st;
  st.fam = r.fam; st.weight = r.weight; st.italic = r.italic;
  st.px = r.px; st.trEm = r.trEm; st.geo = { ox: r.ox, oy: r.oy, xs: r.xs, words: r.words }; st.score = r.iou; st.matched = true;
  if (auto) { st.blur = Math.round(r.blur * 20) / 20; st.sizeAdj = 1; st.trAdj = 0; st.dx = 0; st.dy = 0; }
  computeFit(ed); refresh();
}
/* the user picked a family, a weight or the slant: load that face, fit it to the old text when that is known, and use it */
async function chooseFont(fam, weight, italic) {
  const ed = S.edit;
  if (!ed) return;
  const c = { fam, weight: nearW(fam, weight), italic: !!italic };
  const text = ed.primaryText || ed.newText || ed.origText || 'Aa';
  setStatus('正在载入 ' + famLabel(fam) + '…');
  const ok = await ensureFace(c, (ed.origText + ed.newText) || text);
  if (S.edit !== ed) return;
  if (!ok) { setStatus('这款字体没能载入，换一款试试。', true); refresh(); return; }
  setStatus('');
  let r = null;
  setInk(ed.an.color);
  if (ed.T2 && ed.primaryText) r = refineCand(c, ed.primaryText, ed.T2, ed.T2c);
  if (r) adopt(r, false);
  else { const st = ed.st; st.fam = fam; st.weight = c.weight; st.italic = c.italic; st.score = null; computeFit(ed); refresh(); }
  renderCands();
}
