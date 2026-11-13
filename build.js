// Builds both targets from src/:
//   dist/index.html   the Claude artifact (fonts from Google Fonts; Claude reads the original text when available)
//   docs/             the GitHub Pages / installable version (fonts hosted alongside, offline packs, service worker)
// Fonts for docs/ are prepared by build_site.js (run it once, or after font changes).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const rd = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const FINE_PAGES = '双指缩放和移动图片；电脑上滚轮缩放，按住空格拖动。图片只在你的设备上处理，不会上传。原文字由页面自带的识别读出：常见的黑体、宋体和英文印刷体能读，手写体、艺术字读不准时请手动输入。也可以打开 PDF：一页一页地改，原文字直接取自 PDF，保存时写回 PDF，其它内容不变。';
function build(target) {
  const pages = target === 'pages';
  let html = rd('index.html');
  const js = "'use strict';\nconst BUILD = '" + target + "';\n" + rd('fontdb.gen.js') + '\n' +
    (pages ? rd('selffonts.gen.js') + '\nFONT_PACKS.pdf = ' + JSON.stringify(Object.assign(pdfPack(), { files: undefined })) + ';' : 'const SELF_FONTS = {}, FONT_PACKS = {};') + '\n' +
    rd('core.js') + '\n' + rd('hanzi.gen.js') + '\n' + rd('latin.gen.js') + '\n' + rd('ocr.js') + '\n' + rd('pdfcore.js') + '\n' + rd('pdf.js') + '\n' + rd('app.js');
  if (/<\/script/i.test(js)) throw new Error('script close tag inside JS');
  html = html.replace('/*__CSS__*/', () => rd('style.css')).replace('/*__JS__*/', () => js);
  if (pages) {
    html = html.replace('/*__UIFONT__*/', 'fonts/ibm-plex-mono/ibm-plex-mono.css')
      .replace('<!--__PWA_HEAD__-->', ['<meta name="description" content="框住图片里的文字，换成新文字，字体、颜色、位置保持一致。在设备上处理，可离线使用。">',
        '<meta name="theme-color" content="#c2006a">', '<link rel="manifest" href="manifest.webmanifest">', '<link rel="icon" href="icons/icon-192.png">',
        '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">', '<meta name="apple-mobile-web-app-capable" content="yes">',
        '<meta name="mobile-web-app-capable" content="yes">', '<meta name="apple-mobile-web-app-title" content="图片改字">',
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">'].join('\n'));
    html = html.replace(/(<p class="fine">)[^<]*(<\/p>)/, (m, a, b) => a + FINE_PAGES + b);
  } else {
    html = html.replace('/*__UIFONT__*/', 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap').replace('<!--__PWA_HEAD__-->\n', '');
  }
  const out = pages ? path.join(__dirname, 'docs') : path.join(__dirname, 'dist');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  if (pages) {
    const ver = crypto.createHash('sha256').update(html).digest('hex').slice(0, 10);
    const plex = fs.readFileSync(path.join(out, 'fonts/ibm-plex-mono/ibm-plex-mono.css'), 'utf8');
    const plexFiles = [...plex.matchAll(/url\((files\/ibm-plex-mono-latin-(?:400|500)-normal\.woff2)\)/g)].map(m => 'fonts/ibm-plex-mono/' + m[1]);
    copyPdfLibs(out);
    { const pj = path.join(out, 'fonts', 'packs.json'), packs = JSON.parse(fs.readFileSync(pj, 'utf8')); packs.pdf = pdfPack(); fs.writeFileSync(pj, JSON.stringify(packs)); }
    const shell = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'fonts/packs.json', 'fonts/ibm-plex-mono/ibm-plex-mono.css', ...plexFiles,
      ...PDF_CORE];
    fs.writeFileSync(path.join(out, 'sw.js'), rd('sw.js').replace('__VERSION__', ver).replace('__SHELL__', JSON.stringify(shell)));
    fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
      name: '图片改字', short_name: '图片改字', description: '框住图片里的文字，换成新文字，字体、颜色、位置保持一致。',
      lang: 'zh-CN', start_url: './', scope: './', display: 'standalone', orientation: 'any',
      background_color: '#f3f4f6', theme_color: '#c2006a',
      icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
    }, null, 2));
    fs.writeFileSync(path.join(out, '.nojekyll'), '');
    console.log('docs/index.html', (html.length / 1024).toFixed(1) + ' KB, version', ver);
  } else console.log('dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
}
/* PDF support: pdf.js (Apache-2.0) and pdf-lib (MIT), copied from node_modules so the site asks no other host for them.
   The two pdf.js modules get a .js name so that every static host serves them as scripts. */
function copyPdfLibs(out) {
  const NM = path.join(__dirname, 'node_modules'), pj = path.join(NM, 'pdfjs-dist'), dst = path.join(out, 'pdf');
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  const cp = (from, to) => { fs.mkdirSync(path.dirname(path.join(dst, to)), { recursive: true }); fs.copyFileSync(from, path.join(dst, to)); };
  cp(path.join(pj, 'legacy/build/pdf.min.mjs'), 'pdf.min.js');
  cp(path.join(pj, 'legacy/build/pdf.worker.min.mjs'), 'pdf.worker.min.js');
  cp(path.join(pj, 'LICENSE'), 'LICENSE-pdfjs.txt');
  cp(path.join(NM, 'pdf-lib/dist/pdf-lib.min.js'), 'pdf-lib.min.js');
  cp(path.join(NM, 'pdf-lib/LICENSE.md'), 'LICENSE-pdf-lib.md');
  for (const d of ['cmaps', 'standard_fonts', 'iccs']) for (const f of fs.readdirSync(path.join(pj, d))) cp(path.join(pj, d, f), d + '/' + f);
  /* image decoders for scans (JBIG2, JPEG 2000) and colour profiles; the script sandbox is not needed */
  for (const f of fs.readdirSync(path.join(pj, 'wasm'))) if (!/quickjs/i.test(f)) cp(path.join(pj, 'wasm', f), 'wasm/' + f);
  const ver = JSON.parse(fs.readFileSync(path.join(pj, 'package.json'), 'utf8')).version, ver2 = JSON.parse(fs.readFileSync(path.join(NM, 'pdf-lib/package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(dst, 'README.txt'), 'Third-party libraries used for PDF support, unmodified apart from the file names of the two pdf.js modules.\n' +
    'pdf.js ' + ver + ' (pdfjs-dist, legacy build) - Mozilla, Apache License 2.0 - https://github.com/mozilla/pdf.js\n' +
    'pdf-lib ' + ver2 + ' - Andrew Dillon, MIT License - https://github.com/Hopding/pdf-lib\n');
}
/* the PDF helper files (character maps, standard fonts, image decoders) as one more offline pack; the three scripts are kept with the app itself */
const PDF_CORE = ['pdf/pdf.min.js', 'pdf/pdf.worker.min.js', 'pdf/pdf-lib.min.js'];
function pdfPack() {
  const pj = path.join(__dirname, 'node_modules', 'pdfjs-dist'), files = [];
  let bytes = 0;
  for (const d of ['cmaps', 'standard_fonts', 'iccs', 'wasm']) for (const f of fs.readdirSync(path.join(pj, d))) {
    if (d === 'wasm' && /quickjs/i.test(f)) continue;
    if (/^LICENSE/i.test(f)) continue;
    files.push('pdf/' + d + '/' + f); bytes += fs.statSync(path.join(pj, d, f)).size;
  }
  return { name: 'PDF 组件', bytes, n: files.length, fams: 0, files };
}
const which = process.argv[2] || 'all';
if (which === 'all' || which === 'artifact') build('artifact');
if (which === 'all' || which === 'pages') build('pages');
