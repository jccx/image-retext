const fs = require('fs'); const path = require('path');
const { open } = require('./harness');
(async () => {
  const init = () => {
    const sample = Object.assign(async () => ({ text: 'x' }), { json: async (p, o) => { window.__img = o.images[0]; return { text: '门票 ¥25' }; }, limits: async () => ({ images: { maxCount: 4 } }) });
    window.claude = { use: async n => (n === 'sample' ? sample : null) };
  };
  const h = await open({ viewport: { width: 390, height: 780 }, dsf: 2, touch: true, mobile: true, init });
  const p = h.page; await p.waitForTimeout(500);
  const P = async (ix, iy) => p.evaluate(([ix, iy]) => { const S = window.__app.S, r = document.getElementById('stage').getBoundingClientRect(); return [r.left + S.view.tx + ix * S.view.s, r.top + S.view.ty + iy * S.view.s]; }, [ix, iy]);
  const a = await P(100, 482), b = await P(372, 552);
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(b[0], b[1], { steps: 5 }); await p.mouse.up();
  await p.waitForFunction(() => window.__img, null, { timeout: 20000 });
  const b64 = await p.evaluate(async () => { const buf = await window.__img.arrayBuffer(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); });
  fs.writeFileSync(path.join(__dirname, 'out', 'ocr-crop.png'), Buffer.from(b64, 'base64'));
  await p.waitForFunction(() => { const ed = window.__app.S.edit; return ed && ed.st.matched && !/正在/.test(document.getElementById('matchStatus').textContent); }, null, { timeout: 90000 });
  await p.screenshot({ path: path.join(__dirname, 'out', 'ui-selected.png') });
  await h.browser.close();
})();
