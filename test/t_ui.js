const path = require('path');
const { open } = require('./harness');
(async () => {
  for (const [name, vp, mobile] of [['mobile', { width: 390, height: 780 }, true], ['desktop', { width: 1280, height: 820 }, false]]) {
    const h = await open({ viewport: vp, dsf: 2, touch: mobile, mobile });
    const p = h.page;
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(__dirname, 'out', `ui-${name}-idle.png`) });
    // drag a box around the date line of the demo picture
    const box = await p.evaluate(() => {
      const S = window.__app.S, r = document.getElementById('stage').getBoundingClientRect();
      const x = document.createElement('canvas').getContext('2d'); x.font = '500 46px "Noto Sans SC"';
      const w = x.measureText('11月21日—22日 · 10:00–18:00').width;
      const P = (ix, iy) => [r.left + S.view.tx + ix * S.view.s, r.top + S.view.ty + iy * S.view.s];
      return { a: P(72, 356), b: P(84 + w + 14, 428), demo: S.demo, note: document.getElementById('stageNote').textContent };
    });
    await p.mouse.move(box.a[0], box.a[1]); await p.mouse.down();
    await p.mouse.move((box.a[0] + box.b[0]) / 2, (box.a[1] + box.b[1]) / 2, { steps: 4 });
    await p.mouse.move(box.b[0], box.b[1], { steps: 4 }); await p.mouse.up();
    await p.waitForTimeout(200);
    await p.fill('#inOrig', '11月21日—22日 · 10:00–18:00');
    await p.waitForFunction(() => { const ed = window.__app.S.edit; return ed && ed.st.matched && !/正在/.test(document.getElementById('matchStatus').textContent); }, null, { timeout: 90000 });
    await p.fill('#inNew', '12月05日—06日 · 09:30–17:00');
    await p.waitForTimeout(300);
    const info = await p.evaluate(() => { const st = window.__app.S.edit.st; return { fam: st.fam.n, w: st.weight, px: st.px, score: st.score, status: document.getElementById('matchStatus').textContent, cands: window.__app.S.edit.cands.length }; });
    console.log(name, JSON.stringify(info), box.note);
    await p.screenshot({ path: path.join(__dirname, 'out', `ui-${name}-edit.png`) });
    await p.click('#tune summary');
    await p.waitForTimeout(200);
    if (mobile) await p.evaluate(() => { document.getElementById('panel').scrollTop = 260; });
    await p.screenshot({ path: path.join(__dirname, 'out', `ui-${name}-tune.png`) });
    await p.click('#btnApply');
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, 'out', `ui-${name}-applied.png`) });
    const bad = h.logs.filter(l => !/400|Failed to load/.test(l));
    if (bad.length) console.log('LOGS', bad.slice(0, 8).join('\n'));
    await h.browser.close();
  }
})();
