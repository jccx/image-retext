/* full-width and half-width forms look alike to the reader; the font fit tells them apart */
const WIDTH_PAIRS = [['￥', '¥'], ['：', ':'], ['，', ','], ['；', ';'], ['！', '!'], ['？', '?'], ['（', '('], ['）', ')'], ['％', '%']];
function widthVariants(t) {
  let half = t, full = t;
  for (const [f, h] of WIDTH_PAIRS) { half = half.split(f).join(h); if (/[㐀-鿿]/.test(t)) full = full.split(h).join(f); }
  return [...new Set([half, full])].filter(v => v !== t);
}
/* other spellings of a line worth trying against the picture: width forms, and a space at each doubtful gap */
/* characters the reader cannot tell apart by shape alone; the font fit picks among them, position by position */
const ALIKE = [['—', '–', '-', '－', '一'], ['￥', '¥'], ['·', '•', '・']];
function alikeSlots(t) {
  const out = [];
  const zh = /[\u3400-\u9fff]/.test(t);                 // full-width forms and 一 only where the line has Chinese
  Array.from(t).forEach((ch, i) => { const g = ALIKE.find(a => a.includes(ch)); if (g && out.length < 4) { const alts = g.filter(x => x !== ch && (zh || !/[－一￥・]/.test(x))); if (alts.length) out.push({ i, alts }); } });
  return out;
}
function textVariants(t, maybe) {
  const out = widthVariants(t).map(v => ({ t: v, margin: 0.012 }));
  const ins = (str, idxs) => { let o = str; for (const k of idxs.slice().sort((p, q) => q - p)) o = o.slice(0, k) + ' ' + o.slice(k); return o; };
  const pts = [...new Set((maybe || []).filter(k => k > 0 && k < t.length))].slice(0, 4);
  if (Array.from(t).length === t.length) { for (const k of pts) out.push({ t: ins(t, [k]), margin: 0.025 }); if (pts.length > 1) out.push({ t: ins(t, pts), margin: 0.025 }); }
  const seen = new Set([t]);
  return out.filter(v => !seen.has(v.t) && seen.add(v.t));
}
