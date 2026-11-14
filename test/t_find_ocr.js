// Text in pictures: the one-time reading that makes it findable, in the installable build.
//   a PDF of text only offers no reading; a scan, a PDF with a picture in it and a plain picture do;
//   after the reading, text in the pictures is found, selected and can be replaced like any other.
//   python3 test/pdf/make_samples.py && node test/t_find_ocr.js     (CHROME=/path/to/chrome to use a system browser)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'test', 'out', 'pdf');
const PORT = 8774, BASE = 'http://localhost:' + PORT + '/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'docs')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(BASE + '__samples/**', route => { const f = path.join(OUT, decodeURIComponent(new URL(route.request().url()).pathname.replace('/__samples/', ''))); route.fulfill(fs.existsSync(f) ? { status: 200, contentType: /png$/.test(f) ? 'image/png' : 'application/pdf', body: fs.readFileSync(f) } : { status: 404, body: '' }); });
  const p = await ctx.newPage();
  const logs = [];
  p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.__app && window.__app.S.img, null, { timeout: 20000 });
  const fails = [];
  const check = (ok, what) => { console.log(ok ? 'OK  ' : 'FAIL', what); if (!ok) fails.push(what); };
  const open = async file => {
    await p.evaluate(async ([url, name, type]) => { const b = await (await fetch(url)).blob(); await window.__app.loadBlob(new File([b], name, { type }), name); }, [BASE + '__samples/' + file, file, /png$/.test(file) ? 'image/png' : 'application/pdf']);
    await p.waitForTimeout(1500);       // the other pages are looked through in the background
  };
  const ui = () => p.evaluate(() => ({ box: !document.getElementById('findBox').hidden, ocr: !document.getElementById('ocrRow').hidden, note: document.getElementById('ocrNote').textContent, dis: document.getElementById('findIn').disabled }));
  const find = async q => { await p.evaluate(q => findAll(q), q); await p.waitForFunction(() => { const F = findCtx().find; return !F || F.done; }, null, { timeout: 60000 }); return p.evaluate(() => { const F = findCtx().find; return { n: F.hits.length, ocr: F.hits.filter(h => h.ocr).length, pages: F.hits.map(h => h.no).join(''), info: document.getElementById('findInfo').textContent }; }); };
  const read = async () => { const t0 = Date.now(); await p.click('#ocrGo'); await p.waitForFunction(() => findCtx().ocr.state === 'done', null, { timeout: 300000, polling: 300 }); return { ms: Date.now() - t0, lines: await p.evaluate(() => [...findCtx().ocr.lines.values()].reduce((a, l) => a + l.length, 0)) }; };
  const step = async () => { await p.click('#findNext'); await p.waitForFunction(() => { const ed = window.__app.S.edit, st = document.getElementById('matchStatus').textContent; return ed && (ed.origText || /请手动|请在上面|没找到明显|核对/.test(st)) && !/正在/.test(st); }, null, { timeout: 90000 }); const r = await p.evaluate(() => window.__app.S.edit.origText); await p.evaluate(() => dropEdit()); return r; };

  // 1. text only
  await open('latex.pdf');
  let u = await ui();
  check(u.box && !u.ocr && !u.dis, 'a PDF of text only: search is there, no reading is offered');

  // 2. a scan
  await open('scan.pdf');
  u = await ui();
  check(u.ocr && /第 1 页/.test(u.note), 'a scan: reading is offered (' + u.note + ')');
  let r = await find('Total due');
  check(r.n === 0 && /识别图片里的文字/.test(r.info), 'before the reading nothing is found, and the note says why');
  let o = await read();
  u = await ui();
  check(!u.ocr && o.lines > 5, 'after the reading the button is gone (' + o.lines + ' lines read in ' + o.ms + ' ms)');
  const phrases = ['INVOICE #2026-1184', 'Harbor Street Studio', 'November 12, 2026', 'Total due: $1,284.00', 'AB-0042-XZ', 'Spaced letters here', 'Wide word gaps here', 'Condensed by scale', 'Due in', 'Embedded TrueType', 'Pay by December 1'];
  const got = [];
  for (const q of phrases) { r = await find(q); if (r.n >= 1) got.push(q); }
  console.log('     found on the scan:', got.length + ' / ' + phrases.length, '| missed:', phrases.filter(q => !got.includes(q)).join(' ; ') || 'none');
  check(got.length >= 8, 'most phrases of the scan are found (' + got.length + ' of ' + phrases.length + ')');
  r = await find('total due');
  check(r.n === 1 && r.ocr === 1 && /识别出来的/.test(r.info), 'a found phrase is marked as read from the picture: ' + r.info.slice(0, 60));
  const sel = await step();
  check(/Total due/i.test(sel), 'stepping to it selects the phrase for editing (read: ' + JSON.stringify(sel) + ')');

  // 3. text of the file next to a picture with text
  await open('mixed.pdf');
  u = await ui();
  check(u.ocr && /第 1 页/.test(u.note) && !/2/.test(u.note.replace(/第 1 页/, '')), 'a PDF with a picture on page 1: reading is offered for that page only (' + u.note + ')');
  r = await find('Order 58231');
  check(r.n === 2 && r.ocr === 0 && r.pages === '12', 'before the reading: the 2 occurrences in the file\'s text (' + r.n + ' on pages ' + r.pages + ')');
  o = await read();
  r = await find('Order 58231');
  check(r.n === 3 && r.ocr === 1, 'after the reading: also the one inside the picture, and the file\'s own text is not counted twice (' + r.n + ', ' + r.ocr + ' read; ' + o.ms + ' ms)');
  r = await find('Warehouse B, Dock 14');
  check(r.n === 1 && r.ocr === 1, 'text that is only in the picture is found (' + r.n + ')');
  r = await find('湖滨路');
  check(r.n === 1 && r.ocr === 1, 'Chinese in the picture is found (' + r.n + ')');

  // 4. a plain picture
  await open('mixed-page.png');
  u = await ui();
  check(u.box && u.ocr && u.dis, 'a picture: reading is offered, searching waits for it (' + u.note + ')');
  o = await read();
  u = await ui();
  check(!u.ocr && !u.dis, 'after the reading the picture can be searched (' + o.lines + ' lines in ' + o.ms + ' ms)');
  r = await find('order 58231');
  check(r.n === 2, 'both occurrences in the picture are found (' + r.n + ')');
  const s2 = await step();
  check(/58231/.test(s2), 'stepping selects it for editing (read: ' + JSON.stringify(s2) + ')');
  console.log(fails.length ? 'FAILED ' + fails.length : 'all passed');
  if (logs.length) console.log(logs.slice(0, 6).join('\n'));
  await browser.close(); srv.kill();
})();
