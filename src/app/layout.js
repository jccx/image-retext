/* =====================================================================
   app/layout.js — where the old text sat, and where the new text goes.
   computeFit() makes one reference for every line of the old text (ed.fit), in pixels of the region →
     { x0: the pen origin of the line · oy: its baseline · adv: its whole advance · inkL, inkR: where its ink begins and ends
       extras: for each gap between words, how much wider or narrower it was than ordinary spacing
       extraMore: the same for gaps beyond those }
   layoutNew() sets the new text on these references: same origin, baseline, size and spacing, line for line.
   ===================================================================== */
/* a line as its words and what stands between them → { lead: white space in front, words, seps } */
function splitParts(t) {
  const lead = /^\s*/.exec(t)[0];
  const words = [], seps = [];
  const re = /(\S+)(\s*)/g;
  let m;
  while ((m = re.exec(t.slice(lead.length).replace(/\s+$/, '')))) { words.push(m[1]); if (m[2]) seps.push(m[2]); }
  return { lead, words, seps };
}
/* the number of characters (not of UTF-16 units) */
const cps = t => Array.from(t).length;
/* pen distance from the start of `word` to the start of the next word in ordinary typesetting */
function natStep(st, word, sep, px, tr) { return lineMetrics(st, word + sep, px).W + tr * (cps(word) + cps(sep)); }

/* One reference line: pen origin, baseline, total advance and, per word boundary, how much wider or narrower
   the original gap was than ordinary spacing (a column layout, doubled spaces, wide word spacing…). */
function lineRef(st, text, xs, words, oy, px, tr, band) {
  const ref = { oy, x0: xs[0], adv: 0, extras: [], extraMore: 0, inkL: band ? band.x0 : xs[0], inkR: band ? band.x1 : xs[0] };
  if (!words || xs.length < 2) {
    ref.adv = lineMetrics(st, text, px).W + tr * Math.max(0, cps(text) - 1);
    return ref;
  }
  const parts = splitParts(text), ex = [];
  for (let j = 0; j < words.length - 1; j++) ex.push(xs[j + 1] - xs[j] - natStep(st, words[j], parts.seps[j] || ' ', px, tr));
  const tol = Math.max(0.8, 0.02 * px), zero = Math.max(0.6, 0.015 * px);
  const med = ex.slice().sort((p, q) => p - q)[ex.length >> 1];
  if (ex.every(e => Math.abs(e - med) <= tol)) {
    const v = Math.abs(med) <= zero ? 0 : med;
    ref.extras = ex.map(() => v); ref.extraMore = v;
  } else ref.extras = ex.map(e => (Math.abs(e) <= zero ? 0 : Math.abs(e - med) <= tol ? med : e));
  const last = words[words.length - 1];
  ref.adv = xs[xs.length - 1] - xs[0] + lineMetrics(st, last, px).W + tr * (cps(last) - 1);
  return ref;
}
/* a line whose word gaps were all ordinary: it can be set in one piece */
const plainRef = r => !r.extraMore && !r.extras.some(Boolean);

/* Fill ed.fit. With a fitted font every line is placed by its own ink (the fitted line by the fit itself);
   without one, proxyFit() goes by the outline of the old text. */
function computeFit(ed) {
  const st = ed.st, fit = [], bands = ed.bands, an = ed.an;
  if (!bands.length) {
    const r = ed.rect;
    fit.push({ oy: r.h * 0.72, x0: r.w * 0.1, adv: r.w * 0.8, extras: [], extraMore: 0, inkL: r.w * 0.1, inkR: r.w * 0.9 });
  } else if (ed.origLines.length && st.matched) {
    const tr = st.trEm * st.px;
    bands.forEach((b, i) => {
      const text = ed.origLines[Math.min(i, ed.origLines.length - 1)];
      let xs, words = null, oy;
      if (i === ed.primary && st.geo) { xs = st.geo.xs || [st.geo.ox]; words = st.geo.words || null; oy = st.geo.oy; }
      else {
        const m = lineMetrics(st, text, st.px);
        xs = [(b.x0 + b.x1) / 2 - (m.L + m.R + tr * Math.max(0, m.n - 1)) / 2 + m.L];
        oy = (b.y0 + b.y1) / 2 + (m.A - m.D) / 2;
        if (text.trim() && ed.origLines[i] != null) {
          setInk(an.color);
          const wr = wordRuns(an.alpha, an.w, an.h, b, text.trim().split(/\s+/).length - 1);
          const T = makeTarget(an.alpha, an.w, an.h, b, bands, Math.min(1, 150 / (b.y1 - b.y0)), wr && wr.odd ? wr.runs : null);
          const pl = placeLine(st, text, T, st.px, st.trEm);
          if (pl.iou > 0.3) { xs = pl.xs; words = pl.words; oy = pl.oy; }
        }
      }
      fit.push(lineRef(st, text, xs, words, oy, st.px, tr, b));
    });
    if (!st.alignUser) st.align = detectAlign(ed, fit);
  } else proxyFit(ed, fit);
  ed.fit = fit;
}

/* No original text to compare with: size and place the new text from the outline of the old one.
   If the new text fills about the same width at that size, it is treated as the same length and fitted to the old box exactly. */
function proxyFit(ed, fit) {
  const st = ed.st, bands = ed.bands, an = ed.an, b0 = bands[0];
  const lines = ed.newText.split('\n').map(t => t.trim()).filter(Boolean);
  let px = (b0.y1 - b0.y0) / 0.72, trEm = 0;
  if (lines.length) {
    /* Chinese, Japanese or Korean text needs a face that has those glyphs */
    if (scriptOf(lines[0]) !== 'latin' && !st.fam.cjk && !st.famUser) st.fam = FAM.get('sans-serif');
    const im = inkMetrics(st, lines[0]);
    if (im.A + im.D > 0.05) px = (b0.y1 - b0.y0) / (im.A + im.D);
    const natW = im.inkW * px, obsW = b0.x1 - b0.x0;
    if (im.gaps > 0 && obsW / natW > 0.86 && obsW / natW < 1.16) trEm = clamp((obsW - natW) / im.gaps / px, -0.06, 0.16);
    /* stroke thickness of the old text picks the weight */
    if (st.fam.sys && !st.weightUser && st.fam.w.length > 1) {
      const target = stemWidth(an.alpha, an.w, b0.x0, b0.y0, b0.x1, b0.y1);
      if (target > 0) {
        const m = lineMetrics(st, lines[0], px), cw = Math.ceil(m.L + m.R + 8), ch = Math.ceil(m.A + m.D + 8);
        let bw = st.weight, bd = 1e9;
        setInk(an.color);
        for (const w of st.fam.w.slice().sort((p, q) => Math.abs(p - 400) - Math.abs(q - 400))) {
          const cov = textCoverage({ fam: st.fam, weight: w, italic: st.italic }, [{ text: lines[0], ox: 4 + m.L, oy: 4 + m.A }], px, trEm * px, cw, ch, 0);
          const sw = stemWidth(cov, cw, 0, 0, cw, ch);
          const d = sw > 0 ? Math.abs(Math.log(sw / target)) : 9;
          if (d < bd - 1e-6) { bd = d; bw = w; }
        }
        st.weight = bw;
      }
    }
  }
  st.px = px; st.trEm = trEm;
  bands.forEach((b, i) => {
    const t = lines[Math.min(i, lines.length - 1)];
    if (t) { const m = lineMetrics(st, t, px); fit.push({ oy: (b.y0 + b.y1) / 2 + (m.A - m.D) / 2, x0: b.x0 + m.L, adv: b.x1 - b.x0, extras: [], extraMore: 0, inkL: b.x0, inkR: b.x1 }); }
    else fit.push({ oy: b.y1, x0: b.x0, adv: b.x1 - b.x0, extras: [], extraMore: 0, inkL: b.x0, inkR: b.x1 });
  });
}

/* How the old text was aligned: several lines tell by their edges; a single line by its margins inside
   whatever it sits on (a button, a card, the whole picture). Default is flush left, i.e. keep the indent. */
function detectAlign(ed, fit) {
  const st = ed.st;
  if (fit.length >= 2) {
    const tol = Math.max(2, 0.12 * st.px);
    const spread = a => Math.max.apply(null, a) - Math.min.apply(null, a);
    const L = fit.map(f => f.inkL), R = fit.map(f => f.inkR), C = fit.map(f => (f.inkL + f.inkR) / 2);
    /* lines of nearly equal width satisfy several alignments at once: take the tightest, left on a tie */
    const sL = Math.min(spread(L), fit.length >= 3 ? spread(L.slice(1)) : 1e9), sC = spread(C), sR = spread(R);
    const m = Math.min(sL, sC, sR);
    if (m > tol || sL <= m + 0.75) return 'left';
    return sC <= sR ? 'center' : 'right';
  }
  const b = ed.bands[0], r = ed.rect;
  if (!b || !S.ictx) return 'left';
  const had = ed.live;
  if (had) S.ictx.putImageData(had.before, had.x, had.y);
  const xl = r.x + b.x0, xr = r.x + b.x1, ml = [], mr = [];
  for (const f of [0.3, 0.5, 0.7]) {
    const y = clamp(Math.round(r.y + b.y0 + (b.y1 - b.y0) * f), 0, S.ih - 1);
    const row = S.ictx.getImageData(0, y, S.iw, 1).data;
    const walk = (x, dir) => {
      let cur = x + dir * 2, n = 2;
      if (cur < 0 || cur >= S.iw) return Math.max(0, dir < 0 ? x : S.iw - 1 - x);
      let r0 = row[cur * 4], g0 = row[cur * 4 + 1], b0 = row[cur * 4 + 2];
      for (cur += dir; cur >= 0 && cur < S.iw; cur += dir, n++) {
        const p = cur * 4;
        if (Math.abs(row[p] - r0) + Math.abs(row[p + 1] - g0) + Math.abs(row[p + 2] - b0) > 42) break;
        r0 += (row[p] - r0) * 0.1; g0 += (row[p + 1] - g0) * 0.1; b0 += (row[p + 2] - b0) * 0.1;
      }
      return n;
    };
    ml.push(walk(xl - 1, -1)); mr.push(walk(xr, 1));
  }
  if (had) S.ictx.putImageData(had.after, had.x, had.y);
  ml.sort((p, q) => p - q); mr.sort((p, q) => p - q);
  const a = ml[1], c = mr[1], tw = xr - xl, cw = a + tw + c;
  return Math.abs(a - c) <= Math.max(2.5, 0.035 * cw) && Math.min(a, c) >= 0.6 * st.px && tw <= 0.78 * cw ? 'center' : 'left';
}

/* New text, line by line: same pen origin (indent), baseline, size and tracking as the line it replaces;
   the gaps between words reuse what the original had at the same place. Same-length text therefore lands where the old text was.
   → [{ text, ox, oy: pen origin and baseline · m: its metrics · inkR: how far its ink reaches to the right of ox }],
   one entry for every piece that is drawn on its own: a whole line, or a word. */
function layoutNew(ed) {
  const st = ed.st;
  const txt = ed.newText.length ? ed.newText : ed.origText;
  if (!txt.trim()) return [];
  const lines = txt.split('\n'), fit = ed.fit, out = [];
  const px = st.px * st.sizeAdj, tr = (st.trEm + st.trAdj) * px;
  const pitch = fit.length > 1 ? (fit[fit.length - 1].oy - fit[0].oy) / (fit.length - 1) : px * 1.3;
  lines.forEach((text, j) => {
    if (!text.trim()) return;
    const ri = Math.min(j, fit.length - 1), ref = fit[ri], oy = ref.oy + (j - ri) * pitch + st.dy;
    const runs = [];
    let adv;
    if (plainRef(ref)) {
      runs.push({ text, x: 0 });
      adv = lineMetrics(st, text, px).W + tr * Math.max(0, cps(text) - 1);
    } else {
      const parts = splitParts(text);
      let x = parts.lead ? lineMetrics(st, parts.lead, px).W + tr * cps(parts.lead) : 0;
      parts.words.forEach((wd, i) => {
        runs.push({ text: wd, x });
        if (i < parts.words.length - 1) x += natStep(st, wd, parts.seps[i], px, tr) + (i < ref.extras.length ? ref.extras[i] : ref.extraMore) * st.sizeAdj;
      });
      const last = parts.words[parts.words.length - 1];
      adv = x + lineMetrics(st, last, px).W + tr * (cps(last) - 1);
    }
    const shift = st.align === 'center' ? (ref.adv - adv) / 2 : st.align === 'right' ? ref.adv - adv : 0;
    for (const r of runs) {
      const m = lineMetrics(st, r.text || ' ', px);
      out.push({ text: r.text, ox: ref.x0 + r.x + shift + st.dx, oy, m, inkR: m.R + tr * Math.max(0, m.n - 1) });
    }
  });
  return out;
}
