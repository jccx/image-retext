// PDF editing end to end in the installable build: open → select a phrase → the original text comes from the PDF itself →
// font match → replace → save. The saved PDF is then checked with poppler (independent of pdf.js):
//   the old phrase is gone from the text, every other word is where it was, pixels outside the edits are unchanged.
// Samples: python3 test/pdf/make_samples.py && node test/pdf/make_chrome.js
//   node test/t_pdf.js [filter]        (CHROME=/path/to/chrome to use a system browser)
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'test', 'out', 'pdf');
const PORT = 8771, BASE = 'http://localhost:' + PORT + '/';
// [file, page, phrase to select, replacement, which font should draw the replacement: the PDF's own (it has every character) or a library font]
const CASES = [
  ['reportlab.pdf', 1, 'INVOICE #2026-1184', 'INVOICE #2018-4602', 'own'],
  ['reportlab.pdf', 1, 'November 12, 2026', 'January 5, 2027', 'own'],
  ['reportlab.pdf', 1, '$1,284.00', '$2,840.21', 'own'],
  ['reportlab.pdf', 1, 'AB-0042-XZ', 'CD-7715-QK', 'own'],
  ['reportlab.pdf', 1, '人民币 1,284.00 元', '人民币 2,950.75 元', 'weak'],   // a Chinese font the file does not carry: every reader shows its own stand-in
  ['reportlab.pdf', 1, 'Pay by December 1', 'Pay by January 15', 'own'],
  ['reportlab.pdf', 2, 'Late fee 1.5% per month', 'Late fee 5% per month', 'own'],
  ['latex.pdf', 1, 'Quarterly Report 2026', 'Quarterly Report 2020', 'own'],
  ['latex.pdf', 1, '14.2 percent', '21.4 percent', 'own'],
  ['latex.pdf', 1, 'A. V. Taylor', 'M. J. Rivera', 'weak'],                 // Computer Modern is not in the library and the file lacks M, J, i: only a rough stand-in
  ['latex.pdf', 1, '1,250.00', '2,105.50', 'own'],
  ['libreoffice.pdf', 1, 'March 18, 2027', 'March 27, 2028', 'own'],
  ['libreoffice.pdf', 1, 'Room 204, Community Hall', 'Room 310, Town Library', 'lib'],
  ['libreoffice.pdf', 1, '2027 年 3 月 18 日', '2028 年 8 月 12 日', 'own'],
  ['libreoffice.pdf', 1, '社区活动中心二楼', '市图书馆三楼', 'lib'],
  ['chrome.pdf', 1, 'SPRING CATALOG 2027', 'AUTUMN CATALOG 2027', 'lib'],
  ['chrome.pdf', 1, 'April 30', 'April 03', 'own'],
  ['chrome.pdf', 1, 'Members save 20% today', 'Members save 35% today', 'lib'],
  ['chrome.pdf', 1, '$62.50', '$65.20', 'own'],
  ['chrome.pdf', 1, '全场满300元包邮', '全场满500元包邮', 'lib'],
  ['chrome.pdf', 1, 'SKU 4471-AX', 'SKU 7144-XA', 'own'],
  ['chrome.pdf', 2, '30 days.', '14 days.', 'own'],
  ['mpl_type42.pdf', 1, 'Monthly Sales 2026', 'Monthly Sales 2022', 'own'],
  ['mpl_type3.pdf', 1, 'Peak: 7 units', 'Peak: 9 units', 'lib'],
  ['rawops.pdf', 1, 'Line four by quote', 'Line 4 changed', 'own'],
  ['rawops.pdf', 1, 'second part,', 'dispart,', 'own'],
  ['rawops.pdf', 2, '5,600 units', '6,005 units', 'own']
];
const filt = process.argv[2] || '';
const quiet = { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', maxBuffer: 1 << 26 };
const text = f => execFileSync('pdftotext', ['-layout', f, '-'], quiet);
const words = (f, pg) => {
  const out = []; let n = 0;
  for (const line of execFileSync('pdftotext', ['-bbox', f, '-'], quiet).split('\n')) {
    if (/<page /.test(line)) n++;
    const m = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)<\/word>/.exec(line);
    if (m && n === pg) out.push({ k: m[5] + '@' + (+m[1]).toFixed(1) + ',' + (+m[2]).toFixed(1), t: m[5], x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] });
  }
  return out;
};
const gray = (f, pg, dpi) => {
  const base = path.join(OUT, '_cmp');
  execFileSync('pdftoppm', ['-cropbox', '-r', String(dpi), '-gray', '-f', String(pg), '-l', String(pg), '-singlefile', f, base], { stdio: 'ignore' });
  const b = fs.readFileSync(base + '.pgm'); let pos = 0;
  const tok = () => { while (b[pos] <= 32) pos++; const s = pos; while (b[pos] > 32) pos++; return b.toString('latin1', s, pos); };
  tok(); const w = +tok(), h = +tok(); tok(); pos++;
  return { w, h, d: b.subarray(pos, pos + w * h) };
};
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'docs')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  /* a phone-like screen: text is then placed at fractions of a pixel, as on iOS and macOS */
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  await ctx.route(BASE + '__samples/**', route => { const f = path.join(OUT, decodeURIComponent(new URL(route.request().url()).pathname.replace('/__samples/', ''))); route.fulfill(fs.existsSync(f) ? { status: 200, contentType: 'application/pdf', body: fs.readFileSync(f) } : { status: 404, body: '' }); });
  const p = await ctx.newPage();
  const logs = [];
  p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.__app && window.__app.S.img, null, { timeout: 20000 });
  const files = [...new Set(CASES.map(c => c[0]))];
  let nOK = 0, nAll = 0;
  for (const file of files) {
    const cases = CASES.filter(c => c[0] === file && (!filt || (c[0] + ' ' + c[2]).includes(filt)));
    if (!cases.length) continue;
    const src = path.join(OUT, file);
    if (!fs.existsSync(src)) { console.log('missing sample', file); continue; }
    await p.evaluate(async url => { const b = await (await fetch(url)).blob(); await window.__app.loadBlob(new File([b], url.split('/').pop(), { type: 'application/pdf' }), url.split('/').pop()); }, BASE + '__samples/' + file);
    const res = [];
    for (const [, pno, phrase, repl] of cases) {
      const r = await p.evaluate(async ([pno, phrase, repl]) => {
        const R = window.__app, S = R.S;
        if (S.pdf.cur !== pno) await pdfGo(pno);
        const pg = S.pdf.pages.get(pno), flat = [];
        for (const s of pg.map.shows) for (const g of s.g) if (String(g.u || '').trim()) flat.push(g);
        const want = phrase.replace(/\s/g, ''), all = flat.map(g => g.u).join(''), at = all.indexOf(want);
        if (at < 0) return { err: 'phrase not in the PDF text' };
        let ci = 0, i0 = -1, i1 = -1;
        flat.forEach((g, i) => { if (ci <= at && at < ci + g.u.length) i0 = i; if (ci < at + want.length && at + want.length <= ci + g.u.length) i1 = i; ci += g.u.length; });
        const sel = flat.slice(i0, i1 + 1), xs = sel.flatMap(g => [g.a[0], g.b[0]]), ys = sel.flatMap(g => [g.t[1], g.d[1]]);
        const h = Math.max(...ys) - Math.min(...ys);
        const rect = { x: Math.min(...xs) - 0.05 * h, y: Math.min(...ys) - 0.02 * h, w: Math.max(...xs) - Math.min(...xs) + 0.1 * h, h: h * 1.04 };
        R.startEdit(rect, false);
        const ed = S.edit, t0 = Date.now();
        await new Promise(res => { const iv = setInterval(() => { const st = document.getElementById('matchStatus').textContent; if ((ed.origText && ed.st.matched && ed.cands.length && !/正在/.test(st)) || /请手动|请在上面|没找到明显/.test(st) || Date.now() - t0 > 90000) { clearInterval(iv); res(); } }, 100); });
        const out = { read: ed.origText, tier: ed.ocr && ed.ocr.tier, fam: ed.st.fam.n, weight: ed.st.weight, italic: ed.st.italic, iou: ed.st.score && +(ed.st.score * 100).toFixed(1), hint: ed.pdfHint && ed.pdfHint.label, ms: Date.now() - t0, rect, scale: pg.vp.scale };
        const el = document.getElementById('inNew'); el.value = repl; el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        out.used = (ed.st.fam.label || ed.st.fam.n) + ' ' + ed.st.weight; out.own = !!ed.st.fam.pdf; out.fit = ed.st.score && +(ed.st.score * 100).toFixed(1);
        out.status = document.getElementById('matchStatus').textContent;
        R.commit('text', true);
        return out;
      }, [pno, phrase, repl]);
      res.push(r);
    }
    // save
    const saved = await p.evaluate(async () => { const o = await pdfBuild(false); let s = ''; for (let i = 0; i < o.bytes.length; i += 32768) s += String.fromCharCode.apply(null, o.bytes.subarray(i, i + 32768)); return { b64: btoa(s), report: o.report, text: pdfReportText(o.report) }; });
    const outFile = path.join(OUT, 'out-' + file);
    fs.writeFileSync(outFile, Buffer.from(saved.b64, 'base64'));
    const tAfter = text(outFile).replace(/\s+/g, ' ');
    const byPage = new Map();
    cases.forEach((c, i) => { if (!byPage.has(c[1])) byPage.set(c[1], []); byPage.get(c[1]).push(res[i]); });
    const pageNote = new Map();
    for (const [pno, rs] of byPage) {
      // words outside every edit keep their place; pixels outside every edit are unchanged
      const A = new Set(words(outFile, pno).map(w => w.k)), lost = words(src, pno).filter(w => !A.has(w.k));
      const phr = cases.filter(c => c[1] === pno).map(c => c[2]).join(' ');
      /* a word that an edit cuts into is expected to change; on rotated pages poppler's boxes use another frame, so go by the word there */
      const touched = w => rs.some(r => r.rect && w.x1 > r.rect.x / r.scale - 1 && w.x0 < (r.rect.x + r.rect.w) / r.scale + 1 && w.y1 > r.rect.y / r.scale && w.y0 < (r.rect.y + r.rect.h) / r.scale);
      const moved = lost.filter(w => !touched(w) && !phr.includes(w.t)).map(w => w.t);
      const a = gray(src, pno, 72), b = gray(outFile, pno, 72);
      let diff = 0, ink = 0;
      if (a.w === b.w && a.h === b.h) {
        for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
          const inside = rs.some(r => r.rect && x >= r.rect.x / r.scale - 2 && x <= (r.rect.x + r.rect.w) / r.scale + 2 + 60 && y >= r.rect.y / r.scale - 3 && y <= (r.rect.y + r.rect.h) / r.scale + 3);
          const d = Math.abs(a.d[y * a.w + x] - b.d[y * a.w + x]);
          if (inside) { if (d > 40) ink++; } else if (d > 24) diff++;
        }
      } else diff = -1;
      pageNote.set(pno, (moved.length ? ' words moved: ' + moved.slice(0, 5).join(',') : '') + (diff ? ' pixels changed outside edits: ' + diff : '') + (ink < 20 ? ' nothing changed inside edits' : ''));
    }
    cases.forEach((c, i) => {
      const r = res[i], [, pno, phrase, repl] = c;
      nAll++;
      let msg = '';
      if (r.err) msg = ' ' + r.err;
      else {
        if (r.read !== phrase) msg += ' read=' + JSON.stringify(r.read);
        if (r.tier !== 'pdf') msg += ' tier=' + r.tier;
        // the old phrase must be gone from the saved file's text (unless the page keeps another copy of the same words)
        const gone = !tAfter.includes(phrase);
        if (!gone) msg += ' old text still in file';
        if (r.fit < 80 && c[4] !== 'weak') msg += ' weak match';
        if (c[4] === 'own' && !r.own) msg += ' expected the PDF\'s own font';
        if (c[4] === 'lib' && r.own) msg += ' expected a library font';
        msg += pageNote.get(pno) || '';
      }
      const rot = file === 'rawops.pdf' && pno === 2;
      const ok = !msg || (rot && !/still in file|read=/.test(msg));
      if (ok) nOK++;
      console.log(ok ? 'OK  ' : 'FAIL', file.padEnd(16), 'p' + pno, JSON.stringify(phrase).padEnd(28), r.err ? '' : r.used.padEnd(34) + String(r.fit).padStart(5) + '%  ' + String(r.ms).padStart(5) + 'ms', msg, r.own ? '' : '| ' + r.status.slice(0, 60));
    });
    console.log('     saved', path.basename(outFile), (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB (was ' + (fs.statSync(src).size / 1024).toFixed(0) + ' KB)', JSON.stringify(saved.report));
  }
  console.log('summary', nOK + '/' + nAll);
  if (logs.length) console.log(logs.slice(0, 8).join('\n'));
  await browser.close(); srv.kill();
})();
