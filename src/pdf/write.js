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
