// Reading accuracy of the built-in reader alone: lines drawn in many faces → analyse → read → compare.
// usage: node test/t_read.js [latin|cjk|all] [filter] [-v]
const { open } = require('./harness');
const fs = require('fs'), path = require('path');
const FS = path.join(__dirname, '..', 'node_modules/@fontsource');
const which = process.argv[2] || 'all', filt = (process.argv[3] && process.argv[3] !== '-v') ? process.argv[3] : '', verbose = process.argv.includes('-v');
const LAT_TEXTS = ['Weekend Craft Market', 'HANDMADE GOODS', 'Price: $25.00 (incl. tax)', 'Open 10:00-18:00, Mon-Fri', 'Quick brown fox jumps over 13 lazy dogs!', 'Sign up & save 50% today', 'Order #A20261110'];
const CJK_TEXTS = ['周末手作市集', '门票 ¥25', '11月21日—22日 · 10:00–18:00', '欢迎光临，全场八折！', '有效期至2026年12月31日', '订单编号：A20261110', '下载App立享优惠 50% OFF', '北京市朝阳区建国路88号', '数量有限，售完即止', '新品上市 限时特惠'];
const LAT_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Oswald', 'Raleway', 'Nunito', 'Source Sans 3', 'Work Sans', 'DM Sans', 'Rubik', 'Ubuntu', 'PT Sans', 'Fira Sans', 'Barlow', 'Roboto Condensed', 'Bebas Neue', 'Anton', 'Merriweather', 'Playfair Display', 'Lora', 'PT Serif', 'Libre Baskerville', 'EB Garamond', 'Roboto Slab', 'Bitter', 'Arvo', 'Zilla Slab', 'Roboto Mono', 'Source Code Pro', 'Courier Prime', 'Josefin Sans', 'Quicksand', 'Fredoka', 'Comic Neue', 'Abril Fatface', 'Cinzel', 'Pacifico', 'Lobster', 'Caveat', 'Dancing Script'];
const CJK_FONTS = [['sans-serif', 400], ['sans-serif', 700], ['Noto Sans SC', 300], ['Noto Sans SC', 500], ['Noto Sans SC', 900], ['Noto Serif SC', 400], ['Noto Serif SC', 700], ['Noto Serif SC', 900], ['ZCOOL XiaoWei', 400], ['ZCOOL KuaiLe', 400], ['Ma Shan Zheng', 400]];
const cases = [];
if (which !== 'cjk' && which !== 'italic') for (const f of LAT_FONTS) for (const w of [400, 700]) {
  const id = f.toLowerCase().replace(/ /g, '-');
  if (!fs.existsSync(path.join(FS, id, 'files', id + '-latin-' + w + '-normal.woff2'))) continue;
  LAT_TEXTS.forEach((t, i) => cases.push({ fam: f, w, text: t, px: [28, 44, 20][i % 3], set: 'latin' }));
}
if (which === 'italic') for (const f of ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Source Sans 3', 'Merriweather', 'Lora', 'Playfair Display', 'PT Serif', 'Libre Baskerville', 'EB Garamond', 'Roboto Mono', 'Ubuntu', 'Nunito']) for (const w of [400, 700]) {
  const id = f.toLowerCase().replace(/ /g, '-');
  if (!fs.existsSync(path.join(FS, id, 'files', id + '-latin-' + w + '-italic.woff2'))) continue;
  LAT_TEXTS.concat(['Handmade goods, coffee & live music']).forEach((t, i) => cases.push({ fam: f, w, it: true, text: t, px: [28, 44, 20][i % 3], set: 'italic' }));
}
if (which !== 'latin' && which !== 'italic') for (const [f, w] of CJK_FONTS) CJK_TEXTS.forEach((t, i) => cases.push({ fam: f, w, text: t, px: [40, 26, 56][i % 3], set: 'cjk' }));
(async () => {
  const h = await open({ viewport: { width: 900, height: 900 } });
  const p = h.page;
  const sel = cases.filter(c => !filt || (c.fam + ' ' + c.w + ' ' + c.text).includes(filt));
  const t0 = Date.now();
  const out = await p.evaluate(async cs => {
    const t0 = performance.now();
    await ocrLoad();
    const tLoad = performance.now() - t0, res = [];
    let tRead = 0, nGl = 0;
    for (const q of cs) {
      const fam = FAM.get(q.fam);
      if (!fam) { res.push({ err: 'no family' }); continue; }
      const c = { fam, weight: q.w, italic: !!q.it };
      const ok = await loadFaces([c], q.text);
      if (!ok.length) { res.push({ err: 'not loaded' }); continue; }
      const cv = document.createElement('canvas'), px = q.px;
      const x = cv.getContext('2d');
      x.font = fontCss(c, px);
      const tw = x.measureText(q.text).width;
      cv.width = Math.ceil(tw + px * 1.6); cv.height = Math.ceil(px * 2.4);
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#f4efe6'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#22303c'; g.font = fontCss(c, px); g.textBaseline = 'alphabetic';
      g.fillText(q.text, px * 0.8, px * 1.55);
      const an = analyzeRegion(g.getImageData(0, 0, cv.width, cv.height), null);
      const bands = findBands(an.alpha, an.w, an.h, 0);
      const t1 = performance.now();
      const r = ocrReadLines(an, bands);
      tRead += performance.now() - t1; nGl += q.text.replace(/\s/g, '').length;
      res.push({ text: r.text, raw: r.raw, conf: +r.conf.toFixed(3), slots: (r.slots || []).map(s => s.i + ':' + s.alts.join('')).join(' '), nb: bands.length });
    }
    return { res, tLoad: Math.round(tLoad), msPerGlyph: +(tRead / Math.max(1, nGl)).toFixed(2), n: OCR.bank.n };
  }, sel);
  // character error rate by edit distance
  const lev = (a, b) => { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; };
  const by = new Map();
  sel.forEach((c, i) => {
    const r = out.res[i], key = c.set + ' | ' + c.fam + ' ' + c.w;
    const g = by.get(key) || { n: 0, ok: 0, oki: 0, ch: 0, err: 0, erri: 0, empty: 0, bad: [] };
    by.set(key, g);
    g.n++;
    if (r.err) { g.bad.push(r.err); return; }
    const got = r.text || '';
    if (!got) { g.empty++; g.bad.push('∅ (' + r.conf + ') ' + (r.raw || '')); return; }
    const e = lev(Array.from(got), Array.from(c.text));
    g.ch += Array.from(c.text).length; g.err += e; g.erri += lev(Array.from(got.toLowerCase().replace(/ /g, '')), Array.from(c.text.toLowerCase().replace(/ /g, ''))); if (got.toLowerCase() === c.text.toLowerCase()) g.oki++;
    if (got === c.text) g.ok++; else g.bad.push(got + '  ⇐ ' + c.text + ' (' + r.conf + ')' + (r.slots ? ' [' + r.slots + ']' : ''));
  });
  let N = 0, OK = 0, OKI = 0, CH = 0, ER = 0, ERI = 0, EM = 0;
  for (const [k, g] of by) {
    N += g.n; OK += g.ok; OKI += g.oki; CH += g.ch; ER += g.err; ERI += g.erri; EM += g.empty;
    console.log(k.padEnd(34), 'lines ' + g.ok + '/' + g.n, g.empty ? 'declined ' + g.empty : '', g.ch ? 'chars ' + (100 - (100 * g.err) / g.ch).toFixed(1) + '%' + '  (ignoring case and spaces ' + (100 - (100 * g.erri) / g.ch).toFixed(1) + '%)' : '');
    if (verbose) g.bad.forEach(b => console.log('      ' + b));
  }
  console.log('TOTAL lines exact', OK + '/' + N, '(ignoring case ' + OKI + ')', 'chars ignoring case/spaces', CH ? (100 - (100 * ERI) / CH).toFixed(1) + '%' : '-', 'declined', EM, 'char acc (answered)', CH ? (100 - (100 * ER) / CH).toFixed(1) + '%' : '-', '| bank', out.n, 'load', out.tLoad + 'ms', out.msPerGlyph + 'ms/glyph', 'wall', Date.now() - t0, 'ms');
  const bad = h.logs.filter(l => !/400|404|Failed to load/.test(l));
  if (bad.length) console.log('LOGS', bad.slice(0, 5).join('\n').slice(0, 800));
  await h.browser.close();
})();
