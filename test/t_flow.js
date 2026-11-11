// End-to-end flow with the optional capabilities mocked: recognise → match → replace → undo → save.
const path = require('path');
const { open } = require('./harness');
(async () => {
  const init = () => {
    const sample = Object.assign(async () => ({ text: 'x', truncated: false }), {
      json: async (prompt, o) => { window.__ocrCalls = (window.__ocrCalls || 0) + 1; window.__ocrImg = o && o.images && o.images[0] && o.images[0].size; await new Promise(r => setTimeout(r, 150)); return { text: '门票 ¥25' }; },
      limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 2e7, mediaTypes: ['image/png'] } })
    });
    window.claude = { use: async n => (n === 'sample' ? sample : n === 'downloads' ? { save: async o => { window.__saved = { name: o.filename, size: o.data.size }; return { status: 'saved' }; } } : null) };
  };
  const h = await open({ viewport: { width: 390, height: 780 }, dsf: 2, touch: true, mobile: true, init });
  const p = h.page;
  await p.waitForTimeout(500);
  const P = async (ix, iy) => p.evaluate(([ix, iy]) => { const S = window.__retext.S, r = document.getElementById('stage').getBoundingClientRect(); return [r.left + S.view.tx + ix * S.view.s, r.top + S.view.ty + iy * S.view.s]; }, [ix, iy]);
  const a = await P(100, 482), b = await P(372, 552);
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(b[0], b[1], { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(200);
  console.log('after select:', await p.evaluate(() => [document.getElementById('matchStatus').textContent, document.getElementById('btnOcr').hidden, window.__ocrCalls || 0]));
  await p.waitForFunction(() => { const ed = window.__retext.S.edit; return ed && ed.st.matched && !/正在/.test(document.getElementById('matchStatus').textContent); }, null, { timeout: 90000 });
  console.log('matched:', await p.evaluate(() => { const ed = window.__retext.S.edit, st = ed.st; return [document.getElementById('inOrig').value, document.getElementById('inNew').value, st.fam.n, st.weight, st.px.toFixed(1), st.color.map(Math.round).join(','), (st.score * 100).toFixed(1), window.__ocrCalls, window.__ocrImg]; }));
  await p.fill('#inNew', '门票 ¥30');
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(__dirname, 'out', 'flow-edit.png') });
  await p.click('#btnApply');
  // second box: recognition now runs by itself
  const c = await P(74, 112), d = await P(560, 160);
  await p.mouse.move(c[0], c[1]); await p.mouse.down(); await p.mouse.move(d[0], d[1], { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(600);
  console.log('second box ocr calls:', await p.evaluate(() => window.__ocrCalls));
  await p.click('#btnCancel');
  await p.click('#btnSave');
  await p.waitForTimeout(400);
  console.log('saved:', await p.evaluate(() => [JSON.stringify(window.__saved), document.getElementById('toast').textContent, document.getElementById('sheet').hidden]));
  await p.click('#btnUndo');
  await p.waitForTimeout(200);
  console.log('undo disabled after undo:', await p.evaluate(() => document.getElementById('btnUndo').disabled));
  const bad = h.logs.filter(l => !/400|Failed to load/.test(l));
  if (bad.length) console.log('LOGS', bad.slice(0, 8).join('\n'));
  await h.browser.close();
  // no capabilities: save falls back to the sheet
  const h2 = await open({ viewport: { width: 390, height: 780 }, dsf: 2 });
  await h2.page.click('#btnSave'); await h2.page.waitForTimeout(400);
  console.log('fallback sheet shown:', await h2.page.evaluate(() => [!document.getElementById('sheet').hidden, document.getElementById('sheetImg').src.slice(0, 5), document.getElementById('sheetLink').download]));
  await h2.page.screenshot({ path: path.join(__dirname, 'out', 'flow-sheet.png') });
  await h2.browser.close();
})();
