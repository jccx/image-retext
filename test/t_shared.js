// The shared link opened in a plain browser: no Claude capabilities at all. Box → built-in reader → match → replace → save sheet.
const path = require('path');
const { open } = require('./harness');
(async () => {
  for (const [label, opts] of [['reader files present', {}]]) {
    const h = await open(Object.assign({ viewport: { width: 390, height: 780 }, dsf: 2, touch: true, mobile: true }, opts));
    const p = h.page;
    await p.waitForTimeout(400);
    const P = async (ix, iy) => p.evaluate(([ix, iy]) => { const S = window.__app.S, r = document.getElementById('stage').getBoundingClientRect(); return [r.left + S.view.tx + ix * S.view.s, r.top + S.view.ty + iy * S.view.s]; }, [ix, iy]);
    const boxes = [[72, 356, 800, 428, '11月21日—22日 · 10:00–18:00'], [100, 482, 372, 552, '门票 ¥25'], [72, 200, 860, 330, '周末手作市集'], [74, 108, 640, 162, 'WEEKEND CRAFT MARKET'], [74, 646, 800, 706, 'Handmade goods, coffee & live music']];
    for (const [x0, y0, x1, y1, truth] of boxes) {
      await p.waitForTimeout(350);
      const a = await P(x0, y0), b = await P(x1, y1), t0 = Date.now();
      await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(b[0], b[1], { steps: 5 }); await p.mouse.up();
      let res;
      try {
        await p.waitForFunction(() => { const ed = window.__app.S.edit; const st = document.getElementById('matchStatus').textContent; return ed && ((ed.st.matched && !/正在/.test(st)) || /请手动/.test(st)); }, null, { timeout: 120000 });
        await p.waitForTimeout(300);
        await p.waitForFunction(() => !/正在/.test(document.getElementById('matchStatus').textContent), null, { timeout: 120000 });
        res = await p.evaluate(() => { const ed = window.__app.S.edit, st = ed.st; return { orig: document.getElementById('inOrig').value, fam: st.fam.n, w: st.weight, iou: st.score == null ? null : +(st.score * 100).toFixed(1), status: document.getElementById('matchStatus').textContent, live: !!ed.live, btn: document.getElementById('btnOcr').hidden ? 'hidden' : document.getElementById('btnOcr').textContent }; });
      } catch (e) { res = { err: e.message.split('\n')[0] }; }
      console.log(label, '|', res.orig === truth ? 'READ OK' : 'READ ≠ ', JSON.stringify(res), (Date.now() - t0) + 'ms');
      if (label === 'reader files missing') break;
      await p.click('#btnCancel');
      await p.waitForTimeout(350);
    }
    if (label === 'reader files present') {
      // full edit on the last-but-one style: change the price and apply
      await p.waitForTimeout(350);
      const a = await P(100, 482), b = await P(372, 552);
      await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(b[0], b[1], { steps: 5 }); await p.mouse.up();
      await p.waitForFunction(() => { const ed = window.__app.S.edit; return ed && ed.st.matched && !/正在/.test(document.getElementById('matchStatus').textContent); }, null, { timeout: 120000 });
      await p.fill('#inNew', '门票 ¥30');
      await p.waitForTimeout(300);
      await p.screenshot({ path: path.join(__dirname, 'out', 'shared-edit.png') });
      await p.click('#btnApply');
      await p.click('#btnSave'); await p.waitForTimeout(400);
      console.log('save sheet shown:', await p.evaluate(() => !document.getElementById('sheet').hidden));
    }
    const bad = h.logs.filter(l => !/400|404|Failed to load/.test(l));
    if (bad.length) console.log('LOGS', bad.slice(0, 6).join('\n').slice(0, 600));
    await h.browser.close();
  }
})();
