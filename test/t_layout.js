// Layout rules: same-length replacements land where the old text was; different lengths keep indent, gaps and line starts.
// Text is laid out by the browser, screenshotted, edited in the app, and the result is measured from pixels.
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const only = process.argv[2];
const gap = w => `<span style="display:inline-block;width:${w}px"></span>`;
const CASES = [
  { id: 'same-cjk', html: `<span id="t" style="font:500 26px 'Noto Sans SC';color:#333">预计明天 14:30 送达</span>`, bg: '#f7f7f7', orig: '预计明天 14:30 送达', to: '预计后天 09:00 送达', check: 'same' },
  { id: 'shorter', html: `<span id="t" style="font:500 22px Roboto;color:#111">Total due: $1,284.00</span>`, bg: '#fff', orig: 'Total due: $1,284.00', to: 'Total due: $84.00', check: 'gaps', sameWords: [0, 1] },
  { id: 'wordspace', html: `<span id="t" style="font:600 22px Inter;color:#1f2937;word-spacing:22px">Item Qty Price</span>`, bg: '#eef2ff', orig: 'Item Qty Price', to: 'Name Num Total', check: 'gaps' },
  { id: 'columns', html: `<span id="t" style="font:500 22px 'Noto Sans SC';color:#222;white-space:nowrap">订单号：${gap(36)}A2048${gap(90)}已发货</span>`, bg: '#fff', orig: '订单号： A2048 已发货', to: '订单号： B3172 已签收', check: 'same' },
  { id: 'columns-longer', html: `<span id="t" style="font:500 22px 'Noto Sans SC';color:#222;white-space:nowrap">数量${gap(40)}3${gap(70)}单价${gap(40)}¥25</span>`, bg: '#fafafa', orig: '数量 3 单价 ¥25', to: '数量 12 单价 ¥250', check: 'gaps' },
  { id: 'tracked', html: `<span id="t" style="font:900 34px 'Noto Serif SC';color:#fffaf0;letter-spacing:14px">周末手作市集</span>`, bg: '#0e4a5a', orig: '周末手作市集', to: '新春年货大集', check: 'same' },
  { id: 'centered', html: `<div style="text-align:center;width:460px;font:700 26px Montserrat;color:#111;line-height:1.3"><span id="t">Grand Opening<br>Saturday 10 AM</span></div>`, bg: '#ffe9a8', orig: 'Grand Opening\nSaturday 10 AM', to: 'Now Open\nEvery day until late', check: 'centers' },
  { id: 'indent', html: `<div style="width:330px;font:400 20px/1.6 'Noto Sans SC';color:#222;text-indent:2em"><span id="t">春天的风吹过山岗，田野里的油菜花开得正好，远处传来几声清脆的鸟鸣。</span></div>`, bg: '#fff', lines: true, to: ['夏夜的雨落在屋檐，池塘', '里的荷叶上滚着水珠，蛙声一片', '接着一片。'], check: 'starts' },
  { id: 'button', html: `<span id="btn" style="display:inline-block;padding:12px 44px;background:#15803d;border-radius:8px"><span id="t" style="font:600 18px 'Open Sans';color:#fff">Add to cart</span></span>`, bg: '#f3f4f6', orig: 'Add to cart', to: 'Buy now', check: 'button' },
  { id: 'no-original', html: `<span id="t" style="font:900 40px 'Noto Sans SC';color:#facc15">年终大促</span>`, bg: '#111827', orig: null, to: '新春特惠', check: 'box' }
];
(async () => {
  const ROW = 130;
  const h = await open({ viewport: { width: 900, height: 1500 }, dsf: 1 });
  const sp = await h.ctx.newPage();
  const fams = ['Noto+Sans+SC:wght@400;500;900', 'Noto+Serif+SC:wght@900', 'Roboto:wght@500', 'Inter:wght@600', 'Montserrat:wght@700', 'Open+Sans:wght@600'];
  const links = fams.map(f => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${f}">`).join('');
  const blocks = CASES.map((c, i) => `<div data-row="${c.id}" style="position:absolute;left:20px;top:${10 + i * ROW}px;width:860px;height:${ROW - 8}px;background:${c.bg};display:flex;align-items:center;padding-left:40px;box-sizing:border-box">${c.html.replace(/id="t"/, `id="${c.id}"`).replace(/id="btn"/, `id="${c.id}-btn"`)}</div>`).join('');
  await sp.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8">${links}<style>body{margin:0;background:#d9dde3}</style></head><body>${blocks}</body></html>`);
  await sp.evaluate(() => document.fonts.ready);
  await sp.waitForTimeout(500);
  const info = await sp.evaluate(ids => Object.fromEntries(ids.map(id => {
    const el = document.getElementById(id), r = el.getBoundingClientRect(), btn = document.getElementById(id + '-btn');
    // displayed lines (for wrapped text)
    const lines = []; let lastTop = null;
    const tn = el.firstChild && el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.firstChild : null;
    if (tn) { const rg = document.createRange(); for (let i = 0; i < tn.length; i++) { rg.setStart(tn, i); rg.setEnd(tn, i + 1); const cr = rg.getClientRects()[0]; if (!cr) continue; if (lastTop === null || Math.abs(cr.top - lastTop) > 4) { lines.push(''); lastTop = cr.top; } lines[lines.length - 1] += tn.data[i]; } }
    const b = btn && btn.getBoundingClientRect();
    return [id, { x: r.x, y: r.y, w: r.width, h: r.height, lines, btn: b && { x: b.x, w: b.width } }];
  })), CASES.map(c => c.id));
  const shot = await sp.screenshot({ type: 'png', fullPage: true });
  await sp.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const app = h.page;
  await app.evaluate(async b64 => {
    const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
    await window.__retext.loadBlob(blob, 'shot');
    const S = window.__retext.S; const k = document.createElement('canvas'); k.width = S.iw; k.height = S.ih; k.getContext('2d').drawImage(S.img, 0, 0); window.__orig = k;
    // ink measurement straight from pixels: lines (rows) and blobs (columns separated by >= g empty columns)
    window.__measure = (canvas, rect, g) => {
      const d = canvas.getContext('2d').getImageData(rect.x, rect.y, rect.w, rect.h), an = analyzeRegion(d, { grow: 2 });
      const bands = findBands(an.alpha, an.w, an.h, 0);
      return bands.map(b => {
        const cols = [];
        for (let x = b.x0; x < b.x1; x++) { let s = 0; for (let y = b.y0; y < b.y1; y++) { const a = an.alpha[y * an.w + x]; if (a >= 0.12) s += a; } cols.push(s >= 0.4 ? 1 : 0); }
        const blobs = []; let st = null, lastInk = -1;
        for (let i = 0; i < cols.length; i++) { if (cols[i]) { if (st === null) st = i; else if (i - lastInk > g) { blobs.push([rect.x + b.x0 + st, rect.x + b.x0 + lastInk + 1]); st = i; } lastInk = i; } }
        if (st !== null) blobs.push([rect.x + b.x0 + st, rect.x + b.x0 + lastInk + 1]);
        return { x0: rect.x + b.x0, x1: rect.x + b.x1, y0: rect.y + b.y0, y1: rect.y + b.y1, blobs };
      });
    };
  }, shot.toString('base64'));
  const results = [];
  for (const c of CASES) {
    if (only && !c.id.includes(only)) continue;
    const r = info[c.id];
    const orig = c.lines ? r.lines.join('\n') : c.orig;
    const to = Array.isArray(c.to) ? c.to.join('\n') : c.to;
    const box = { x: r.x - 6, y: r.y - 3, w: r.w + 12, h: r.h + 6 };
    const row = { x: 24, y: Math.round(r.y - (ROW - 8 - r.h) / 2) + 4, w: 852, h: ROW - 16 };
    let out;
    try {
      out = await app.evaluate(async ({ c, box, row, orig, to, btn }) => {
        const R = window.__retext, S = R.S;
        const g = c.check === 'same' || c.check === 'gaps' ? 7 : 400;
        const mrect = btn ? { x: Math.round(btn.x + 4), y: row.y + 30, w: Math.round(btn.w - 8), h: row.h - 60 } : row;
        const m0 = window.__measure(window.__orig, mrect, g);
        R.startEdit(box, false);
        const ed = S.edit;
        if (orig != null) {
          R.setOrig(orig, true);
          await new Promise((res, rej) => { const t = Date.now(); const iv = setInterval(() => { if (ed.st.matched && ed.cands.length && !/正在/.test(document.getElementById('matchStatus').textContent)) { clearInterval(iv); res(); } else if (Date.now() - t > 90000) { clearInterval(iv); rej(new Error('timeout ' + document.getElementById('matchStatus').textContent)); } }, 50); });
        }
        const el = document.getElementById('inNew'); el.value = to; el.dispatchEvent(new Event('input', { bubbles: true }));
        const st = ed.st;
        const meta = { fam: st.fam.n, w: st.weight, px: +st.px.toFixed(2), tr: +(st.trEm * 1000).toFixed(0), iou: st.score == null ? null : +(st.score * 100).toFixed(1), align: st.align, extras: ed.fit.map(f => f.extras.map(e => +e.toFixed(1))) };
        R.commit('text', true);
        const m1 = window.__measure(S.img, mrect, g);
        return { m0, m1, meta };
      }, { c, box, row, orig, to, btn: c.check === 'button' ? r.btn : null });
    } catch (e) { console.log('ERR', c.id, e.message.split('\n')[0]); results.push('ERR'); continue; }
    const { m0, m1, meta } = out;
    let ok = true; const notes = [];
    const near = (a, b, tol, label) => { const d = Math.abs(a - b); if (d > tol) ok = false; notes.push(label + ' ' + (a - b >= 0 ? '+' : '') + (a - b).toFixed(1)); };
    if (m0.length !== m1.length && c.check !== 'starts') { ok = false; notes.push(`lines ${m0.length}→${m1.length}`); }
    else if (c.check === 'same') {
      // every word blob starts and ends where the old one did
      m0.forEach((l, i) => {
        near(m1[i].y0, l.y0, 1, 'top'); near(m1[i].y1, l.y1, 1, 'bottom');
        if (l.blobs.length !== m1[i].blobs.length) { ok = false; notes.push(`blobs ${l.blobs.length}→${m1[i].blobs.length}`); return; }
        // glyphs differ in their side bearings (A vs B), so the ink edges may move a pixel or two while the pen position is identical
        l.blobs.forEach((b, j) => { near(m1[i].blobs[j][0], b[0], 2.5, 'w' + j + 'start'); near(m1[i].blobs[j][1], b[1], 2.5, 'w' + j + 'end'); });
      });
    } else if (c.check === 'gaps') {
      // same indent, same gap between consecutive words, same line height
      const a = m0[0], b = m1[0];
      near(b.y0, a.y0, 1.5, 'top'); near(b.blobs[0][0], a.blobs[0][0], 1.5, 'indent');
      if (a.blobs.length !== b.blobs.length) { ok = false; notes.push(`blobs ${a.blobs.length}→${b.blobs.length}`); }
      else for (let j = 0; j + 1 < a.blobs.length; j++) near(b.blobs[j + 1][0] - b.blobs[j][1], a.blobs[j + 1][0] - a.blobs[j][1], 2.5, 'gap' + j);
      for (const j of c.sameWords || []) near(b.blobs[j][0], a.blobs[j][0], 1.5, 'w' + j + 'start');
    } else if (c.check === 'centers') {
      // tops differ with the letters (an ascender is taller than a capital); the baseline is what is kept
      m0.forEach((l, i) => { near((m1[i].x0 + m1[i].x1) / 2, (l.x0 + l.x1) / 2, 2, 'centre' + i); near(m1[i].y0, l.y0, 3, 'top' + i); });
    } else if (c.check === 'starts') {
      m0.forEach((l, i) => { if (!m1[i]) { ok = false; notes.push('missing line ' + i); return; } near(m1[i].x0, l.x0, 1.5, 'start' + i); near(m1[i].y0, l.y0, 1.5, 'top' + i); });
    } else if (c.check === 'button') {
      const bc = r.btn.x + r.btn.w / 2;
      near((m0[0].x0 + m0[0].x1) / 2, bc, 1.5, 'oldCentre'); near((m1[0].x0 + m1[0].x1) / 2, bc, 1.5, 'newCentre');
    } else if (c.check === 'box') {
      const a = m0[0], b = m1[0];
      near(b.x0, a.x0, 2, 'left'); near(b.x1, a.x1, 3, 'right'); near(b.y0, a.y0, 2.5, 'top'); near(b.y1, a.y1, 2.5, 'bottom');
    }
    results.push(ok ? 'OK' : 'FAIL');
    console.log((ok ? 'OK  ' : 'FAIL'), c.id.padEnd(15), JSON.stringify(meta), '|', notes.join(' '));
  }
  // before/after sheet
  const sheet = await app.evaluate(({ n, ROW }) => {
    const S = window.__retext.S, O = window.__orig, W = 560;
    const c = document.createElement('canvas'); c.width = W * 2 + 6; c.height = n * ROW;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(O, 20, 10, W, n * ROW, 0, 0, W, n * ROW); x.drawImage(S.img, 20, 10, W, n * ROW, W + 6, 0, W, n * ROW);
    return c.toDataURL('image/png').split(',')[1];
  }, { n: CASES.length, ROW });
  fs.writeFileSync(path.join(__dirname, 'out', 'sheet-layout.png'), Buffer.from(sheet, 'base64'));
  console.log('summary', results.join(' '));
  const bad = h.logs.filter(l => !/400|Failed to load/.test(l));
  if (bad.length) console.log('LOGS\n' + bad.slice(0, 8).join('\n'));
  await h.browser.close();
})();
