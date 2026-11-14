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

/* ---------- the new text as text: which font writes it ---------- */
const pdfEmbeddable = fam => (fam.stack || [fam]).every(m => !m.sys && !m.pdf && !!SELF_FONTS[m.n]);
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
  for (const q of gs) { ctx.font = fontCss(c, q.rec.h * T.ky); ctx.fillText(encT(fam, String(q.u)), (q.a[0] - ed.rect.x - T.offX) * T.kx, (q.a[1] - ed.rect.y - T.offY) * T.ky); }
  const d = ctx.getImageData(0, 0, T.tw, T.th).data, buf = new Uint8Array(T.tw * T.th);
  let sum = 0;
  for (let i = 0, p = 3; i < buf.length; i++, p += 4) { buf[i] = d[p]; sum += d[p]; }
  r.iou = softIoU(T.A, buf, T.tw, T.th, 0, 0, T.sumA, sum);
  r.score = r.iou + 0.08;        // it is the font the file uses: a look-alike has to fit clearly better to be preferred
  return r;
}

