// The PDF core on its own (no browser): glyph positions, reading text from a selection, taking glyphs out of the content stream.
// For each sample and target phrase: the phrase is read back exactly, removed from the file, and everything else stays where it was
// (checked with poppler: pdftotext word boxes before and after, and a pixel comparison outside the selection).
//   node test/pdf/t_strip.mjs [filter]
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process'; import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '..', '..'), OUT = path.join(ROOT, 'test', 'out', 'pdf');
const require = createRequire(import.meta.url);
const NM = path.join(ROOT, 'node_modules');
const pdfjs = await import(pathToFileURL(path.join(NM, 'pdfjs-dist/legacy/build/pdf.mjs')).href);
const PDFLib = require(path.join(NM, 'pdf-lib/dist/pdf-lib.min.js'));
const core = new Function(fs.readFileSync(path.join(ROOT, 'src/pdfcore.js'), 'utf8') + '\nreturn { pdfGlyphMap, pdfTextIn, pdfGlyphsIn, pdfStrip, pdfScanShows };')();
const CASES = [
  ['reportlab.pdf', 1, ['INVOICE #2026-1184', 'November 12, 2026', '$1,284.00', 'AB-0042-XZ', 'Spaced letters', 'word gaps', 'Condensed by scale', '30', 'café, naïve', '人民币 1,284.00 元', 'December 1']],
  ['reportlab.pdf', 2, ['1.5%']],
  ['rawops.pdf', 1, ['one by Tj', 'two after TD', 'three after T-star', 'four by quote', 'five by double quote', 'Kerned TJ array', 'second part,', 'Negative size', 'string text 1234', '(paren)', 'inside a form']],
  ['rawops.pdf', 2, ['5,600']],
  ['latex.pdf', 1, ['Quarterly Report 2026', '14.2 percent', 'Wavering Avenue', 'A. V. Taylor', 'Version 1.03', '1,250.00']],
  ['libreoffice.pdf', 1, ['March 18, 2027', '7:30 PM', 'Room 204', '2027年3月18日', '社区活动中心']],
  ['chrome.pdf', 1, ['SPRING CATALOG 2027', 'April 30', 'save 20%', '$62.50', '全场满300元包邮', '4471-AX', 'small batches']],
  ['chrome.pdf', 2, ['30 days']],
  ['mpl_type3.pdf', 1, ['Monthly Sales 2026', 'Peak: 7 units']],
  ['mpl_type42.pdf', 1, ['Monthly Sales 2026', 'Peak: 7 units']]
];
const filt = process.argv[2] || '';
const SCALE = 3;
const words = f => {
  const x = execFileSync('pdftotext', ['-bbox', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }), out = [];
  let pg = 0;
  for (const line of x.split('\n')) {
    if (/<page /.test(line)) pg++;
    const m = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)<\/word>/.exec(line);
    if (m) out.push({ pg, x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") });
  }
  return out;
};
const ppm = (f, pg) => { // grey render at 100 dpi → { w, h, d }
  const base = path.join(OUT, '_cmp');
  execFileSync('pdftoppm', ['-cropbox', '-r', '100', '-gray', '-f', String(pg), '-l', String(pg), '-singlefile', f, base], { stdio: 'ignore' });
  const b = fs.readFileSync(base + '.pgm'); let pos = 0; const tok = () => { while (b[pos] <= 32) pos++; let s = pos; while (b[pos] > 32) pos++; return b.toString('latin1', s, pos); };
  tok(); const w = +tok(), h = +tok(); tok(); pos++; return { w, h, d: b.subarray(pos, pos + w * h) };
};
let nOK = 0, nAll = 0;
for (const [file, pno, targets] of CASES) {
  const src = path.join(OUT, file);
  if (!fs.existsSync(src)) { console.log('missing', file); continue; }
  const data = fs.readFileSync(src);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), cMapUrl: path.join(NM, 'pdfjs-dist/cmaps') + '/', cMapPacked: true, standardFontDataUrl: path.join(NM, 'pdfjs-dist/standard_fonts') + '/', fontExtraProperties: true, verbosity: 0 }).promise;
  const page = await doc.getPage(pno), vp = page.getViewport({ scale: SCALE });
  const ol = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  const map = core.pdfGlyphMap(ol, pdfjs.OPS, id => { try { return page.commonObjs.get(id); } catch (e) { return null; } }, vp.transform);
  const before = words(src).filter(w => w.pg === pno), imgA = ppm(src, pno);
  for (const target of targets) {
    if (filt && !(file + ' ' + target).includes(filt)) continue;
    nAll++;
    // find the phrase among the glyphs (spaces ignored)
    const flat = [];
    for (const s of map.shows) for (const g of s.g) if (String(g.u || '').trim()) flat.push(g);
    const want = target.replace(/\s/g, ''), all = flat.map(g => g.u).join('');
    const at = all.indexOf(want);
    let msg = '';
    if (at < 0) { console.log('FAIL', file, 'p' + pno, JSON.stringify(target), 'not found among glyphs'); continue; }
    let ci = 0, i0 = -1, i1 = -1;
    flat.forEach((g, i) => { if (ci <= at && at < ci + g.u.length) i0 = i; if (ci < at + want.length && at + want.length <= ci + g.u.length) i1 = i; ci += g.u.length; });
    const sel = flat.slice(i0, i1 + 1), xs = sel.flatMap(g => [g.a[0], g.b[0], g.t[0], g.d[0]]), ys = sel.flatMap(g => [g.a[1], g.t[1], g.d[1]]);
    const r = { x: Math.min(...xs) - 1, y: Math.min(...ys) - 1, w: Math.max(...xs) - Math.min(...xs) + 2, h: Math.max(...ys) - Math.min(...ys) + 2 };
    const read = core.pdfTextIn(map, r);
    if (read.text.replace(/\s/g, '') !== want) msg += ' read=' + JSON.stringify(read.text);
    if (read.text !== target) msg += read.text.replace(/\s/g, '') === want ? ' (spacing: ' + JSON.stringify(read.text) + ')' : '';
    // take the glyphs out
    const jobs = new Map(); let nested = 0;
    for (const g of core.pdfGlyphsIn(map, r)) { if (!g.rec.top) { nested++; continue; } if (!jobs.has(g.rec.k)) jobs.set(g.rec.k, new Set()); jobs.get(g.rec.k).add(g.j); }
    const pd = await PDFLib.PDFDocument.load(data), node = pd.getPage(pno - 1).node, ctx = pd.context;
    const cont = node.Contents(), streams = cont instanceof PDFLib.PDFArray ? cont.asArray().map(x => ctx.lookup(x)) : cont ? [cont] : [];
    const chunks = streams.map(s => PDFLib.decodePDFRawStream(s).decode());
    let len = 0; for (const c of chunks) len += c.length + 1;
    const content = new Uint8Array(len); let o = 0; for (const c of chunks) { content.set(c, o); o += c.length; content[o++] = 10; }
    const res = core.pdfStrip(content, map, jobs);
    if (res.failed.length) msg += ' strip failed: ' + res.failed.map(f => f.why).join('; ');
    if (nested) msg += ' nested glyphs (not removable): ' + nested;
    const outFile = path.join(OUT, '_strip.pdf');
    if (res.bytes) {
      node.set(PDFLib.PDFName.of('Contents'), ctx.register(ctx.flateStream(res.bytes)));
      fs.writeFileSync(outFile, await pd.save());
      // 1. the phrase is gone, 2. every other word is where it was
      const after = words(outFile).filter(w => w.pg === pno);
      const inSel = w => { const cx = (w.x0 + w.x1) / 2 * SCALE, cy = (w.y0 + w.y1) / 2 * SCALE; return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h; };
      const key = w => w.t + '@' + w.x0.toFixed(1) + ',' + w.y0.toFixed(1) + ',' + w.x1.toFixed(1);
      const left = after.filter(inSel).map(w => w.t).join(' ');
      if (!nested && !res.failed.length && left) msg += ' still in selection: ' + JSON.stringify(left);
      const A = new Set(after.map(key)), lostW = before.filter(w => !A.has(key(w)));
      // words fully outside the selection must be untouched; words that straddle its edge are cut, which is expected
      const sx0 = r.x / SCALE - 0.5, sx1 = (r.x + r.w) / SCALE + 0.5, sy0 = r.y / SCALE, sy1 = (r.y + r.h) / SCALE;
      const rot = page.rotate || page.view[0] || page.view[1];       // poppler's word boxes use another frame on rotated or cropped pages: there, go by the word itself
      const outside = lostW.filter(w => (rot ? !target.includes(w.t) : w.x1 < sx0 || w.x0 > sx1 || w.y1 < sy0 || w.y0 > sy1));
      if (outside.length) msg += ' moved/lost outside: ' + outside.slice(0, 4).map(w => w.t).join(',');
      // 3. pixels outside the selection are identical
      const imgB = ppm(outFile, pno), f = 100 / 72 / SCALE;
      let diff = 0;
      for (let y = 0; y < imgA.h; y++) for (let x = 0; x < imgA.w; x++) {
        if (x >= r.x * f - 2 && x <= (r.x + r.w) * f + 2 && y >= r.y * f - 2 && y <= (r.y + r.h) * f + 2) continue;
        if (Math.abs(imgA.d[y * imgA.w + x] - imgB.d[y * imgA.w + x]) > 24) diff++;
      }
      if (diff) msg += ' pixels changed outside: ' + diff;
      // inside the selection there should be no ink of the phrase left (when everything could be removed)
    }
    const ok = !msg || /^ \(spacing: [^)]*\)$/.test(msg) || (target === 'inside a form' && /^ nested glyphs \(not removable\): 13$/.test(msg));   // text in a form XObject is reported, not removed
    if (ok) nOK++;
    console.log(ok ? 'OK  ' : 'FAIL', file.padEnd(16), 'p' + pno, JSON.stringify(target).padEnd(26), 'ops ' + jobs.size, msg);
  }
}
console.log('summary', nOK + '/' + nAll);
