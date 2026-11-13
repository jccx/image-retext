// A PDF printed by Chrome (Skia): subset fonts with 2-byte codes. Output: test/out/pdf/chrome.pdf
//   CHROME=/usr/bin/google-chrome node test/pdf/make_chrome.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FS = path.join(__dirname, '..', '..', 'node_modules/@fontsource');
const face = (name, id, w, style) => `@font-face{font-family:'${name}';font-weight:${w};font-style:${style};src:url(file://${path.join(FS, id, 'files', id + '-latin-' + w + '-' + style + '.woff2')}) format('woff2')}`;
const html = `<!doctype html><meta charset="utf-8"><style>
${face('Inter', 'inter', 400, 'normal')}${face('Inter', 'inter', 700, 'normal')}${face('Lora', 'lora', 500, 'italic')}${face('Roboto Mono', 'roboto-mono', 400, 'normal')}${face('Oswald', 'oswald', 500, 'normal')}
@page{size:A4;margin:18mm} body{font-family:Inter;color:#1d2733} h1{font:500 30pt Oswald;letter-spacing:.04em;margin:0 0 6mm}
.card{background:#0f4c5c;color:#fff;padding:5mm 7mm;border-radius:3mm;display:inline-block;font:700 16pt Inter}
table{border-collapse:collapse;margin-top:6mm;font-size:12pt} td{padding:2mm 8mm 2mm 0;border-bottom:.3mm solid #c9d1d9}
.zh{font-family:'Noto Sans CJK SC';font-size:15pt;margin-top:6mm} .mono{font:400 11pt 'Roboto Mono';margin-top:4mm} .it{font:italic 500 14pt Lora;margin-top:5mm}
</style>
<h1>SPRING CATALOG 2027</h1>
<p style="font-size:13pt">Order before April 30 to receive free shipping on all items.</p>
<div class="card">Members save 20% today</div>
<table><tr><td>Oak desk lamp</td><td>$48.00</td></tr><tr><td>Linen throw, grey</td><td>$62.50</td></tr><tr><td>Ceramic planter</td><td>$19.90</td></tr></table>
<div class="zh">春季新品目录　全场满300元包邮</div>
<div class="zh" style="font-weight:700">会员专享八折优惠</div>
<div class="mono">SKU 4471-AX   qty: 12   id=0x3F9A</div>
<div class="it">Handmade in small batches, shipped with care</div>
<div style="page-break-before:always;font-size:14pt">Second page: returns accepted within 30 days.</div>`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage();
  const f = path.join(__dirname, '..', 'out', 'pdf', '_chrome.html');
  fs.writeFileSync(f, html);
  await p.goto('file://' + f); await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: path.join(__dirname, '..', 'out', 'pdf', 'chrome.pdf'), format: 'A4', printBackground: true });
  await b.close(); console.log('chrome.pdf');
})();
