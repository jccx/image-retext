// Reading the text: a wrong first reading should be caught by the per-character check and corrected by one re-read.
const { open } = require('./harness');
(async () => {
  const init = () => {
    window.__calls = [];
    const sample = Object.assign(async () => ({ text: 'x', truncated: false }), {
      json: async (prompt, o) => { window.__calls.push(o.modelTier + (o.cache === false ? ':nocache' : '')); window.__lastImg = o.images[0]; await new Promise(r => setTimeout(r, 80)); return { text: o.modelTier === 'quick' ? window.__quick : window.__truth }; },
      limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 2e7, mediaTypes: ['image/png'] } })
    });
    window.claude = { use: async n => (n === 'sample' ? sample : null) };
  };
  const h = await open({ viewport: { width: 1100, height: 800 }, init });
  const p = h.page;
  await p.waitForTimeout(500);
  const P = async (ix, iy) => p.evaluate(([ix, iy]) => { const S = window.__app.S, r = document.getElementById('stage').getBoundingClientRect(); return [r.left + S.view.tx + ix * S.view.s, r.top + S.view.ty + iy * S.view.s]; }, [ix, iy]);
  const CASES = [
    { name: 'wrong CJK char', box: [100, 482, 372, 552], truth: '门票 ¥25', quick: '门口 ¥25' },
    { name: 'similar CJK char', box: [72, 200, 860, 330], truth: '周末手作市集', quick: '周未手作市集' },
    { name: 'wrong Latin letter', box: [74, 108, 640, 162], truth: 'WEEKEND CRAFT MARKET', quick: 'WEEKEND CRAFT MARKEI' },
    { name: 'wrong digit', box: [72, 356, 800, 428], truth: '11月21日—22日 · 10:00–18:00', quick: '11月21日—22日 · 10:00–13:00' },
    { name: 'correct first time', box: [74, 646, 800, 706], truth: 'Handmade goods, coffee & live music', quick: 'Handmade goods, coffee & live music' }
  ];
  for (const c of CASES) {
    await p.evaluate(c => { window.__calls = []; window.__quick = c.quick; window.__truth = c.truth; }, c);
    const a = await P(c.box[0], c.box[1]), b = await P(c.box[2], c.box[3]);
    await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(b[0], b[1], { steps: 5 }); await p.mouse.up();
    // picture must be untouched right after the box is drawn
    const untouched = await p.evaluate(() => !window.__app.S.edit.live);
    await p.waitForFunction(() => { const ed = window.__app.S.edit; return ed && ed.st.matched && !/正在/.test(document.getElementById('matchStatus').textContent); }, null, { timeout: 90000 });
    await p.waitForTimeout(1500);
    await p.waitForFunction(() => !/正在/.test(document.getElementById('matchStatus').textContent), null, { timeout: 90000 });
    const r = await p.evaluate(() => { const ed = window.__app.S.edit, st = ed.st; const gs = glyphScores(ed.cands[0], ed.primaryText, ed.T2, ed.cands[0]);
      return { orig: document.getElementById('inOrig').value, neu: document.getElementById('inNew').value, calls: window.__calls, fam: st.fam.n, iou: +(st.score * 100).toFixed(1), live: !!ed.live, btn: document.getElementById('btnOcr').textContent,
        img: window.__lastImg ? window.__lastImg.size : 0, gs: gs.map(g => g.ch + Math.round(g.iou * 100)).join(' ') }; });
    console.log((r.orig === c.truth ? 'OK  ' : 'KEPT'), c.name.padEnd(20), 'untouchedOnSelect', untouched, 'liveAfterMatch', r.live, JSON.stringify(r.calls), '→', JSON.stringify(r.orig), r.fam, r.iou, '|', r.gs.slice(0, 150));
    await p.click('#btnCancel');
  }
  const bad = h.logs.filter(l => !/400|Failed to load/.test(l));
  if (bad.length) console.log('LOGS', bad.slice(0, 8).join('\n'));
  await h.browser.close();
})();
