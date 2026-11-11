// The installable (GitHub Pages) build on a real local server with its service worker:
// online use → download offline packs → airplane mode (reload, read, match) → back to online (fonts deleted) → still opens offline.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8765, BASE = 'http://localhost:' + PORT + '/';
const box = async (p, x0, y0, x1, y1) => p.evaluate(async ([x0, y0, x1, y1]) => {
  const R = window.__retext, S = R.S;
  R.startEdit({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, false);
  const ed = S.edit, t = Date.now();
  await new Promise(r => { const iv = setInterval(() => { const st = document.getElementById('matchStatus').textContent; if ((ed.origText && ed.st.matched && ed.cands.length && !/正在/.test(st)) || /请手动|请在上面/.test(st) || Date.now() - t > 90000) { clearInterval(iv); r(); } }, 100); });
  return { orig: ed.origText, fam: ed.st.fam.n, w: ed.st.weight, iou: ed.st.score && +(ed.st.score * 100).toFixed(1), ms: Date.now() - t };
}, [x0, y0, x1, y1]);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(__dirname, '..', 'docs')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  let p = await ctx.newPage();
  const logs = [];
  const watch = pg => pg.on('pageerror', e => logs.push('pageerror: ' + e.message));
  watch(p);
  p.on('dialog', d => d.accept());
  try {
    await p.goto(BASE);
    await p.waitForFunction(() => window.__retext && window.__retext.S.img, null, { timeout: 20000 });
    await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 15000 }).catch(async () => { await p.reload(); await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }); });
    console.log('1 online   SW controlling:', await p.evaluate(() => !!navigator.serviceWorker.controller), '| fonts row:', await p.textContent('#btnOffline'));
    console.log('  price', JSON.stringify(await box(p, 100, 482, 372, 552)));
    await p.click('#btnCancel').catch(() => {});
    // 2. offline packs: English + 简体 (defaults)
    await p.click('#btnOffline'); await p.click('#modeOffline');
    console.log('2 sheet:', (await p.textContent('#offGo')).trim(), '|', (await p.textContent('#packList')).replace(/\s+/g, ' ').slice(0, 160));
    const t0 = Date.now();
    await p.click('#offGo');
    await p.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('retext.offline') || '{}'); return s.packs && s.packs.latin === 'done' && s.packs.sc === 'done'; }, null, { timeout: 600000, polling: 1000 });
    const nCache = await p.evaluate(async () => (await (await caches.open('retext-fonts')).keys()).length);
    console.log('  downloaded in', Math.round((Date.now() - t0) / 1000) + 's, files cached', nCache, '|', (await p.textContent('#offStore')), '|', await p.textContent('#offlineState'));
    await p.click('#offClose');
    // 3. airplane mode: fresh page, no network at all
    await ctx.setOffline(true);
    await p.close(); p = await ctx.newPage(); watch(p); p.on('dialog', d => d.accept());
    await p.goto(BASE);
    await p.waitForFunction(() => window.__retext && window.__retext.S.img, null, { timeout: 20000 });
    console.log('3 offline  page opened:', true, '| fonts row:', await p.textContent('#offlineState'));
    console.log('  price', JSON.stringify(await box(p, 100, 482, 372, 552)));
    console.log('  caps ', JSON.stringify(await box(p, 74, 108, 640, 162)));
    console.log('  title', JSON.stringify(await box(p, 72, 200, 860, 330)));
    // 4. back to online: deletes the packs
    await p.click('#btnCancel').catch(() => {});
    await ctx.setOffline(false);
    await p.click('#btnOffline'); await p.click('#modeOnline');
    await p.waitForTimeout(1500);
    const left = await p.evaluate(async () => (await caches.keys()).filter(k => k === 'retext-fonts').length);
    console.log('4 online again: font cache present', !!left, '| state', await p.evaluate(() => localStorage.getItem('retext.offline')), '| row:', await p.textContent('#offlineState'));
    await p.click('#offClose');
    // 5. no packs, airplane mode: the app still opens (system fonts only)
    await ctx.setOffline(true);
    await p.close(); p = await ctx.newPage(); watch(p);
    await p.goto(BASE);
    await p.waitForFunction(() => window.__retext && window.__retext.S.img, null, { timeout: 20000 });
    console.log('5 offline, no packs: page opened | price', JSON.stringify(await box(p, 100, 482, 372, 552)));
    await p.screenshot({ path: path.join(__dirname, 'out', 'pages-offline.png') });
  } catch (e) { console.log('ERR', e.message.split('\n')[0]); }
  console.log(logs.slice(0, 6).join('\n'));
  await browser.close(); srv.kill();
})();
