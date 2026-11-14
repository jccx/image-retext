// PDF edge cases in the installable build: whole-page pictures, scans, protected files, an opening password, form fields and notes.
// Samples: python3 test/pdf/make_samples.py     Run: node test/t_pdf_special.js   (CHROME=/path/to/chrome to use a system browser)
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'test', 'out', 'pdf');
const PORT = 8774, BASE = 'http://localhost:' + PORT + '/';
const quiet = { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', maxBuffer: 1 << 26 };
const sh = (cmd, args) => { try { return execFileSync(cmd, args, quiet); } catch (e) { return String(e.stdout || ''); } };
const pageText = (f, n) => sh('pdftotext', ['-f', String(n), '-l', String(n), '-layout', f, '-']).replace(/\s+/g, ' ').trim();
const info = f => sh('pdfinfo', [f]);
let nOK = 0, nAll = 0;
const check = (name, ok, detail) => { nAll++; if (ok) nOK++; console.log(ok ? 'OK  ' : 'FAIL', name, ok ? '' : '| ' + detail); };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'docs')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  await ctx.route(BASE + '__samples/**', route => { const f = path.join(OUT, decodeURIComponent(new URL(route.request().url()).pathname.replace('/__samples/', ''))); route.fulfill(fs.existsSync(f) ? { status: 200, contentType: 'application/pdf', body: fs.readFileSync(f) } : { status: 404, body: '' }); });
  const p = await ctx.newPage();
  const logs = [];
  let password = null;
  p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  p.on('dialog', d => (password != null ? d.accept(password) : d.dismiss()));
  await p.goto(BASE);
  await p.waitForFunction(() => window.__app && window.__app.S.img, null, { timeout: 20000 });
  const openFile = file => p.evaluate(async url => { const b = await (await fetch(url)).blob(), n = url.split('/').pop(); await window.__app.loadBlob(new File([b], n, { type: 'application/pdf' }), n); return window.__app.S.pdf ? window.__app.S.pdf.n : 0; }, BASE + '__samples/' + file);
  /* select a rectangle given in PDF points from the top-left of the page, wait for the reading and the match, type the new text, apply */
  const edit = (r, repl) => p.evaluate(async ([r, repl]) => {
    const R = window.__app, S = R.S, k = S.pdf.pages.get(S.pdf.cur).vp.scale;
    R.startEdit({ x: r[0] * k, y: r[1] * k, w: r[2] * k, h: r[3] * k }, false);
    const ed = S.edit, t0 = Date.now();
    await new Promise(res => { const iv = setInterval(() => { const st = document.getElementById('matchStatus').textContent; if ((ed.origText && ed.st.matched && ed.cands.length && !/正在/.test(st)) || /请手动|请在上面|没找到明显|请核对/.test(st) || Date.now() - t0 > 90000) { clearInterval(iv); res(); } }, 100); });
    const out = { read: ed.origText, tier: ed.ocr && ed.ocr.tier };
    const el = document.getElementById('inNew'); el.value = repl; el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 150));
    R.commit('text', true);
    return out;
  }, [r, repl]);
  const build = async (flat, name) => {
    const o = await p.evaluate(async flat => { try { const o = await pdfBuild(flat); let s = ''; for (let i = 0; i < o.bytes.length; i += 32768) s += String.fromCharCode.apply(null, o.bytes.subarray(i, i + 32768)); return { b64: btoa(s), report: o.report, text: pdfReportText(o.report) }; } catch (e) { return { err: String(e.message || e) }; } }, flat);
    const f = path.join(OUT, name);
    if (o.b64) fs.writeFileSync(f, Buffer.from(o.b64, 'base64'));
    return Object.assign(o, { file: f });
  };

  // 1. edited pages as pictures: nothing of that page's text is left, the other page is untouched
  await openFile('reportlab.pdf');
  let e = await edit([70, 150, 135, 18], 'Total due: $2,840.21');          // the line "Total due: $1,284.00" (baseline 630 pt from the bottom)
  let o = await build(true, 'out-flat.pdf');
  check('flat: reads the line from the PDF', e.tier === 'pdf' && e.read === 'Total due: $1,284.00', JSON.stringify(e));
  check('flat: page 1 has no text left', !o.err && pageText(o.file, 1) === '', (o.err || pageText(o.file, 1)).slice(0, 80));
  check('flat: page 2 keeps its text', /Late fee 1.5% per month/.test(pageText(o.file, 2)), pageText(o.file, 2).slice(0, 80));
  check('flat: two pages, report says so', /Pages:\s+2/.test(info(o.file)) && o.report && o.report.flat && !o.report.whole, JSON.stringify(o.report));
  // the same edit written the normal way: the rest of page 1 keeps its text
  o = await build(false, 'out-normal.pdf');
  const t1 = pageText(o.file, 1);
  check('normal: old amount gone, neighbours kept', !/1,284\.00/.test(t1) && /INVOICE #2026-1184/.test(t1) && /Ref: AB-0042-XZ/.test(t1) && o.report.checked && !o.report.covered, t1.slice(0, 120) + ' ' + JSON.stringify(o.report));

  // 2. a scan: no text in the file, so the built-in reader reads the picture
  await openFile('scan.pdf');
  e = await edit([70, 150, 135, 18], 'Total due: $2,840.21');
  o = await build(false, 'out-scan.pdf');
  check('scan: read by the built-in reader', e.tier === 'local' && e.read.replace(/\s/g, '') === 'Totaldue:$1,284.00', JSON.stringify(e));
  check('scan: saved, nothing to remove', !o.err && o.report.checked && !o.report.covered && /Pages:\s+1/.test(info(o.file)), JSON.stringify(o.report || o.err));

  // 3. a protected file (no opening password): it cannot be rewritten in place, so every page becomes a picture in a new file
  await openFile('protected.pdf');
  e = await edit([70, 150, 135, 18], 'Total due: $2,840.21');
  o = await build(false, 'out-protected.pdf');
  check('protected: opens and reads', e.tier === 'pdf' && e.read === 'Total due: $1,284.00', JSON.stringify(e));
  check('protected: saved as pictures, both pages, not encrypted', !o.err && o.report.whole && /Pages:\s+2/.test(info(o.file)) && /Encrypted:\s+no/.test(info(o.file)) && pageText(o.file, 1) === '', JSON.stringify(o.report || o.err) + info(o.file).slice(0, 100));

  // 4. an opening password
  password = 'open-sesame';
  const n = await openFile('password.pdf');
  check('password: opens after asking', n === 2, 'pages ' + n);
  password = null;

  // 5. a form field and a note: readers draw these over the page, so an edit under them takes them into the picture
  await openFile('form.pdf');
  e = await edit([133, 89, 110, 18], 'Morgan Blake');                         // inside the text field (value "Jordan Avery")
  const e2 = await edit([70, 136, 320, 24], 'Reference number 90577');        // a line of page text with a note beside it
  o = await build(false, 'out-form.pdf');
  const annots = sh('python3', ['-c', "import pikepdf,sys\npdf=pikepdf.open(sys.argv[1])\nprint(len(pdf.pages[0].get('/Annots', [])))", o.file]).trim();
  check('form: field value read from the picture', /Jordan\s*Avery/.test(e.read), JSON.stringify(e));
  check('form: field and note taken into the page', !o.err && o.report.annots === 2 && annots === '0', JSON.stringify(o.report || o.err) + ' annots left ' + annots);
  check('form: page text replaced', !/48213/.test(pageText(o.file, 1)) && /Application form 2026/.test(pageText(o.file, 1)), pageText(o.file, 1).slice(0, 100) + JSON.stringify(e2));

  console.log('summary', nOK + '/' + nAll);
  if (logs.length) console.log(logs.slice(0, 8).join('\n'));
  await browser.close(); srv.kill();
})();
