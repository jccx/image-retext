// Test harness: headless Chrome, Google Fonts requests answered from local @fontsource packages.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const FS = path.join(ROOT, 'node_modules/@fontsource');
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const idOf = n => n.toLowerCase().replace(/ /g, '-');

function cssFor(name, tuples) {
  const id = idOf(name), dir = path.join(FS, id);
  if (!fs.existsSync(dir)) return null;
  let css = '';
  const cjk = fs.readdirSync(path.join(dir, 'files')).some(f => /-\d+-\d+-normal\.woff2$/.test(f) && !/latin|cyrillic|greek|vietnamese/.test(f));
  for (const [ital, w] of tuples) {
    const style = ital ? 'italic' : 'normal';
    if (cjk) {
      const f = path.join(dir, w + (ital ? '-italic' : '') + '.css');
      if (!fs.existsSync(f)) return null;
      css += fs.readFileSync(f, 'utf8').replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/' + id + '/files/');
    } else {
      const file = id + '-latin-' + w + '-' + style + '.woff2';
      if (!fs.existsSync(path.join(dir, 'files', file))) return null;
      css += `@font-face{font-family:'${name}';font-style:${style};font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/local/${id}/files/${file}) format('woff2');unicode-range:${LATIN};}\n`;
    }
  }
  return css;
}

async function open(opts = {}) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 860 }, deviceScaleFactor: opts.dsf || 1, hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  const stats = { css: 0, cssFail: 0, font: 0 };
  await ctx.route('https://fonts.googleapis.com/**', route => {
    const u = new URL(route.request().url());
    const fams = u.searchParams.getAll('family');
    let css = '';
    for (const spec of fams) {
      const [name, ax] = spec.split(':');
      let tuples = [[0, 400]];
      if (ax) {
        const [axes, vals] = ax.split('@');
        tuples = vals.split(';').map(v => { const p = v.split(','); return axes === 'ital,wght' ? [+p[0], +p[1]] : [0, +p[0]]; });
      }
      const c = cssFor(name, tuples);
      if (c == null) { stats.cssFail++; return route.fulfill({ status: 400, body: 'bad family ' + name }); }
      css += c;
    }
    stats.css++;
    route.fulfill({ status: 200, contentType: 'text/css', body: css, headers: { 'access-control-allow-origin': '*' } });
  });
  await ctx.route('https://fonts.gstatic.com/**', route => {
    const u = new URL(route.request().url());
    const m = /^\/local\/([^/]+)\/files\/(.+)$/.exec(u.pathname);
    const f = m && path.join(FS, m[1], 'files', m[2]);
    if (!f || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    stats.font++;
    route.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } });
  });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.bin': 'application/octet-stream' };
  await ctx.route('http://retext.test/**', route => {
    const u = new URL(route.request().url());
    const f = path.join(ROOT, 'dist', decodeURIComponent(u.pathname));
    if (opts.noOcrFiles && /\/ocr\//.test(u.pathname)) return route.fulfill({ status: 404, body: '' });
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
    stats.own = (stats.own || 0) + 1;
    route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await page.goto('http://retext.test/index.html');
  await page.waitForFunction(() => window.__retext && window.__retext.S.img, null, { timeout: 15000 });
  return { browser, ctx, page, logs, stats };
}

// Wait until the current edit has a finished match (or timeout).
async function waitMatch(page, timeout = 60000) {
  await page.waitForFunction(() => {
    const ed = window.__retext.S.edit;
    return ed && ed.st.matched && ed.cands.length > 0 && !/正在/.test(document.getElementById('matchStatus').textContent);
  }, null, { timeout });
}
module.exports = { open, waitMatch, ROOT };
