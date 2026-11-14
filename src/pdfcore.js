/* =====================================================================
   pdfcore.js — the parts of PDF support that do not touch the page (so they can be tested on their own).
   1. Where every glyph of a PDF page sits, worked out from pdf.js's list of drawing operators
      (the same arithmetic pdf.js uses to draw them). This gives the exact original text of a selection,
      and says which glyphs lie under an edit.
   2. Taking those glyphs out of the page's content stream, so the old text is really gone from the file
      and not only covered. Every other glyph keeps its place: a removed glyph is replaced by a move of
      the same width.
   ===================================================================== */
const pdfMul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const pdfPt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/* ol: pdf.js operator list of the page content (annotations off). OPS: pdf.js operator ids.
   getFont(id): the font object pdf.js made. base: viewport transform (PDF units → picture pixels).
   → { shows: [{ k, top, i, font, name, size, … , g: [glyph] }], nTop }
   k numbers the text-showing operators of the page's own content stream in order (−1 inside a form XObject). */
function pdfGlyphMap(ol, OPS, getFont, base) {
  const fn = ol.fnArray, args = ol.argsArray, shows = [], stack = [];
  let ctm = base.slice(), depth = 0, k = 0;
  let st = { tm: null, x: 0, y: 0, lx: 0, ly: 0, tc: 0, tw: 0, hs: 1, lead: 0, rise: 0, font: null, fobj: null, size: 0, dir: 1, fm0: 0.001, mode: 0 };
  for (let i = 0; i < fn.length; i++) {
    const a = args[i];
    switch (fn[i]) {
      case OPS.save: stack.push([ctm, Object.assign({}, st)]); break;
      case OPS.restore: if (stack.length) [ctm, st] = stack.pop(); break;
      case OPS.transform: ctm = pdfMul(ctm, a); break;
      case OPS.paintFormXObjectBegin: stack.push([ctm, Object.assign({}, st)]); depth++; if (a && a[0]) ctm = pdfMul(ctm, a[0]); break;
      case OPS.paintFormXObjectEnd: if (stack.length) [ctm, st] = stack.pop(); depth = Math.max(0, depth - 1); break;
      case OPS.beginText: st.tm = null; st.x = st.lx = st.y = st.ly = 0; break;
      case OPS.setCharSpacing: st.tc = a[0]; break;
      case OPS.setWordSpacing: st.tw = a[0]; break;
      case OPS.setHScale: st.hs = a[0] / 100; break;
      case OPS.setLeading: st.lead = -a[0]; break;
      case OPS.setTextRise: st.rise = a[0]; break;
      case OPS.setTextRenderingMode: st.mode = a[0]; break;
      case OPS.setFont: {
        const f = getFont(a[0]);
        st.font = a[0]; st.fobj = f || null;
        st.fm0 = f && f.fontMatrix ? f.fontMatrix[0] : 0.001;
        if (a[1] < 0) { st.size = -a[1]; st.dir = -1; } else { st.size = a[1]; st.dir = 1; }
        break;
      }
      case OPS.moveText: st.x = st.lx += a[0]; st.y = st.ly += a[1]; break;
      case OPS.setLeadingMoveText: st.lead = a[1]; st.x = st.lx += a[0]; st.y = st.ly += a[1]; break;
      case OPS.setTextMatrix: st.tm = a[0]; st.x = st.lx = st.y = st.ly = 0; break;
      case OPS.nextLine: st.x = st.lx; st.y = st.ly += st.lead; break;
      case OPS.showText: {
        const f = st.fobj, top = depth === 0, gl = a[0];
        const rec = { k: top ? k++ : -1, top, i, font: st.font, name: f ? f.name || '' : '', size: st.size, tc: st.tc, tw: st.tw, tfs: st.size * st.dir, fm0: st.fm0,
          vertical: !!(f && f.vertical), type3: !!(f && f.isType3Font), mode: st.mode, glyphs: gl, g: [], fo: f };
        shows.push(rec);
        if (!f || rec.vertical || !st.size) break;
        const M = st.tm ? pdfMul(ctm, st.tm) : ctm, hs = st.hs * st.dir, up = st.dir * st.size, oy = st.y + st.rise;
        const asc = f.ascent > 0.3 && f.ascent < 1.3 ? f.ascent : 0.85, des = f.descent < 0 && f.descent > -0.8 ? f.descent : -0.2;
        /* how tall a line of this text is in the picture */
        const u0 = pdfPt(M, 0, 0), u1 = pdfPt(M, 0, up);
        rec.h = Math.hypot(u1[0] - u0[0], u1[1] - u0[1]);
        let x = 0;
        for (let j = 0; j < gl.length; j++) {
          const g = gl[j];
          if (typeof g === 'number') { x -= (g * st.size) / 1000; continue; }
          const adv = g.width * st.fm0 * st.size, ox = st.x + x * hs, ex = st.x + (x + adv) * hs, mx = (ox + ex) / 2;
          rec.g.push({ j, u: g.unicode, sp: !!g.isSpace, code: g.originalCharCode, a: pdfPt(M, ox, oy), b: pdfPt(M, ex, oy), c: pdfPt(M, mx, oy + 0.32 * up),
            t: pdfPt(M, mx, oy + asc * up), d: pdfPt(M, mx, oy + des * up), rec });
          x += adv + ((g.isSpace ? st.tw : 0) + st.tc) * st.dir;
        }
        st.x += x * hs;
        break;
      }
      default: break;
    }
  }
  return { shows, nTop: k };
}

/* glyphs whose middle lies in the rectangle (picture pixels) */
function pdfGlyphsIn(map, r) {
  const out = [];
  for (const s of map.shows) for (const g of s.g) if (g.c[0] >= r.x && g.c[0] < r.x + r.w && g.c[1] >= r.y && g.c[1] < r.y + r.h) out.push(g);
  return out;
}

/* the text of a selection, as the PDF has it → { text, bad, fonts, n } ; bad: the PDF's own text is unusable (no proper character table) */
function pdfTextIn(map, r) {
  const gs = pdfGlyphsIn(map, r).filter(g => g.rec.h > 0);
  if (!gs.length) return { text: '', bad: false, fonts: [], n: 0, lines: [] };
  gs.sort((p, q) => p.a[1] - q.a[1] || p.a[0] - q.a[0]);
  const lines = [], han = c => /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(c);
  for (const g of gs) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(g.a[1] - L.y) < 0.5 * Math.max(L.h, g.rec.h)) { L.g.push(g); L.y += (g.a[1] - L.y) / L.g.length; L.h = Math.max(L.h, g.rec.h); }
    else lines.push({ y: g.a[1], h: g.rec.h, g: [g] });
  }
  let bad = false;
  const fonts = new Map(), txt = [], out = [];
  for (const L of lines) {
    L.g.sort((p, q) => p.a[0] - q.a[0]);
    const gaps = [];
    /* the ordinary gap between neighbours of one script: letter-spaced text has it everywhere and gets no spaces from it */
    for (let i = 0; i + 1 < L.g.length; i++) if (han(String(L.g[i].u || '')) === han(String(L.g[i + 1].u || ''))) gaps.push(Math.max(0, L.g[i + 1].a[0] - L.g[i].b[0]));
    gaps.sort((p, q) => p - q);
    const med = gaps.length ? gaps[gaps.length >> 1] : 0;
    let t = '';
    L.g.forEach((g, i) => {
      const u = g.u == null ? '' : String(g.u), white = !u.trim() || u === ' ';
      if (!u || /[-�\u0000-\u0008\u000e-\u001f]/.test(u)) bad = true;
      if (i > 0) {
        /* a gap wide enough to be a word space; between Chinese and Latin or digits a smaller gap already reads as one
           (office programs add it there on their own) */
        const p = L.g[i - 1], d = g.a[0] - p.b[0], mix = han(u) !== han(String(p.u || '')), need = mix ? 0.09 : 0.18;
        if (!white && !/\s$/.test(t) && d > need * L.h && d > 2 * med + (mix ? 0.03 : 0.05) * L.h) t += ' ';
      }
      t += white ? ' ' : u;
      if (!white) fonts.set(g.rec.name, (fonts.get(g.rec.name) || 0) + 1);
    });
    t = t.replace(/\s+/g, ' ').trim();
    if (t) { txt.push(t); out.push({ text: t, g: L.g }); }
  }
  return { text: txt.join('\n'), bad, fonts: [...fonts.entries()].sort((p, q) => q[1] - p[1]).map(e => e[0]), n: gs.length, lines: out };
}

/* ---------- content stream ---------- */
const pdfWS = c => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const pdfDelim = c => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
const pdfLatin1 = (b, s, e) => { let t = ''; for (let i = s; i < e; i++) t += String.fromCharCode(b[i]); return t; };

/* the text-showing operators of a content stream, in order → [{ op, s, e, items, pre, st }]
   s..e is the byte range of the operator with its operands; items are the strings and numbers it shows;
   st is what was in force there: { font: '/F1', size, fill: the operators that set the fill colour ('' = the default black,
   null = not understood), gs: the graphics-state dictionaries applied } */
function pdfScanShows(b) {
  const n = b.length, out = [], stack = [];
  let i = 0, opd = [], g = { font: '', size: 0, cs: '', col: '', gs: [] };
  const raw = () => (opd.length ? pdfLatin1(b, opd[0].s, opd[opd.length - 1].e) : '');
  const nums = k => opd.length === k && opd.every(o => o.t === 'num');
  while (i < n) {
    const c = b[i];
    if (pdfWS(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }
    const s = i;
    if (c === 40) {
      let d = 1;
      i++;
      while (i < n && d > 0) { const ch = b[i]; if (ch === 92) i += 2; else { if (ch === 40) d++; else if (ch === 41) d--; i++; } }
      opd.push({ t: 'str', s, e: Math.min(i, n) });
      continue;
    }
    if (c === 60) {
      if (b[i + 1] === 60) { i += 2; opd.push({ t: 'dict', s, e: i }); continue; }
      i++;
      while (i < n && b[i] !== 62) i++;
      i++;
      opd.push({ t: 'hex', s, e: Math.min(i, n) });
      continue;
    }
    if (c === 62) { i += b[i + 1] === 62 ? 2 : 1; opd.push({ t: 'dict', s, e: i }); continue; }
    if (c === 91) { i++; opd.push({ t: '[', s, e: i }); continue; }
    if (c === 93) { i++; opd.push({ t: ']', s, e: i }); continue; }
    if (c === 47) { i++; while (i < n && !pdfWS(b[i]) && !pdfDelim(b[i])) i++; opd.push({ t: 'name', s, e: i }); continue; }
    while (i < n && !pdfWS(b[i]) && !pdfDelim(b[i])) i++;
    if (i === s) { i++; continue; }
    const word = pdfLatin1(b, s, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) { opd.push({ t: 'num', s, e: i }); continue; }
    if (word === 'BI') {
      /* an inline image: skip its data, which may hold anything */
      let j = i;
      while (j + 2 < n && !(b[j] === 73 && b[j + 1] === 68 && pdfWS(b[j - 1]) && pdfWS(b[j + 2]))) j++;
      j += 3;
      while (j + 1 < n && !(b[j] === 69 && b[j + 1] === 73 && pdfWS(b[j - 1]) && (j + 2 >= n || pdfWS(b[j + 2])))) j++;
      i = Math.min(n, j + 2); opd = [];
      continue;
    }
    if (word === 'Tj' || word === "'" || word === '"' || word === 'TJ') {
      const m = opd.length;
      let items = null, first = null, pre = '';
      if (word === 'TJ') {
        let a = m - 1;
        while (a >= 0 && opd[a].t !== '[') a--;
        if (a >= 0 && opd[m - 1].t === ']') { items = opd.slice(a + 1, m - 1); first = opd[a]; }
      } else if (m >= 1 && (opd[m - 1].t === 'str' || opd[m - 1].t === 'hex')) {
        items = [opd[m - 1]]; first = opd[m - 1];
        if (word === "'") pre = 'T* ';
        if (word === '"') {
          if (m >= 3 && opd[m - 2].t === 'num' && opd[m - 3].t === 'num') { pre = pdfLatin1(b, opd[m - 3].s, opd[m - 3].e) + ' Tw ' + pdfLatin1(b, opd[m - 2].s, opd[m - 2].e) + ' Tc T* '; first = opd[m - 3]; }
          else items = null;
        }
      }
      out.push({ op: word, s: first ? first.s : s, e: i, items, pre,
        st: { font: g.font, size: g.size, fill: g.col === null ? null : (g.cs ? g.cs + ' ' : '') + g.col, gs: g.gs.slice() } });
    } else if (word === 'q') stack.push({ font: g.font, size: g.size, cs: g.cs, col: g.col, gs: g.gs.slice() });
    else if (word === 'Q') { if (stack.length) g = stack.pop(); }
    else if (word === 'Tf') { const m = opd.length; if (m >= 2 && opd[m - 2].t === 'name' && opd[m - 1].t === 'num') { g.font = pdfLatin1(b, opd[m - 2].s, opd[m - 2].e); g.size = +pdfLatin1(b, opd[m - 1].s, opd[m - 1].e); } else g.font = ''; }
    else if (word === 'g' || word === 'rg' || word === 'k') { g.cs = ''; g.col = nums(word === 'g' ? 1 : word === 'rg' ? 3 : 4) ? raw() + ' ' + word : null; }
    else if (word === 'cs') { if (opd.length === 1 && opd[0].t === 'name') { g.cs = raw() + ' cs'; g.col = ''; } else { g.cs = ''; g.col = null; } }
    else if (word === 'sc' || word === 'scn') g.col = opd.length && opd.every(o => o.t === 'num') ? raw() + ' ' + word : null;   // a pattern (named) cannot be repeated elsewhere
    else if (word === 'gs') { if (opd.length === 1 && opd[0].t === 'name') g.gs.push(raw()); }
    opd = [];
  }
  return out;
}

function pdfStrBytes(b, tok) {
  const out = [], end = tok.e - 1;
  if (tok.t === 'hex') {
    let hi = -1;
    for (let i = tok.s + 1; i < end; i++) {
      const c = b[i], v = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
      if (v < 0) continue;
      if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; }
    }
    if (hi >= 0) out.push(hi * 16);
    return out;
  }
  for (let i = tok.s + 1; i < end; i++) {
    let c = b[i];
    if (c === 92) {
      c = b[++i];
      if (i >= end) break;
      if (c === 110) out.push(10); else if (c === 114) out.push(13); else if (c === 116) out.push(9); else if (c === 98) out.push(8); else if (c === 102) out.push(12);
      else if (c >= 48 && c <= 55) { let v = c - 48; for (let q = 0; q < 2 && i + 1 < end && b[i + 1] >= 48 && b[i + 1] <= 55; q++) v = v * 8 + b[++i] - 48; out.push(v & 255); }
      else if (c === 13) { if (b[i + 1] === 10) i++; }
      else if (c !== 10) out.push(c);
    } else if (c === 13) { out.push(10); if (b[i + 1] === 10) i++; }
    else out.push(c);
  }
  return out;
}

/* how many bytes one character code takes in this text-showing operator (0 when that cannot be told) */
function pdfCodeBytes(b, sh, rec) {
  if (!sh || !sh.items || !rec) return 0;
  let nB = 0, nG = 0;
  for (const it of sh.items) if (it.t === 'str' || it.t === 'hex') nB += pdfStrBytes(b, it).length;
  for (const g of rec.glyphs) if (typeof g !== 'number') nG++;
  return nG && nB % nG === 0 && nB / nG <= 4 ? nB / nG : 0;
}

const pdfNum = v => { const t = (Math.abs(v) < 1e-6 ? 0 : v).toFixed(4).replace(/\.?0+$/, ''); return t === '-0' ? '0' : t; };

/* one text-showing operator rewritten without the glyphs in rm (indices into pdf.js's glyph list of that operator).
   Throws when the operator in the stream and the one pdf.js reported do not agree byte for byte; nothing is changed then. */
function pdfRewriteShow(b, sh, rec, rm) {
  if (!sh.items) throw new Error('operands not understood');
  const gl = rec.glyphs, strs = sh.items.map(it => (it.t === 'str' || it.t === 'hex' ? pdfStrBytes(b, it) : null));
  let nB = 0, nG = 0;
  for (const s of strs) if (s) nB += s.length;
  for (const g of gl) if (typeof g !== 'number') nG++;
  if (!nG || nB % nG) throw new Error('glyph count does not fit the string (' + nB + ' bytes, ' + nG + ' glyphs)');
  const bpg = nB / nG;
  if (bpg > 4 || !rec.tfs) throw new Error('unsupported character codes');
  const out = [];
  let gi = 0, keep = '', skip = 0, skipping = false;
  const flush = () => { if (keep) { out.push('<' + keep + '>'); keep = ''; } if (skipping) { out.push(pdfNum(skip)); skip = 0; skipping = false; } };
  sh.items.forEach((it, q) => {
    const s = strs[q];
    if (!s) {
      if (it.t !== 'num' || typeof gl[gi] !== 'number') throw new Error('array item does not match');
      flush(); out.push(pdfLatin1(b, it.s, it.e)); gi++;
      return;
    }
    if (s.length % bpg) throw new Error('string length does not fit');
    for (let p = 0; p < s.length; p += bpg, gi++) {
      const g = gl[gi];
      if (!g || typeof g === 'number') throw new Error('glyph list does not match');
      let code = 0, hex = '';
      for (let z = 0; z < bpg; z++) { code = code * 256 + s[p + z]; hex += (s[p + z] < 16 ? '0' : '') + s[p + z].toString(16); }
      if (code !== g.originalCharCode) throw new Error('character code does not match');
      if (rm.has(gi)) {
        if (keep) { out.push('<' + keep + '>'); keep = ''; }
        /* the move that the glyph made, in the units of a TJ array (thousandths of the font size, positive = left) */
        skip -= g.width * rec.fm0 * 1000 + ((rec.tc + (g.isSpace ? rec.tw : 0)) * 1000) / rec.tfs;
        skipping = true;
      } else {
        if (skipping) { out.push(pdfNum(skip)); skip = 0; skipping = false; }
        keep += hex;
      }
    }
  });
  flush();
  if (gi !== gl.length) throw new Error('glyph list longer than the string');
  return sh.pre + '[' + out.join(' ') + '] TJ';
}

/* content: the page's own content stream (decoded). jobs: Map k → Set of glyph indices to take out, for the k-th text-showing operator.
   shows: map.shows. → { bytes, done: [k…], failed: [{ k, why }] } */
function pdfStrip(content, map, jobs) {
  const scan = pdfScanShows(content), failed = [], done = [];
  if (scan.length !== map.nTop) return { bytes: null, done, scan: null, failed: [...jobs.keys()].map(k => ({ k, why: 'operator count differs (' + scan.length + ' in the file, ' + map.nTop + ' drawn)' })) };
  const byK = new Map();
  for (const s of map.shows) if (s.top) byK.set(s.k, s);
  const parts = [], enc = new TextEncoder();
  let pos = 0;
  for (const k of [...jobs.keys()].sort((p, q) => p - q)) {
    const sh = scan[k], rec = byK.get(k);
    let rep;
    try { rep = pdfRewriteShow(content, sh, rec, jobs.get(k)); } catch (e) { failed.push({ k, why: e.message }); continue; }
    parts.push(content.subarray(pos, sh.s), enc.encode(rep));
    pos = sh.e; done.push(k);
  }
  parts.push(content.subarray(pos));
  let len = 0;
  for (const p of parts) len += p.length;
  const bytes = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { bytes.set(p, o); o += p.length; }
  return { bytes, done, failed, scan };
}

/* ---------- new text as text ---------- */
/* One line of new text as PDF operators. chars: [{ hex, adv, x, font }] in drawing order: hex = the character code(s),
   adv = the advance the font gives that glyph and x = where its pen origin has to be, both in units of the type size
   from the start of the line; font = the resource name it is set in. Every glyph is put exactly at x: the gaps go into
   the TJ array as kerning numbers. → 'Tf … TJ' operators (the text matrix is set by the caller). */
function pdfLineOps(chars, size) {
  const out = [];
  let font = null, arr = [], run = '', pen = 0;
  const flushRun = () => { if (run) { arr.push('<' + run + '>'); run = ''; } };
  const flushArr = () => { flushRun(); if (arr.length) out.push('[' + arr.join(' ') + '] TJ'); arr = []; };
  for (const c of chars) {
    if (c.font !== font) { flushArr(); font = c.font; out.push(font + ' ' + pdfNum(size) + ' Tf'); }
    const kern = (pen - c.x) * 1000;                    // TJ numbers: thousandths of the type size, positive moves left
    if (Math.abs(kern) >= 0.05) { flushRun(); arr.push(pdfNum(kern)); pen = c.x; }
    run += c.hex; pen += c.adv;
  }
  flushArr();
  return out.join(' ');
}

/* Does the saved page show the new text the way the app drew it? M: how much of each pixel the app's new text covered (0–255),
   A: the app's picture, B: the saved page drawn again (both RGBA, w×h), col: the text colour.
   A glyph may sit a pixel off, so a pixel is compared with its neighbours. → { core, miss, extra }:
   core = pixels the new text covers solidly, miss = those where the saved page has no such ink,
   extra = pixels where the saved page has ink of that colour and the app's picture has none. */
function pdfInkCheck(M, A, B, w, h, col, tol) {
  const T = tol || 72, near = new Uint8Array(w * h), nearA = new Uint8Array(w * h);
  const like = (d, p) => Math.abs(d[p] - col[0]) <= T && Math.abs(d[p + 1] - col[1]) <= T && Math.abs(d[p + 2] - col[2]) <= T;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) { if (like(B, p)) near[i] = 1; if (like(A, p)) nearA[i] = 1; }
  const any = (a, x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && a[yy * w + xx]) return true; } return false; };
  let core = 0, miss = 0, extra = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (M[i] >= 204) { core++; if (!any(near, x, y)) miss++; }
    if (near[i] && !any(nearA, x, y)) extra++;
  }
  return { core, miss, extra };
}
