// Finding a text everywhere in a PDF and replacing every occurrence, one after the other, in the installable build:
// the search lists all occurrences on all pages; "next" goes to each one that has not been edited and selects it; the replacement
// typed for the first is offered for the rest; the saved file has none of the old text left and the new text as text.
//   python3 test/pdf/make_samples.py && node test/t_pdf_find.js     (CHROME=/path/to/chrome to use a system browser)
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'test', 'out', 'pdf');
const PORT = 8773, BASE = 'http://localhost:' + PORT + '/';
const count = (hay, needle) => hay.split(needle).length - 1;
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'docs')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(BASE + '__samples/**', route => { const f = path.join(OUT, decodeURIComponent(new URL(route.request().url()).pathname.replace('/__samples/', ''))); route.fulfill(fs.existsSync(f) ? { status: 200, contentType: 'application/pdf', body: fs.readFileSync(f) } : { status: 404, body: '' }); });
  const p = await ctx.newPage();
  const logs = [];
  p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => window.__app && window.__app.S.img, null, { timeout: 20000 });
  await p.evaluate(async url => { const b = await (await fetch(url)).blob(); await window.__app.loadBlob(new File([b], 'repeat.pdf', { type: 'application/pdf' }), 'repeat.pdf'); }, BASE + '__samples/repeat.pdf');
  const fails = [];
  const check = (ok, what) => { console.log(ok ? 'OK  ' : 'FAIL', what); if (!ok) fails.push(what); };
  check(await p.evaluate(() => !document.getElementById('findBox').hidden), 'the search box shows once a PDF is open');
  const run = async (q, repl) => {
    await p.fill('#findIn', q);
    await p.click('#findGo');
    await p.waitForFunction(() => window.__app.S.pdf.find && window.__app.S.pdf.find.done, null, { timeout: 30000 });
    const found = await p.evaluate(() => ({ n: window.__app.S.pdf.find.hits.length, pages: [...new Set(window.__app.S.pdf.find.hits.map(h => h.no))], info: document.getElementById('findInfo').textContent }));
    const steps = [];
    for (let i = 0; i < found.n + 2; i++) {
      const left = await p.evaluate(() => findLeft());
      if (left <= 0) break;
      await p.click('#findNext');
      await p.waitForFunction(() => { const ed = window.__app.S.edit, st = document.getElementById('matchStatus').textContent; return ed && ed.origText && ed.st.matched && ed.cands.length && !/正在/.test(st); }, null, { timeout: 60000 });
      await p.waitForTimeout(150);
      const s = await p.evaluate(() => { const ed = window.__app.S.edit, v = window.__app.S.view, h = ed.find; return { page: window.__app.S.pdf.cur, read: ed.origText, pre: document.getElementById('inNew').value, inView: h.x * v.s + v.tx > 0 && (h.x + h.w) * v.s + v.tx < window.__app.S.vw && h.y * v.s + v.ty > 0 && (h.y + h.h) * v.s + v.ty < window.__app.S.vh, px: h.h * v.s }; });
      if (i === 0) { await p.fill('#inNew', repl); await p.waitForTimeout(120); }
      await p.waitForTimeout(500);
      s.font = await p.evaluate(() => { const st = window.__app.S.edit.st; return (st.fam.label || st.fam.n) + ' ' + st.weight + ' | ' + document.getElementById('matchStatus').textContent.slice(0, 70); });
      steps.push(s);
      await p.evaluate(() => window.__app.commit('text', false));
      await p.waitForTimeout(60);
    }
    return { found, steps, left: await p.evaluate(() => findLeft()), info: await p.evaluate(() => document.getElementById('findInfo').textContent), toast: await p.evaluate(() => document.getElementById('toast').textContent) };
  };
  const a = await run('harbor  street studio', 'Lakeside Print Works');
  console.log('    ', a.found.info);
  if (process.env.DEBUG) console.log(JSON.stringify(a.steps), JSON.stringify(await p.evaluate(() => [...window.__app.S.pdf.pages.entries()].map(e => [e[0], e[1].edits.length, window.__app.S.undo.length, window.__app.S.vw, window.__app.S.vh]))));
  check(a.found.n === 7 && a.found.pages.join() === '1,2,3', 'all 7 occurrences found on pages 1–3, whatever the case and spacing (found ' + a.found.n + ' on ' + a.found.pages.join() + ')');
  check(a.steps.length === 7 && a.steps.every(s => s.read.replace(/\s+/g, ' ').toLowerCase() === 'harbor street studio'), 'each step selects exactly the occurrence (' + a.steps.map(s => s.page).join('') + ')');
  check(a.steps.every(s => s.inView && s.px > 12), 'each occurrence is brought into view at a readable size');
  check(a.steps[0].pre === a.steps[0].read && a.steps.slice(1).every(s => s.pre === 'Lakeside Print Works'), 'the replacement typed once is offered for the others');
  check(a.left === 0 && /全部改过了/.test(a.info) && /都改完了/.test(a.toast), 'after the last one nothing is left: ' + a.info);
  const b = await run('海港街工作室', '湖畔印务');
  if (process.env.DEBUG) console.log(JSON.stringify(b.steps));
  check(b.found.n === 2 && b.steps.length === 2 && b.left === 0, 'Chinese: 2 occurrences found and replaced (' + b.found.n + ')');
  const none = await p.evaluate(async () => { await findAll('no such words'); return document.getElementById('findInfo').textContent; });
  check(/没有找到/.test(none), 'a text that is not there: ' + none.slice(0, 24));
  const saved = await p.evaluate(async () => { const o = await pdfBuild(false); let s = ''; for (let i = 0; i < o.bytes.length; i += 32768) s += String.fromCharCode.apply(null, o.bytes.subarray(i, i + 32768)); 
    /* the saved file's text as pdf.js reads it (poppler has no table for the non-embedded Chinese font of this sample) */
    const chk = await pdfOpenDoc(window.__app.S.pdf.lib, o.bytes, () => null); let all = '';
    for (let no = 1; no <= chk.numPages; no++) all += (await (await chk.getPage(no)).getTextContent()).items.map(it => it.str).join('') + '\n';
    pdfDestroy(chk);
    return { b64: btoa(s), report: o.report, text: pdfReportText(o.report), all }; });
  const outFile = path.join(OUT, 'out-repeat.pdf');
  fs.writeFileSync(outFile, Buffer.from(saved.b64, 'base64'));
  const t = execFileSync('pdftotext', ['-layout', outFile, '-'], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  check(count(t.toLowerCase(), 'harbor street studio') === 0, 'the saved file has no "Harbor Street Studio" left');
  check(count(t, 'Lakeside Print Works') === 7, 'the saved file has "Lakeside Print Works" 7 times as text (' + count(t, 'Lakeside Print Works') + ')');
  check(count(saved.all, '湖畔印务') === 2 && count(saved.all, '海港街工作室') === 0, 'the saved file has 湖畔印务 twice as text and no 海港街工作室 (' + count(saved.all, '湖畔印务') + ', ' + count(saved.all, '海港街工作室') + ')');
  check(saved.report.text === 9 && saved.report.pics === 0 && saved.report.covered === 0, 'all 9 edits written as text, none as a picture: ' + JSON.stringify({ text: saved.report.text, pics: saved.report.pics, why: saved.report.why, covered: saved.report.covered }));
  console.log('    ', saved.text);
  console.log(fails.length ? 'FAILED ' + fails.length : 'all passed');
  if (logs.length) console.log(logs.slice(0, 6).join('\n'));
  await browser.close(); srv.kill();
})();
