// Accuracy test: draw text with a known font/weight/colour, let the app match it, replace it with the same text,
// and measure how close the result is to the original picture.
const { open, waitMatch } = require('./harness');

const CASES = [
  { fam: 'Montserrat', w: 700, px: 64, text: 'Summer Sale 2026', color: '#1d3557', bg: '#f1faee' },
  { fam: 'Roboto', w: 400, px: 28, text: 'Order total: $148.50', color: '#222222', bg: '#ffffff' },
  { fam: 'Playfair Display', w: 700, px: 72, text: 'Grand Opening', color: '#ffffff', bg: '#7b2d26', italic: true },
  { fam: 'Oswald', w: 500, px: 54, text: 'WEEKEND MARKET', color: '#f4d58d', bg: 'grad', track: 5 },
  { fam: 'Lora', w: 400, px: 36, text: 'The quick brown fox', color: '#3a3a3a', bg: '#fbf5e6' },
  { fam: 'Roboto Mono', w: 500, px: 30, text: 'ID 4829-XK-77', color: '#00ff9c', bg: '#101418' },
  { fam: 'Pacifico', w: 400, px: 60, text: 'Thank you!', color: '#e63946', bg: '#fff8f0' },
  { fam: 'Inter', w: 600, px: 18, text: 'Sign in to continue', color: '#ffffff', bg: '#2563eb' },
  { fam: 'Open Sans', w: 300, px: 44, text: 'Light headline', color: '#444444', bg: 'noise' },
  { fam: 'Bebas Neue', w: 400, px: 90, text: '50% OFF', color: '#111111', bg: '#ffd60a' },
  { fam: 'Merriweather', w: 900, px: 40, text: 'Breaking News', color: '#0b132b', bg: '#e0e1dd' },
  { fam: 'Noto Sans SC', w: 700, px: 56, text: '全场五折优惠', color: '#ffffff', bg: '#d62828' },
  { fam: 'Noto Serif SC', w: 500, px: 48, text: '周末手作市集', color: '#1b263b', bg: '#f0ead2' },
  { fam: 'Ma Shan Zheng', w: 400, px: 70, text: '春风十里', color: '#2b2d42', bg: '#edf2f4' },
  { fam: 'Poppins', w: 500, px: 14, text: 'Updated 3 minutes ago', color: '#6b7280', bg: '#ffffff' },
  { fam: 'Source Sans 3', w: 400, px: 22, text: 'Line one of the note\nSecond line here', color: '#1f2937', bg: '#fefce8' }
];

(async () => {
  const only = process.argv[2];
  const { browser, page, logs, stats } = await open();
  const rows = [];
  for (const cs of CASES) {
    if (only && !cs.fam.toLowerCase().includes(only.toLowerCase())) continue;
    const t0 = Date.now();
    let r;
    try {
      r = await page.evaluate(async cs => {
        const R = window.__app, S = R.S;
        const fam = R.FAM.get(cs.fam);
        await ensureCss([fam]);
        await ensureFace({ fam, weight: cs.w, italic: !!cs.italic }, cs.text);
        const W = 1000, H = 420;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d', { willReadFrequently: true });
        if (cs.bg === 'grad') { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0e4a5a'); g.addColorStop(1, '#3a1c71'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
        else if (cs.bg === 'noise') {
          const id = x.createImageData(W, H); let s = 7;
          for (let i = 0; i < W * H; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const n = ((s >> 8) % 25) - 12; const v = 228 + n + Math.round(10 * Math.sin(i % W / 90)); id.data[i * 4] = v; id.data[i * 4 + 1] = v - 4; id.data[i * 4 + 2] = v - 10; id.data[i * 4 + 3] = 255; }
          x.putImageData(id, 0, 0);
        } else { x.fillStyle = cs.bg; x.fillRect(0, 0, W, H); }
        x.fillStyle = cs.color; x.textBaseline = 'alphabetic';
        x.font = (cs.italic ? 'italic ' : '') + cs.w + ' ' + cs.px + 'px "' + cs.fam + '"';
        const lines = cs.text.split('\n');
        const ox = 120.4, oy = 200.3, lh = cs.px * 1.35;
        let maxW = 0;
        lines.forEach((t, i) => { drawRun(x, t, ox, oy + i * lh, cs.track || 0, false); maxW = Math.max(maxW, x.measureText(t).width + (cs.track || 0) * (t.length - 1)); });
        const orig = x.getImageData(0, 0, W, H);
        R.setImage(c, x, 'case', 'image/png', false);
        const box = { x: ox - cs.px * 0.35, y: oy - cs.px * 1.25, w: maxW + cs.px * 0.7, h: cs.px * 1.7 + (lines.length - 1) * lh };
        R.startEdit(box, false);
        R.setOrig(cs.text, true);
        const ed = S.edit;
        await new Promise((res, rej) => {
          const t = Date.now();
          const iv = setInterval(() => {
            if (ed.st.matched && ed.cands.length && !/正在/.test(document.getElementById('matchStatus').textContent)) { clearInterval(iv); res(); }
            else if (Date.now() - t > 90000) { clearInterval(iv); rej(new Error('match timeout: ' + document.getElementById('matchStatus').textContent)); }
          }, 50);
        });
        const st = ed.st;
        const out = { fam: st.fam.n, w: st.weight, italic: st.italic, px: st.px, trEm: st.trEm, blur: st.blur, color: st.color.map(Math.round), iou: st.score,
          cands: ed.cands.slice(0, 4).map(r => r.fam.n + ' ' + r.weight + (r.italic ? 'i' : '') + ' ' + (r.iou * 100).toFixed(1)), bands: ed.bands.length, grain: ed.an.grain };
        // replace with the same text and compare with the untouched picture
        const rect = { ...ed.rect };
        R.commit('text', true);
        const now = x.getImageData(0, 0, W, H);
        let sum = 0, mx = 0, n = 0;
        for (let y = rect.y; y < rect.y + rect.h; y++) for (let xx = rect.x; xx < rect.x + rect.w; xx++) {
          const p = (y * W + xx) * 4;
          const d = (Math.abs(now.data[p] - orig.data[p]) + Math.abs(now.data[p + 1] - orig.data[p + 1]) + Math.abs(now.data[p + 2] - orig.data[p + 2])) / 3;
          sum += d; n++; if (d > mx) mx = d;
        }
        out.mae = sum / n; out.maxd = mx;
        return out;
      }, cs);
    } catch (e) { r = { err: String(e.message).split('\n')[0] }; }
    const ms = Date.now() - t0;
    const ok = r.err ? 'ERR' : (r.fam === cs.fam ? (r.w === cs.w ? 'OK ' : 'wgt') : 'FAM');
    rows.push(ok);
    if (r.tm && process.env.TM) console.log('   timing', JSON.stringify(Object.fromEntries(Object.entries(r.tm).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]))));
    if (r.err) console.log(ok, cs.fam, r.err);
    else console.log(ok, (cs.fam + ' ' + cs.w + (cs.italic ? 'i' : '') + ' ' + cs.px + 'px').padEnd(30), '→', (r.fam + ' ' + r.w + (r.italic ? 'i' : '')).padEnd(24),
      'px', r.px.toFixed(1).padStart(5), 'tr', (r.trEm * 1000).toFixed(0).padStart(4), 'blur', r.blur, 'col', r.color.join(','), 'iou', (r.iou * 100).toFixed(1), 'mae', r.mae.toFixed(2), 'max', r.maxd.toFixed(0), 'bands', r.bands, ms + 'ms', '|', r.cands.join(' ; '));
  }
  console.log('summary', rows.join(' '), JSON.stringify(stats));
  if (logs.length) console.log('LOGS\n' + logs.slice(0, 15).join('\n'));
  await browser.close();
})();
