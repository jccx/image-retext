/* =====================================================================
   app.js — font registry, edit state, interactions
   ===================================================================== */
const $ = id => document.getElementById(id);
const tick = () => new Promise(r => setTimeout(r, 0));
const hex2 = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
const rgbHex = c => ('#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2])).toUpperCase();
const hexRgb = s => { const m = /^#?([0-9a-f]{6})$/i.exec(s.trim()); if (!m) return null; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; };

/* ---------- font registry ---------- */
const SYS_FONTS = [
  ['system-ui', 's', 1, '系统界面字体'], ['ui-rounded', 's', 0, '系统圆体'], ['ui-serif', 'r', 0, '系统衬线体'], ['ui-monospace', 'm', 0, '系统等宽体'],
  ['Arial', 's'], ['Helvetica', 's'], ['Helvetica Neue', 's'], ['Arial Black', 's'], ['Arial Narrow', 's'], ['Verdana', 's'], ['Tahoma', 's'],
  ['Trebuchet MS', 's'], ['Segoe UI', 's'], ['Calibri', 's'], ['Candara', 's'], ['Corbel', 's'], ['Franklin Gothic Medium', 's'],
  ['Century Gothic', 's'], ['Bahnschrift', 's'], ['Lucida Sans Unicode', 's'], ['Lucida Grande', 's'], ['Geneva', 's'], ['Avenir', 's'],
  ['Avenir Next', 's'], ['Avenir Next Condensed', 's'], ['Futura', 's'], ['Gill Sans', 's'], ['Optima', 's'], ['DIN Alternate', 's'],
  ['DIN Condensed', 's'], ['Impact', 's'], ['Comic Sans MS', 's'], ['Marker Felt', 's'], ['Chalkboard SE', 's'], ['Noteworthy', 's'],
  ['Bradley Hand', 's'], ['Snell Roundhand', 's'], ['Copperplate', 's'], ['Droid Sans', 's'], ['DejaVu Sans', 's'], ['Liberation Sans', 's'], ['Cantarell', 's'],
  ['Times New Roman', 'r'], ['Times', 'r'], ['Georgia', 'r'], ['Cambria', 'r'], ['Constantia', 'r'], ['Garamond', 'r'], ['Book Antiqua', 'r'],
  ['Palatino Linotype', 'r'], ['Palatino', 'r'], ['Baskerville', 'r'], ['Didot', 'r'], ['Hoefler Text', 'r'], ['Charter', 'r'], ['Rockwell', 'r'],
  ['American Typewriter', 'r'], ['DejaVu Serif', 'r'], ['Liberation Serif', 'r'],
  ['Courier New', 'm'], ['Courier', 'm'], ['Consolas', 'm'], ['Lucida Console', 'm'], ['Menlo', 'm'], ['Monaco', 'm'], ['SF Mono', 'm'],
  ['DejaVu Sans Mono', 'm'], ['Liberation Mono', 'm'],
  ['PingFang SC', 's', 1, '苹方-简'], ['PingFang TC', 's', 1, '苹方-繁'], ['PingFang HK', 's', 1, '苹方-港'], ['Hiragino Sans GB', 's', 1, '冬青黑体'],
  ['STHeiti', 's', 1, '华文黑体'], ['Heiti SC', 's', 1, '黑体-简'], ['Heiti TC', 's', 1, '黑体-繁'], ['STXihei', 's', 1, '华文细黑'],
  ['Songti SC', 'r', 1, '宋体-简'], ['Songti TC', 'r', 1, '宋体-繁'], ['STSong', 'r', 1, '华文宋体'], ['STZhongsong', 'r', 1, '华文中宋'],
  ['Kaiti SC', 'r', 1, '楷体-简'], ['STKaiti', 'r', 1, '华文楷体'], ['STFangsong', 'r', 1, '华文仿宋'], ['Yuanti SC', 's', 1, '圆体-简'],
  ['Weibei SC', 'r', 1, '魏碑-简'], ['Hannotate SC', 's', 1, '手札体-简'], ['HanziPen SC', 's', 1, '翩翩体-简'], ['Wawati SC', 's', 1, '娃娃体-简'],
  ['Xingkai SC', 'r', 1, '行楷-简'], ['Baoli SC', 'r', 1, '报隶-简'], ['Libian SC', 'r', 1, '隶变-简'], ['Lantinghei SC', 's', 1, '兰亭黑-简'],
  ['Microsoft YaHei', 's', 1, '微软雅黑'], ['Microsoft YaHei UI', 's', 1, '微软雅黑 UI'], ['Microsoft JhengHei', 's', 1, '微软正黑'],
  ['SimSun', 'r', 1, '宋体'], ['NSimSun', 'r', 1, '新宋体'], ['SimHei', 's', 1, '黑体'], ['KaiTi', 'r', 1, '楷体'], ['FangSong', 'r', 1, '仿宋'],
  ['DengXian', 's', 1, '等线'], ['YouYuan', 's', 1, '幼圆'], ['LiSu', 'r', 1, '隶书'], ['STXingkai', 'r', 1, '华文行楷'], ['STLiti', 'r', 1, '华文隶书'],
  ['STHupo', 's', 1, '华文琥珀'], ['STCaiyun', 's', 1, '华文彩云'], ['FZShuTi', 'r', 1, '方正舒体'], ['FZYaoTi', 'r', 1, '方正姚体'],
  ['Noto Sans CJK SC', 's', 1, '思源黑体 (Noto Sans CJK SC)'], ['Noto Serif CJK SC', 'r', 1, '思源宋体 (Noto Serif CJK SC)'],
  ['Noto Sans CJK TC', 's', 1], ['Noto Sans CJK JP', 's', 1], ['Noto Sans CJK KR', 's', 1],
  ['Source Han Sans SC', 's', 1, '思源黑体'], ['Source Han Sans CN', 's', 1, '思源黑体 CN'], ['Source Han Serif SC', 'r', 1, '思源宋体'],
  ['Source Han Serif CN', 'r', 1, '思源宋体 CN'], ['WenQuanYi Micro Hei', 's', 1, '文泉驿微米黑'], ['WenQuanYi Zen Hei', 's', 1, '文泉驿正黑'],
  ['HarmonyOS Sans SC', 's', 1], ['MiSans', 's', 1], ['OPPOSans', 's', 1], ['Alibaba PuHuiTi', 's', 1, '阿里巴巴普惠体'],
  ['Hiragino Sans', 's', 1], ['Hiragino Mincho ProN', 'r', 1], ['Yu Gothic', 's', 1], ['Yu Mincho', 'r', 1], ['Meiryo', 's', 1],
  ['MS Gothic', 's', 1], ['MS Mincho', 'r', 1], ['Malgun Gothic', 's', 1], ['Apple SD Gothic Neo', 's', 1], ['Batang', 'r', 1], ['Gulim', 's', 1],
  ['sans-serif', 's', 1, '默认无衬线'], ['serif', 'r', 1, '默认衬线'], ['monospace', 'm', 0, '默认等宽']
];
const FAM = new Map();
const sysFams = [];
for (const r of GF) FAM.set(r[0], { n: r[0], c: r[1], w: r[2], it: r[3], tier: r[4], sc: r[5], sys: false, cjk: !!r[5] });

function detectSystemFonts() {
  const ctx = mctx(64, 64);
  const T = 'mmmmmmmmmmlli1234567890WQgj@中文字體あ한';
  const bases = ['monospace', 'serif', 'sans-serif'];
  const bw = bases.map(b => { ctx.font = '72px ' + b; return ctx.measureText(T).width; });
  const sigs = new Set();
  for (const [n, c, cjk, label] of SYS_FONTS) {
    if (FAM.has(n)) continue;
    let ok = n === 'sans-serif' || n === 'serif' || n === 'monospace';
    if (!ok) {
      const q = GENERIC.has(n) ? n : '"' + n + '"';
      for (let i = 0; i < 3 && !ok; i++) { ctx.font = '72px ' + q + ', ' + bases[i]; if (Math.abs(ctx.measureText(T).width - bw[i]) > 0.5) ok = true; }
    }
    if (!ok) continue;
    /* several names often resolve to one installed font; keep the first */
    const q = (GENERIC.has(n) ? n : '"' + n + '"') + ', sans-serif';
    ctx.font = '400 40px ' + q; const s4 = ctx.measureText('Rag jumps 1234 & 骨直次あ한').width;
    ctx.font = '700 40px ' + q; const s7 = ctx.measureText('Rag jumps 1234').width;
    ctx.clearRect(0, 0, 64, 64); ctx.font = '400 28px ' + q; ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic'; ctx.fillText('骨a', 2, 30);
    const px = ctx.getImageData(0, 0, 64, 40).data; let hsum = 0;
    for (let i = 3; i < px.length; i += 4) hsum = (hsum * 31 + px[i]) % 1000003;
    const sig = s4.toFixed(2) + '|' + s7.toFixed(2) + '|' + hsum;
    if (sigs.has(sig) && n !== 'sans-serif') continue;
    sigs.add(sig);
    const f = { n, c, w: [100, 200, 300, 400, 500, 600, 700, 800, 900], it: 1, tier: 0, sc: '', sys: true, cjk: !!cjk, label: label || n };
    FAM.set(n, f); sysFams.push(f);
  }
}
const famLabel = f => (f.label || f.n);
const nearW = (f, w) => f.w.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
/* a Latin face in front of a CJK face, the way pages and apps stack fonts for mixed 中英文 text */
function getComp(L, C) {
  const n = L.n + ' + ' + C.n;
  let f = FAM.get(n);
  if (!f) { f = { n, c: C.c, w: C.w, it: L.it, tier: 9, sc: '', sys: false, cjk: true, comp: true, stack: [L, C], label: famLabel(L) + ' + ' + famLabel(C) }; FAM.set(n, f); }
  return f;
}
function scriptOf(t) {
  if (/[\u3040-\u30ff]/.test(t)) return 'jp';
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(t)) return 'kr';
  if (/[\u3400-\u9fff\uf900-\ufaff]/.test(t)) return 'han';
  return 'latin';
}
function candidateFamilies(text, tierMax) {
  const sc = scriptOf(text), out = [];
  for (const f of sysFams) if (sc === 'latin' || f.cjk || f.custom) out.push(f);
  for (const f of FAM.values()) {
    if (f.sys) continue;
    if (sc === 'latin') { if (!f.sc && f.tier <= tierMax) out.push(f); }
    else if (sc === 'han') { if (f.sc === 'sc' || f.sc === 'tc') out.push(f); }
    else if (f.sc === sc) out.push(f);
  }
  return out;
}

/* ---------- web font loading (Google Fonts stylesheets, faces fetched on demand) ---------- */
const GF_BASE = 'https://fonts.googleapis.com/css2?';
const cssState = new Map();
function gfSpec(f, noItalic) {
  const n = f.n.replace(/ /g, '+');
  if (f.it && !noItalic) return n + ':ital,wght@' + f.w.map(w => '0,' + w).concat(f.w.map(w => '1,' + w)).join(';');
  if (f.w.length === 1 && f.w[0] === 400) return n;
  return n + ':wght@' + f.w.join(';');
}
function addCss(specs) {
  if (BUILD === 'pages') return Promise.resolve(false);     // the installable build contacts no other site; all its fonts are hosted alongside
  return new Promise(res => {
    const l = document.createElement('link');
    let done = false;
    const fin = ok => { if (done) return; done = true; clearTimeout(to); if (!ok) l.remove(); res(ok); };
    const to = setTimeout(() => fin(false), 20000);
    l.rel = 'stylesheet';
    l.href = GF_BASE + specs.map(s => 'family=' + s).join('&') + '&display=swap';
    l.onload = () => fin(true);
    l.onerror = () => fin(false);
    document.head.appendChild(l);
  });
}
/* the installable build hosts the fonts itself (and keeps downloaded packs on the device); Google Fonts only as a fallback */
function addSelfCss(f) {
  const sf = SELF_FONTS[f.n];
  return new Promise(res => {
    const l = document.createElement('link');
    let done = false;
    const fin = ok => { if (done) return; done = true; clearTimeout(to); if (!ok) l.remove(); res(ok); };
    const to = setTimeout(() => fin(false), 20000);
    l.rel = 'stylesheet'; l.href = 'fonts/' + sf.id + '/' + sf.id + '.css';
    l.onload = () => fin(true); l.onerror = () => fin(false);
    document.head.appendChild(l);
  });
}
function ensureCss(fams) {
  const flat = [];
  for (const f of fams) { if (f.stack) flat.push(...f.stack); else flat.push(f); }
  let need = [...new Set(flat)].filter(f => !f.sys && !cssState.has(f.n));
  for (const f of need) if (SELF_FONTS[f.n]) cssState.set(f.n, addSelfCss(f).then(ok => ok || addCss([gfSpec(f)])));
  need = need.filter(f => !SELF_FONTS[f.n]);
  for (let i = 0; i < need.length; i += 6) {
    const chunk = need.slice(i, i + 6);
    const p = addCss(chunk.map(f => gfSpec(f)));
    for (const f of chunk) {
      cssState.set(f.n, p.then(ok => ok || addCss([gfSpec(f)]).then(ok2 => ok2 || (f.it ? addCss([gfSpec(f, true)]) : false))));
    }
  }
  return Promise.all(fams.map(f => (f.stack ? Promise.all(f.stack.map(m => (m.sys ? true : cssState.get(m.n)))).then(a => a.every(Boolean)) : f.sys ? true : cssState.get(f.n))));
}
const faceState = new Map();
function ensureFace(c, text) {
  const f = c.fam;
  if (f.stack) return Promise.all(f.stack.map(m => ensureFace({ fam: m, weight: nearW(m, c.weight), italic: c.italic }, text))).then(a => a.every(Boolean));
  if (f.sys) return Promise.resolve(true);
  const it = c.italic && f.it;
  const key = f.n + '|' + c.weight + '|' + (it ? 1 : 0) + '|' + text;
  let p = faceState.get(key);
  if (!p) {
    p = ensureCss([f]).then(([ok]) => {
      if (!ok || !document.fonts || !document.fonts.load) return false;
      const spec = (it ? 'italic ' : '') + c.weight + ' 40px "' + f.n + '"';
      return Promise.race([
        document.fonts.load(spec, text).then(a => a.length > 0, () => false),
        new Promise(r => setTimeout(() => { faceState.delete(key); r(false); }, 30000))   // timed out: try again next time
      ]);
    });
    faceState.set(key, p);
    if (faceState.size > 6000) faceState.clear();
  }
  return p;
}
async function loadFaces(vars, text, onProg) {
  let done = 0;
  const total = vars.length;
  const oks = await Promise.all(vars.map(c => ensureFace(c, text).then(ok => { done++; if (onProg && (done % 6 === 0 || done === total)) onProg(done, total); return ok; })));
  return vars.filter((c, i) => oks[i]);
}

/* ---------- state ---------- */
const S = {
  sampleReady: Promise.resolve(),
  img: null, ictx: null, iw: 0, ih: 0, name: 'image', type: 'image/png', demo: false,
  view: { s: 1, tx: 0, ty: 0 }, vw: 0, vh: 0, dpr: 1,
  edit: null, undo: [], drag: null, pointers: new Map(), pinch: null, space: false,
  sample: null, downloads: null, lastFam: null, comparing: false, pdf: null, pic: null
};
const stage = $('stage'), vcan = $('view'), vctx = vcan.getContext('2d'), selEl = $('sel');

/* ---------- view ---------- */
let drawQueued = false;
function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); } }
function draw() {
  const { s, tx, ty } = S.view;
  vctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  vctx.clearRect(0, 0, S.vw, S.vh);
  if (S.img) {
    vctx.fillStyle = 'rgba(0,0,0,.4)';
    vctx.fillRect(tx + 2, ty + 3, S.iw * s, S.ih * s);
    vctx.imageSmoothingEnabled = s < 3;
    vctx.imageSmoothingQuality = 'high';
    vctx.drawImage(S.img, tx, ty, S.iw * s, S.ih * s);
  }
  placeSel();
}
function placeSel() {
  const r = S.drag && S.drag.rect ? S.drag.rect : S.edit ? S.edit.userRect : null;
  if (!r) { selEl.hidden = true; return; }
  const { s, tx, ty } = S.view;
  selEl.hidden = false;
  selEl.style.transform = 'translate(' + (tx + r.x * s) + 'px,' + (ty + r.y * s) + 'px)';
  selEl.style.width = Math.max(1, r.w * s) + 'px';
  selEl.style.height = Math.max(1, r.h * s) + 'px';
}
function resizeView() {
  const r = stage.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  const first = !S.vw;
  const cx = S.vw / 2, cy = S.vh / 2;
  S.dpr = Math.min(3, window.devicePixelRatio || 1);
  S.vw = r.width; S.vh = r.height;
  vcan.width = Math.round(r.width * S.dpr); vcan.height = Math.round(r.height * S.dpr);
  if (first || S.fitted) fitView(); else { S.view.tx += S.vw / 2 - cx; S.view.ty += S.vh / 2 - cy; }
  requestDraw();
}
function fitScale() { return Math.min((S.vw - 28) / S.iw, (S.vh - 28) / S.ih); }
function fitView() {
  if (!S.img || !S.vw) return;
  const s = Math.max(0.01, fitScale());
  S.view = { s, tx: (S.vw - S.iw * s) / 2, ty: (S.vh - S.ih * s) / 2 };
  S.fitted = true;
  requestDraw();
}
function zoomAt(px, py, f) {
  const v = S.view;
  const ns = clamp(v.s * f, Math.min(0.05, fitScale() * 0.5), 24);
  const k = ns / v.s;
  v.tx = px - (px - v.tx) * k; v.ty = py - (py - v.ty) * k; v.s = ns;
  S.fitted = false;
  requestDraw();
}
/* bring a rectangle of the picture into view, large enough to read */
function showRect(r) {
  if (!S.vw) return;
  const fit = Math.max(0.01, fitScale()), want = clamp(Math.min((0.7 * S.vw) / r.w, (0.2 * S.vh) / r.h), fit, Math.max(fit, 8));
  const s = S.view.s >= want * 0.6 && S.view.s <= want * 1.7 && r.w * S.view.s <= 0.9 * S.vw ? S.view.s : want;      // the zoom in use stays when it shows the spot well enough
  S.view = { s, tx: S.vw / 2 - (r.x + r.w / 2) * s, ty: S.vh * 0.45 - (r.y + r.h / 2) * s };
  S.fitted = false;
  requestDraw();
}
const toImg = (px, py) => ({ x: (px - S.view.tx) / S.view.s, y: (py - S.view.ty) / S.view.s });
function stagePt(e) { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

/* ---------- image loading ---------- */
async function loadBlob(blob, name) {
  if (isPdf(blob, name)) { await openPdf(blob, name); return; }
  let bmp;
  try { bmp = await createImageBitmap(blob); }
  catch (e) {
    bmp = await new Promise((res, rej) => { const im = new Image(); const u = URL.createObjectURL(blob); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); }; im.src = u; });
  }
  const k = Math.min(1, 4096 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  pdfClose();
  setImage(c, x, name || 'image', /jpe?g/i.test(blob.type) ? 'image/jpeg' : 'image/png', false);
  warmReader();
  if (k < 1) toast('图片很大，已缩小到最长边 4096 像素');
}
function setImage(c, x, name, type, demo) {
  dropEdit();
  S.img = c; S.ictx = x; S.iw = c.width; S.ih = c.height; S.name = name.replace(/\.[^.]+$/, ''); S.type = type; S.demo = demo;
  S.undo = []; $('btnUndo').disabled = true;
  $('stageNote').textContent = demo ? '示例图片 · 拖一个框，框住任意一处文字试试' : '';
  /* a picture of its own (not a page of a PDF) starts with nothing read and nothing looked for */
  if (!S.pdf) { S.pic = findNew(true); $('findIn').value = ''; }
  pdfFindInfo();
  fitView();
}

/* ---------- edit lifecycle ---------- */
function clampRect(r) {
  const x0 = clamp(Math.floor(r.x), 0, S.iw), y0 = clamp(Math.floor(r.y), 0, S.ih);
  const x1 = clamp(Math.ceil(r.x + r.w), 0, S.iw), y1 = clamp(Math.ceil(r.y + r.h), 0, S.ih);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function restoreLive() { const ed = S.edit; if (ed && ed.live) { S.ictx.putImageData(ed.live.before, ed.live.x, ed.live.y); ed.live = null; } }
function dropEdit() {
  if (S.edit) { S.edit.matchToken++; restoreLive(); }
  S.edit = null;
  $('pEdit').hidden = true; $('pIdle').hidden = false;
  requestDraw();
}
function analyzeEdit(ed, keepGrow) {
  const ur = ed.userRect;
  const pad = Math.round(Math.min(ur.w, ur.h) * 0.08) + 2;
  ed.rect = clampRect({ x: ur.x - pad, y: ur.y - pad, w: ur.w + 2 * pad, h: ur.h + 2 * pad });
  const img = S.ictx.getImageData(ed.rect.x, ed.rect.y, ed.rect.w, ed.rect.h);
  ed.an = analyzeRegion(img, keepGrow != null ? { grow: keepGrow } : null);
  if (S.pdf) pdfProtect(ed);
  ed.bands = findBands(ed.an.alpha, ed.an.w, ed.an.h, ed.origLines.length || 0);
}
function startEdit(userRect, keep) {
  const prev = S.edit;
  let carry = null;
  if (prev) {
    if (keep) carry = prev;
    else if (prev.newText && prev.newText !== prev.origText && prev.live) { commit('text', true); toast('上一处修改已应用，可以撤销'); }
    if (S.edit) { S.edit.matchToken++; restoreLive(); }
  }
  const ed = {
    userRect, rect: null, an: null, bands: [], origText: carry ? carry.origText : '', newText: carry ? carry.newText : '',
    origLines: carry ? carry.origLines : [], cands: [], fit: [], matchToken: 0, tier: carry ? carry.tier : 1, live: null, primary: 0, T2: null, userColor: false,
    find: carry ? carry.find : PDFS.findHit || null          // the occurrence of a searched text this edit is for
  };
  PDFS.findHit = null;
  S.edit = ed;
  analyzeEdit(ed, null);
  const b0 = ed.bands[0];
  ed.st = {
    fam: S.lastFam || FAM.get('sans-serif'), weight: 400, italic: false, px: b0 ? (b0.y1 - b0.y0) / 0.72 : ed.rect.h * 0.6,
    trEm: 0, color: ed.an.color.slice(), blur: 0, align: 'left', dx: 0, dy: 0, sizeAdj: 1, trAdj: 0, matched: false, geo: null, score: null
  };
  $('pIdle').hidden = true; $('pEdit').hidden = false;
  $('inOrig').value = ed.origText; $('inNew').value = ed.newText;
  autoRows($('inOrig')); autoRows($('inNew'));
  $('rngGrow').value = ed.an.grow; $('outGrow').textContent = ed.an.grow;
  renderCands();
  if (!ed.an.found) setStatus('框里没找到明显的文字。把框缩到只包住文字和底色再试。', true);
  else if (ed.origLines.length) { setStatus(''); scheduleMatch(0); }
  else readText(ed);
  computeFit(ed); refresh();
  if (S.demo) $('stageNote').textContent = '示例图片';
}

/* ---------- layout: where the old text sat, and where the new text goes ---------- */
function splitParts(t) {
  const lead = /^\s*/.exec(t)[0];
  const words = [], seps = [];
  const re = /(\S+)(\s*)/g;
  let m;
  while ((m = re.exec(t.slice(lead.length).replace(/\s+$/, '')))) { words.push(m[1]); if (m[2]) seps.push(m[2]); }
  return { lead, words, seps };
}
const cps = t => Array.from(t).length;
/* pen distance from the start of `word` to the start of the next word in ordinary typesetting */
function natStep(st, word, sep, px, tr) { return lineMetrics(st, word + sep, px).W + tr * (cps(word) + cps(sep)); }

/* One reference line: pen origin, baseline, total advance and, per word boundary, how much wider or narrower
   the original gap was than ordinary spacing (a column layout, doubled spaces, wide word spacing…). */
function lineRef(st, text, xs, words, oy, px, tr, band) {
  const ref = { oy, x0: xs[0], adv: 0, extras: [], extraMore: 0, inkL: band ? band.x0 : xs[0], inkR: band ? band.x1 : xs[0] };
  if (!words || xs.length < 2) {
    ref.adv = lineMetrics(st, text, px).W + tr * Math.max(0, cps(text) - 1);
    return ref;
  }
  const parts = splitParts(text), ex = [];
  for (let j = 0; j < words.length - 1; j++) ex.push(xs[j + 1] - xs[j] - natStep(st, words[j], parts.seps[j] || ' ', px, tr));
  const tol = Math.max(0.8, 0.02 * px), zero = Math.max(0.6, 0.015 * px);
  const med = ex.slice().sort((p, q) => p - q)[ex.length >> 1];
  if (ex.every(e => Math.abs(e - med) <= tol)) {
    const v = Math.abs(med) <= zero ? 0 : med;
    ref.extras = ex.map(() => v); ref.extraMore = v;
  } else ref.extras = ex.map(e => (Math.abs(e) <= zero ? 0 : Math.abs(e - med) <= tol ? med : e));
  const last = words[words.length - 1];
  ref.adv = xs[xs.length - 1] - xs[0] + lineMetrics(st, last, px).W + tr * (cps(last) - 1);
  return ref;
}
const plainRef = r => !r.extraMore && !r.extras.some(Boolean);

function computeFit(ed) {
  const st = ed.st, fit = [], bands = ed.bands, an = ed.an;
  if (!bands.length) {
    const r = ed.rect;
    fit.push({ oy: r.h * 0.72, x0: r.w * 0.1, adv: r.w * 0.8, extras: [], extraMore: 0, inkL: r.w * 0.1, inkR: r.w * 0.9 });
  } else if (ed.origLines.length && st.matched) {
    const tr = st.trEm * st.px;
    bands.forEach((b, i) => {
      const text = ed.origLines[Math.min(i, ed.origLines.length - 1)];
      let xs, words = null, oy;
      if (i === ed.primary && st.geo) { xs = st.geo.xs || [st.geo.ox]; words = st.geo.words || null; oy = st.geo.oy; }
      else {
        const m = lineMetrics(st, text, st.px);
        xs = [(b.x0 + b.x1) / 2 - (m.L + m.R + tr * Math.max(0, m.n - 1)) / 2 + m.L];
        oy = (b.y0 + b.y1) / 2 + (m.A - m.D) / 2;
        if (text.trim() && ed.origLines[i] != null) {
          setInk(an.color);
          const wr = wordRuns(an.alpha, an.w, an.h, b, text.trim().split(/\s+/).length - 1);
          const T = makeTarget(an.alpha, an.w, an.h, b, bands, Math.min(1, 150 / (b.y1 - b.y0)), wr && wr.odd ? wr.runs : null);
          const pl = placeLine(st, text, T, st.px, st.trEm);
          if (pl.iou > 0.3) { xs = pl.xs; words = pl.words; oy = pl.oy; }
        }
      }
      fit.push(lineRef(st, text, xs, words, oy, st.px, tr, b));
    });
    if (!st.alignUser) st.align = detectAlign(ed, fit);
  } else proxyFit(ed, fit);
  ed.fit = fit;
}

/* No original text to compare with: size and place the new text from the outline of the old one.
   If the new text fills about the same width at that size, it is treated as the same length and fitted to the old box exactly. */
function proxyFit(ed, fit) {
  const st = ed.st, bands = ed.bands, an = ed.an, b0 = bands[0];
  const lines = ed.newText.split('\n').map(t => t.trim()).filter(Boolean);
  let px = (b0.y1 - b0.y0) / 0.72, trEm = 0;
  if (lines.length) {
    /* Chinese, Japanese or Korean text needs a face that has those glyphs */
    if (scriptOf(lines[0]) !== 'latin' && !st.fam.cjk && !st.famUser) st.fam = FAM.get('sans-serif');
    const im = inkMetrics(st, lines[0]);
    if (im.A + im.D > 0.05) px = (b0.y1 - b0.y0) / (im.A + im.D);
    const natW = im.inkW * px, obsW = b0.x1 - b0.x0;
    if (im.gaps > 0 && obsW / natW > 0.86 && obsW / natW < 1.16) trEm = clamp((obsW - natW) / im.gaps / px, -0.06, 0.16);
    /* stroke thickness of the old text picks the weight */
    if (st.fam.sys && !st.weightUser && st.fam.w.length > 1) {
      const target = stemWidth(an.alpha, an.w, b0.x0, b0.y0, b0.x1, b0.y1);
      if (target > 0) {
        const m = lineMetrics(st, lines[0], px), cw = Math.ceil(m.L + m.R + 8), ch = Math.ceil(m.A + m.D + 8);
        let bw = st.weight, bd = 1e9;
        setInk(an.color);
        for (const w of st.fam.w.slice().sort((p, q) => Math.abs(p - 400) - Math.abs(q - 400))) {
          const cov = textCoverage({ fam: st.fam, weight: w, italic: st.italic }, [{ text: lines[0], ox: 4 + m.L, oy: 4 + m.A }], px, trEm * px, cw, ch, 0);
          const sw = stemWidth(cov, cw, 0, 0, cw, ch);
          const d = sw > 0 ? Math.abs(Math.log(sw / target)) : 9;
          if (d < bd - 1e-6) { bd = d; bw = w; }
        }
        st.weight = bw;
      }
    }
  }
  st.px = px; st.trEm = trEm;
  bands.forEach((b, i) => {
    const t = lines[Math.min(i, lines.length - 1)];
    if (t) { const m = lineMetrics(st, t, px); fit.push({ oy: (b.y0 + b.y1) / 2 + (m.A - m.D) / 2, x0: b.x0 + m.L, adv: b.x1 - b.x0, extras: [], extraMore: 0, inkL: b.x0, inkR: b.x1 }); }
    else fit.push({ oy: b.y1, x0: b.x0, adv: b.x1 - b.x0, extras: [], extraMore: 0, inkL: b.x0, inkR: b.x1 });
  });
}

/* How the old text was aligned: several lines tell by their edges; a single line by its margins inside
   whatever it sits on (a button, a card, the whole picture). Default is flush left, i.e. keep the indent. */
function detectAlign(ed, fit) {
  const st = ed.st;
  if (fit.length >= 2) {
    const tol = Math.max(2, 0.12 * st.px);
    const spread = a => Math.max.apply(null, a) - Math.min.apply(null, a);
    const L = fit.map(f => f.inkL), R = fit.map(f => f.inkR), C = fit.map(f => (f.inkL + f.inkR) / 2);
    /* lines of nearly equal width satisfy several alignments at once: take the tightest, left on a tie */
    const sL = Math.min(spread(L), fit.length >= 3 ? spread(L.slice(1)) : 1e9), sC = spread(C), sR = spread(R);
    const m = Math.min(sL, sC, sR);
    if (m > tol || sL <= m + 0.75) return 'left';
    return sC <= sR ? 'center' : 'right';
  }
  const b = ed.bands[0], r = ed.rect;
  if (!b || !S.ictx) return 'left';
  const had = ed.live;
  if (had) S.ictx.putImageData(had.before, had.x, had.y);
  const xl = r.x + b.x0, xr = r.x + b.x1, ml = [], mr = [];
  for (const f of [0.3, 0.5, 0.7]) {
    const y = clamp(Math.round(r.y + b.y0 + (b.y1 - b.y0) * f), 0, S.ih - 1);
    const row = S.ictx.getImageData(0, y, S.iw, 1).data;
    const walk = (x, dir) => {
      let cur = x + dir * 2, n = 2;
      if (cur < 0 || cur >= S.iw) return Math.max(0, dir < 0 ? x : S.iw - 1 - x);
      let r0 = row[cur * 4], g0 = row[cur * 4 + 1], b0 = row[cur * 4 + 2];
      for (cur += dir; cur >= 0 && cur < S.iw; cur += dir, n++) {
        const p = cur * 4;
        if (Math.abs(row[p] - r0) + Math.abs(row[p + 1] - g0) + Math.abs(row[p + 2] - b0) > 42) break;
        r0 += (row[p] - r0) * 0.1; g0 += (row[p + 1] - g0) * 0.1; b0 += (row[p + 2] - b0) * 0.1;
      }
      return n;
    };
    ml.push(walk(xl - 1, -1)); mr.push(walk(xr, 1));
  }
  if (had) S.ictx.putImageData(had.after, had.x, had.y);
  ml.sort((p, q) => p - q); mr.sort((p, q) => p - q);
  const a = ml[1], c = mr[1], tw = xr - xl, cw = a + tw + c;
  return Math.abs(a - c) <= Math.max(2.5, 0.035 * cw) && Math.min(a, c) >= 0.6 * st.px && tw <= 0.78 * cw ? 'center' : 'left';
}

/* New text, line by line: same pen origin (indent), baseline, size and tracking as the line it replaces;
   the gaps between words reuse what the original had at the same place. Same-length text therefore lands where the old text was. */
function layoutNew(ed) {
  const st = ed.st;
  const txt = ed.newText.length ? ed.newText : ed.origText;
  if (!txt.trim()) return [];
  const lines = txt.split('\n'), fit = ed.fit, out = [];
  const px = st.px * st.sizeAdj, tr = (st.trEm + st.trAdj) * px;
  const pitch = fit.length > 1 ? (fit[fit.length - 1].oy - fit[0].oy) / (fit.length - 1) : px * 1.3;
  lines.forEach((text, j) => {
    if (!text.trim()) return;
    const ri = Math.min(j, fit.length - 1), ref = fit[ri], oy = ref.oy + (j - ri) * pitch + st.dy;
    const runs = [];
    let adv;
    if (plainRef(ref)) {
      runs.push({ text, x: 0 });
      adv = lineMetrics(st, text, px).W + tr * Math.max(0, cps(text) - 1);
    } else {
      const parts = splitParts(text);
      let x = parts.lead ? lineMetrics(st, parts.lead, px).W + tr * cps(parts.lead) : 0;
      parts.words.forEach((wd, i) => {
        runs.push({ text: wd, x });
        if (i < parts.words.length - 1) x += natStep(st, wd, parts.seps[i], px, tr) + (i < ref.extras.length ? ref.extras[i] : ref.extraMore) * st.sizeAdj;
      });
      const last = parts.words[parts.words.length - 1];
      adv = x + lineMetrics(st, last, px).W + tr * (cps(last) - 1);
    }
    const shift = st.align === 'center' ? (ref.adv - adv) / 2 : st.align === 'right' ? ref.adv - adv : 0;
    for (const r of runs) {
      const m = lineMetrics(st, r.text || ' ', px);
      out.push({ text: r.text, ox: ref.x0 + r.x + shift + st.dx, oy, m, inkR: m.R + tr * Math.max(0, m.n - 1) });
    }
  });
  return out;
}

/* build the patch: repaired background + new text. Reads the clean image. */
function compose(ed, mode) {
  const { rect, an, st } = ed;
  const lines = mode === 'erase' ? [] : layoutNew(ed);
  const px = st.px * st.sizeAdj, tr = (st.trEm + st.trAdj) * px;
  const padT = Math.ceil(st.blur * 3) + 3;
  let x0 = 0, y0 = 0, x1 = rect.w, y1 = rect.h;
  for (const l of lines) {
    x0 = Math.min(x0, l.ox - l.m.L - padT); x1 = Math.max(x1, l.ox + l.inkR + padT);
    y0 = Math.min(y0, l.oy - l.m.A - padT); y1 = Math.max(y1, l.oy + l.m.D + padT);
  }
  const wr = clampRect({ x: rect.x + x0, y: rect.y + y0, w: x1 - x0, h: y1 - y0 });
  const base = S.ictx.getImageData(wr.x, wr.y, wr.w, wr.h), bd = base.data;
  const ox = rect.x - wr.x, oy = rect.y - wr.y;
  for (let y = 0; y < an.h; y++) {
    for (let x = 0; x < an.w; x++) {
      const i = y * an.w + x;
      if (!an.hole[i]) continue;
      const p = ((y + oy) * wr.w + x + ox) * 4;
      bd[p] = an.bR[i]; bd[p + 1] = an.bG[i]; bd[p + 2] = an.bB[i];
    }
  }
  let cov = null;
  if (lines.length) {
    setInk(st.color);
    cov = textCoverage(st, lines.map(l => ({ text: l.text, ox: l.ox + ox, oy: l.oy + oy })), px, tr, wr.w, wr.h, 0, !!S.pdf);
    if (st.blur > 0.05) cov = gaussBlur(cov, wr.w, wr.h, st.blur);
    const cr = st.color[0], cg = st.color[1], cb = st.color[2];
    for (let i = 0, p = 0; i < cov.length; i++, p += 4) {
      const a = cov[i];
      if (a < 0.004) continue;
      bd[p] += (cr - bd[p]) * a; bd[p + 1] += (cg - bd[p + 1]) * a; bd[p + 2] += (cb - bd[p + 2]) * a;
    }
  }
  return { x: wr.x, y: wr.y, w: wr.w, h: wr.h, data: base, cov };
}

function renderLive() {
  const ed = S.edit;
  if (!ed) return;
  restoreLive();
  /* nothing is touched until there is a real change: no blanking on selection, no redraw of identical text */
  if (!ed.newText.trim() || ed.newText === ed.origText) { requestDraw(); return; }
  const out = compose(ed, 'text');
  const before = S.ictx.getImageData(out.x, out.y, out.w, out.h);
  S.ictx.putImageData(out.data, out.x, out.y);
  ed.live = { x: out.x, y: out.y, before, after: out.data };
  requestDraw();
}
function commit(mode, quiet) {
  const ed = S.edit;
  if (!ed) return;
  ed.matchToken++;
  restoreLive();
  const out = compose(ed, mode);
  const before = S.ictx.getImageData(out.x, out.y, out.w, out.h);
  S.ictx.putImageData(out.data, out.x, out.y);
  /* on a PDF page: what the edit replaced and how the new text is set, so that saving can write it into the file as text */
  S.undo.push({ x: out.x, y: out.y, data: before, after: out.data, pdf: S.pdf ? pdfEditInfo(ed, mode, out) : null });
  if (S.undo.length > 60 && !S.pdf) S.undo.shift();      // every edit of a PDF page is needed to write it back
  PDFS.out = null;
  $('btnUndo').disabled = false;
  S.lastFam = ed.st.fam;
  S.edit = null;
  $('pEdit').hidden = true; $('pIdle').hidden = false;
  const left = pdfFindApplied(ed, mode);
  if (!quiet) toast(mode === 'erase' ? '已擦除。可以继续框选' : left > 0 ? '已应用。查找的文字还剩 ' + left + ' 处没改' : left === 0 ? '已应用。查找到的几处都改完了' : '已应用。可以继续框选其它文字');
  requestDraw();
}
function undo() {
  if (S.edit) { dropEdit(); return; }
  const u = S.undo.pop();
  if (!u) return;
  S.ictx.putImageData(u.data, u.x, u.y);
  PDFS.out = null;
  $('btnUndo').disabled = !S.undo.length;
  pdfFindInfo();
  requestDraw();
}

/* ---------- matching ---------- */
let matchTimer = 0;
function scheduleMatch(delay) { clearTimeout(matchTimer); matchTimer = setTimeout(() => runMatch(), delay); }
function setStatus(t, warn) { const el = $('matchStatus'); el.textContent = t || ''; el.classList.toggle('warn', !!warn); }
const vkey = c => c.fam.n + '|' + c.weight + '|' + (c.italic ? 1 : 0);

async function runMatch() {
  const ed = S.edit;
  if (!ed || !ed.an.found) return;
  const token = ++ed.matchToken;
  const stale = () => S.edit !== ed || ed.matchToken !== token;
  const lines = ed.origLines;
  ed.bands = findBands(ed.an.alpha, ed.an.w, ed.an.h, lines.length || 0);
  if (!lines.length || !ed.bands.length) { ed.st.matched = false; computeFit(ed); refresh(); return; }
  let pi = 0, bestN = -1;
  lines.forEach((t, i) => { if (i < ed.bands.length) { const n = t.replace(/\s/g, '').length; if (n > bestN) { bestN = n; pi = i; } } });
  const text = lines[pi], band = ed.bands[pi], an = ed.an;
  ed.primary = pi; ed.primaryText = text;
  const H = band.y1 - band.y0;
  const slant = estimateSlant(an.alpha, an.w, an.h, band);
  const fams = candidateFamilies(text, ed.tier);
  /* a PDF names its fonts: the family of that name (or its open look-alike) is tried even when it is not in the short list */
  const hint = ed.pdfHint && ed.ocr && ed.ocr.tier === 'pdf' ? ed.pdfHint : null;
  const hinted = c => !!hint && (hint.fams.includes(c.fam) || (c.fam.stack || []).some(f => hint.fams.includes(f)));
  if (hint) for (const f of hint.fams) if (!fams.includes(f)) fams.push(f);
  /* and the PDF's own font, when the whole selection is set in one */
  if (ed.pdfFam && ed.ocr && ed.ocr.tier === 'pdf' && !fams.includes(ed.pdfFam)) fams.unshift(ed.pdfFam);
  setInk(an.color);
  setStatus('正在载入字体…');
  await ensureCss(fams);
  if (stale()) return;
  let vars = [];
  for (const f of fams) {
    for (const w of new Set([nearW(f, 400), nearW(f, 700)])) {
      vars.push({ fam: f, weight: w, italic: false });
      if (slant) vars.push({ fam: f, weight: w, italic: true });
    }
  }
  vars = await loadFaces(vars, text, (d, t) => { if (!stale()) setStatus('正在载入候选字体 ' + d + ' / ' + t + (d < t ? '（首次较慢）' : '')); });
  if (!stale()) setStatus('正在比对字体…');
  if (stale()) return;
  /* unusual gaps between words (columns, wide word spacing): anchor every word to where it sits.
     If that reading fits badly (the gaps were misjudged), fall back to treating the line as one run. */
  const wr = wordRuns(an.alpha, an.w, an.h, band, text.trim().split(/\s+/).length - 1);
  const pass = async runs => {
    const T1 = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 48 / H), runs);
    const buf = new Uint8Array(T1.tw * T1.th);
    let res = [];
    const run1 = async list => {
      for (let i = 0; i < list.length; i++) {
        const r = stage1(list[i], text, T1, buf);
        if (r) res.push({ c: list[i], score: r.score, iou: r.iou });
        if (i % 80 === 79) { await tick(); if (stale()) return false; }
      }
      return true;
    };
    if (!(await run1(vars))) return null;
    res.sort((a, b) => b.score - a.score);
    /* text that was read automatically may differ from the picture in small ways the reader cannot see
       (full-width or half-width yen sign, a dropped space). Try those spellings on the leading faces and keep the one that fits best. */
    if (!ed.varDone && ed.ocr && ed.origText === ed.ocr.text && lines.length === 1 && res.length && (!runs || res[0].iou >= 0.45)) {
      ed.varDone = true;
      const local = ed.ocr.tier === 'local';
      /* the built-in reader measures dashes and dots itself; there the look-alike table would only undo that */
      const vs = textVariants(text, ed.ocr.maybe), slots = alikeSlots(text).filter(sl => !local || !/[-–—－一·•・.]/.test(Array.from(text)[sl.i]));
      /* the built-in reader also names its runners-up for characters it was not sure of */
      for (const q of ed.ocr.slots || []) {
        const have = slots.find(sl => sl.i === q.i);
        if (have) { for (const a of q.alts) if (!have.alts.includes(a)) have.alts.push(a); }
        else if (slots.length < 10) slots.push({ i: q.i, alts: q.alts.slice() });
      }
      if (vs.length || slots.length) {
        const Ts = runs ? makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 48 / H), null) : T1;
        const top = res.slice(0, 20).map(r => r.c), sb = new Uint8Array(Ts.tw * Ts.th);
        const scoreOf = t => { let m = -1; for (const c of top) { const r = stage1(c, t, Ts, sb); if (r && r.score > m) m = r.score; } return m; };
        const base = scoreOf(text);
        let bv = null, bs = base;
        for (const v of vs) {
          await loadFaces(top, v.t);
          if (stale()) return null;
          const sc = scoreOf(v.t);
          if (sc > base + v.margin && sc > bs) { bs = sc; bv = v.t; }
        }
        /* look-alike characters (dashes, yen signs, middle dots): best alternative at each place, then the lot together */
        if (slots.length) {
          const cur = Array.from(bv || text), start = bv ? bs : base;
          let any = false;
          for (const sl of slots) {
            if (cur.length !== Array.from(text).length) break;      // a space was just inserted: positions no longer line up
            let bestCh = null, bsc = start + (local ? 0.02 : 0.01);
            for (const alt of sl.alts) {
              const arr = cur.slice(); arr[sl.i] = alt;
              const v = arr.join('');
              await loadFaces(top, v);
              if (stale()) return null;
              const sc = scoreOf(v);
              if (sc > bsc) { bsc = sc; bestCh = alt; }
            }
            if (bestCh) { cur[sl.i] = bestCh; any = true; }
          }
          if (any && !bv) { const v = cur.join(''); await loadFaces(top, v); if (stale()) return null; if (scoreOf(v) > base + 0.008) bv = v; }
        }
        if (bv) return { retext: bv };
      }
    }
    const lead = [];
    for (const r of res) { if (!lead.includes(r.c.fam)) lead.push(r.c.fam); if (lead.length >= 10) break; }
    const have = new Set(res.map(r => vkey(r.c)));
    let extra = [];
    for (const f of lead) for (const w of f.w) for (const it of slant ? [false, true] : [false]) {
      const c = { fam: f, weight: w, italic: it };
      if (!have.has(vkey(c))) extra.push(c);
    }
    extra = await loadFaces(extra, text);
    if (stale()) return null;
    if (!(await run1(extra))) return null;
    res.sort((a, b) => b.score - a.score);

    /* mixed 中英文: a Latin face stacked in front of a CJK face, the way pages and apps set such text.
       CJK glyphs are all one em wide, so the Latin face can be chosen first against any CJK face. */
    if (scriptOf(text) !== 'latin' && /[A-Za-z0-9]/.test(text)) {
      const c0 = res.find(r => !r.c.fam.comp);
      const lat = candidateFamilies('a', ed.tier).filter(f => !f.cjk);
      const cjk = fams.filter(f => !f.custom && !f.pdf);
      if (c0) {
        await ensureCss(lat);
        if (stale()) return null;
        const prog = (d, t) => { if (!stale()) setStatus('正在比对中英文字体组合 ' + d + ' / ' + t); };
        const n0 = res.length;
        const scoreNew = async list => { const k = res.length; if (!(await run1(await loadFaces(list, text, prog)))) return null; return res.slice(k).sort((a, b) => b.score - a.score); };
        // 1. Latin face, with the best CJK face held fixed
        let list = [];
        for (const L of lat) for (const w of new Set([nearW(c0.c.fam, 400), nearW(c0.c.fam, 700), c0.c.weight])) list.push({ fam: getComp(L, c0.c.fam), weight: w, italic: c0.c.italic });
        let got = await scoreNew(list);
        if (!got || stale()) return null;
        const topL = [];
        for (const r of got) { const L = r.c.fam.stack[0]; if (!topL.some(t => t.L === L)) topL.push({ L, w: r.c.weight }); if (topL.length >= 3) break; }
        // 2. CJK face behind each leading Latin face
        list = [];
        for (const t of topL) for (const C of cjk) if (C !== c0.c.fam) list.push({ fam: getComp(t.L, C), weight: nearW(C, t.w), italic: c0.c.italic });
        got = await scoreNew(list);
        if (!got || stale()) return null;
        // 3. every weight of the leading pairs
        const pairs = [];
        const seenS = [];
        for (const r of res.slice(n0).sort((a, b) => b.score - a.score)) {
          if (pairs.includes(r.c.fam) || seenS.some(v => Math.abs(v - r.score) < 1e-7)) continue;
          seenS.push(r.score); pairs.push(r.c.fam);
          if (pairs.length >= 5) break;
        }
        const have2 = new Set(res.map(r => vkey(r.c)));
        list = [];
        for (const f of pairs) for (const w of f.w) { const c = { fam: f, weight: w, italic: c0.c.italic }; if (!have2.has(vkey(c))) list.push(c); }
        got = await scoreNew(list);
        if (!got || stale()) return null;
        for (let i = n0; i < res.length; i++) res[i].score -= 0.012;
        res.sort((a, b) => b.score - a.score);
      }
    }
    let T2 = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 150 / H), runs);
    let T2c = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 26 / H), runs);
    const top = [], perFam = new Map(), seenIou = [];
    for (const r of res) {
      const k = perFam.get(r.c.fam) || 0;
      if (k >= 3) continue;
      if (seenIou.some(v => Math.abs(v - r.iou) < 1e-7)) continue;
      seenIou.push(r.iou);
      perFam.set(r.c.fam, k + 1); top.push(r.c);
      if (top.length >= 10) break;
    }
    if (hint && !top.some(hinted)) { const r = res.find(q => hinted(q.c)); if (r) top.push(r.c); }
    if (ed.pdfFam && !top.some(c => c.fam === ed.pdfFam)) { const r = res.find(q => q.c.fam === ed.pdfFam); if (r) top.push(r.c); }
    const refined = [];
    const refine = c => { const r = refineCand(c, text, T2, T2c); if (r) { if (c.fam.comp) r.score -= 0.012; if (hinted(c)) r.score += 0.012; if (c.fam.pdf) r.score += 0.03; refined.push(r); } };   // the file's own font wins a near tie with its look-alikes
    for (let i = 0; i < top.length; i++) { refine(top[i]); if (i % 3 === 2) { await tick(); if (stale()) return null; } }
    refined.sort((a, b) => b.score - a.score);
    /* the neighbouring weights of the winner, in case the first pass ranked them poorly */
    if (refined.length) {
      const b0 = refined[0], done = new Set(refined.map(vkey));
      const ws = b0.fam.w, wi = ws.indexOf(b0.weight);
      for (const w of [ws[wi - 1], ws[wi + 1]]) {
        if (w == null) continue;
        const c = { fam: b0.fam, weight: w, italic: b0.italic };
        if (done.has(vkey(c)) || !(await ensureFace(c, text))) continue;
        if (stale()) return null;
        refine(c);
      }
      refined.sort((a, b) => b.score - a.score);
    }
    /* words were anchored one by one but the spacing turned out ordinary: fit the winner once more as one run, which is more exact */
    if (runs && refined.length) {
      const b0 = refined[0];
      if (plainRef(lineRef(b0, text, b0.xs, b0.words, b0.oy, b0.px, b0.trEm * b0.px, band))) {
        const S2 = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 150 / H), null);
        const S2c = makeTarget(an.alpha, an.w, an.h, band, ed.bands, Math.min(1, 26 / H), null);
        const r2 = refineCand(b0, text, S2, S2c);
        if (r2 && r2.iou >= b0.iou - 0.02) { r2.score = b0.score; refined[0] = r2; T2 = S2; T2c = S2c; }
      }
    }
    /* the PDF's own font needs no fitting: the file says where its glyphs sit */
    if (ed.pdfFam && ed.ocr && ed.ocr.tier === 'pdf') {
      const ex = pdfExact(ed, text, T2);
      if (ex) {
        for (let k = refined.length - 1; k >= 0; k--) if (refined[k].fam === ed.pdfFam) refined.splice(k, 1);
        refined.push(ex);
        refined.sort((a, b) => b.score - a.score);
      }
    }
    return { res, refined, T1, T2, T2c };
  };
  let out = await pass(wr && wr.odd ? wr.runs : null);
  if (!out) return;
  const retext = t => {
    const mirror = !ed.newText || ed.newText === ed.origText;
    ed.ocr.text = t;
    if (mirror) { ed.newText = ''; $('inNew').value = ''; }
    setOrig(t, true);
  };
  if (out.retext) { retext(out.retext); return; }
  if (wr && wr.odd && (!out.refined.length || out.refined[0].iou < 0.8)) {
    const o2 = await pass(null);
    if (!o2) return;
    if (o2.retext) { retext(o2.retext); return; }
    if (o2.refined.length && (!out.refined.length || o2.refined[0].iou > out.refined[0].iou)) out = o2;
  }
  const { res, refined, T1, T2 } = out;
  ed.T2 = out.T2; ed.T2c = out.T2c;
  const list = [], seen = new Set(), seenI = [];
  for (const r of refined) { if (seen.has(r.fam)) continue; seen.add(r.fam); list.push(r); }
  for (const r of res) {
    if (list.length >= 10) break;
    if (seen.has(r.c.fam) || seenI.some(v => Math.abs(v - r.iou) < 1e-7)) continue;
    seen.add(r.c.fam); seenI.push(r.iou);
    list.push({ fam: r.c.fam, weight: r.c.weight, italic: r.c.italic, iou: r.iou, score: r.score, rough: true });
  }
  ed.cands = list;
  if (!refined.length) { setStatus('没能比对出字体，可以在“微调”里手动选。', true); renderCands(); return; }
  /* for a PDF, a font that can be put into the file keeps the new text real text, a device font makes it a picture:
     the former is taken when it fits nearly as well */
  let best = refined[0];
  if (S.pdf && BUILD === 'pages' && !best.fam.pdf) {
    const fits = async r => !r.fam.pdf && pdfEmbeddable(r.fam) && !(await pdfUncovered(r.fam, r.weight, r.italic, ed.origText));
    if (!(await fits(best))) for (const r of refined) if (r !== best && r.score >= best.score - 0.1 && (await fits(r))) { best = r; break; }
    if (stale()) return;
  }
  adopt(best, true);
  pdfFontFor(ed);
  if (ed.ocr && !ed.ocr.reread && ed.origText === ed.ocr.text) {
    const gs = glyphScores(best, text, ed.T2, best).map(g => g.iou).sort((p, q) => p - q);
    const med = gs.length ? gs[gs.length >> 1] : 1;
    const dev = gs.map(v => Math.abs(v - med)).sort((p, q) => p - q), mad = dev.length ? dev[dev.length >> 1] : 0;
    /* one character far below the rest, or a poor fit overall: ask the stronger model once */
    const oddChar = gs.length >= 2 && gs[0] < 0.8 && gs[0] < med - Math.max(0.15, 4 * mad);
    if (S.sample && (oddChar || best.iou < 0.68)) { ed.ocr.reread = true; ed.ocr.auto = true; recognize('default'); }
    else if (oddChar || (ed.ocr.tier === 'local' && best.iou < 0.68)) ed.ocr.doubt = true;
  }
  if (ed.ocr && ed.ocr.doubt && !S.sample) { ed.ocr.doubt = false; setStatus(ed.ocr.reread && ed.ocr.tier === 'local' ? '这段字读得没把握，已填上最接近的结果，请核对改正。' : '有的字可能读错了，请核对上面的原文字。', true); }
  else if (best.iou < 0.55) setStatus('没找到很接近的字体。可以在“微调”里手动选，或上传字体文件。', true);
  else setStatus(ed.tier < 2 && scriptOf(text) === 'latin' && best.iou < 0.8 ? '不够像的话，“微调”里可以在更多字体里再找一遍。' : best.fam.pdf && ed.st.fam === best.fam ? '用的是 PDF 自带的字体，和原文一致。' : ed.pdfAlt ? $('matchStatus').textContent : hint ? 'PDF 里这段字写的字体名是 ' + hint.label + '。' : '', !!ed.pdfAlt);
  pdfFontNote(ed);
  renderCands();
}

function adopt(r, auto) {
  const ed = S.edit, st = ed.st;
  st.fam = r.fam; st.weight = r.weight; st.italic = r.italic;
  st.px = r.px; st.trEm = r.trEm; st.geo = { ox: r.ox, oy: r.oy, xs: r.xs, words: r.words }; st.score = r.iou; st.matched = true;
  if (auto) { st.blur = Math.round(r.blur * 20) / 20; st.sizeAdj = 1; st.trAdj = 0; st.dx = 0; st.dy = 0; }
  computeFit(ed); refresh();
}
async function chooseFont(fam, weight, italic) {
  const ed = S.edit;
  if (!ed) return;
  const c = { fam, weight: nearW(fam, weight), italic: !!italic };
  const text = ed.primaryText || ed.newText || ed.origText || 'Aa';
  setStatus('正在载入 ' + famLabel(fam) + '…');
  const ok = await ensureFace(c, (ed.origText + ed.newText) || text);
  if (S.edit !== ed) return;
  if (!ok) { setStatus('这款字体没能载入，换一款试试。', true); refresh(); return; }
  setStatus('');
  let r = null;
  setInk(ed.an.color);
  if (ed.T2 && ed.primaryText) r = refineCand(c, ed.primaryText, ed.T2, ed.T2c);
  if (r) adopt(r, false);
  else { const st = ed.st; st.fam = fam; st.weight = c.weight; st.italic = c.italic; st.score = null; computeFit(ed); refresh(); }
  renderCands();
}

/* ---------- panel rendering ---------- */
function refresh() {
  const ed = S.edit;
  if (!ed) return;
  const st = ed.st;
  renderLive();
  const px = st.px * st.sizeAdj;
  $('mFont').textContent = famLabel(st.fam) + (st.italic ? ' 斜体' : '');
  $('mFont').title = famLabel(st.fam);
  $('mWeight').textContent = st.weight;
  $('mSize').textContent = px.toFixed(1) + 'px';
  $('mColor').textContent = rgbHex(st.color);
  $('mSwatch').style.background = rgbHex(st.color);
  const sc = $('mScore');
  sc.textContent = st.score == null ? '—' : Math.round(st.score * 100) + '%';
  sc.className = 'num' + (st.score == null ? '' : st.score >= 0.8 ? ' ok' : st.score < 0.6 ? ' low' : '');
  const sp = $('specSample'), tx = $('specText');
  sp.style.background = rgbHex(ed.an.bgColor);
  tx.textContent = encT(st.fam, (ed.newText || ed.origText || 'Aa 文字 123').split('\n')[0]);
  tx.style.cssText = 'font-family:' + famCss(st.fam) + ';font-weight:' + (st.fam.pdf ? st.fam.pdf.fw : st.weight) + ';font-style:' + (st.fam.pdf ? st.fam.pdf.fs : st.italic ? 'italic' : 'normal') +
    ';color:' + rgbHex(st.color) + ';letter-spacing:' + (st.trEm + st.trAdj).toFixed(4) + 'em';
  // controls
  const sf = $('selFamily');
  if (sf.options.length < 2) buildFamilySelect();
  let cur = $('optCur');
  if (st.fam.comp) {
    if (!cur) { cur = document.createElement('option'); cur.id = 'optCur'; sf.insertBefore(cur, sf.firstChild); }
    cur.value = st.fam.n; cur.textContent = famLabel(st.fam);
  } else if (cur) cur.remove();
  sf.value = st.fam.n;
  const sw = $('selWeight');
  const want = st.fam.w.join(',');
  if (sw.dataset.w !== want) { sw.dataset.w = want; sw.innerHTML = st.fam.w.map(w => '<option value="' + w + '">' + w + '</option>').join(''); }
  sw.value = st.weight;
  $('chkItalic').checked = st.italic;
  if (document.activeElement !== $('numSize')) $('numSize').value = px.toFixed(1);
  if (document.activeElement !== $('numTrack')) $('numTrack').value = Math.round((st.trEm + st.trAdj) * 1000);
  $('inColor').value = rgbHex(st.color).toLowerCase();
  if (document.activeElement !== $('inHex')) $('inHex').value = rgbHex(st.color);
  for (const b of document.querySelectorAll('[data-align]')) b.setAttribute('aria-pressed', b.dataset.align === st.align ? 'true' : 'false');
  $('outNudge').textContent = st.dx.toFixed(1).replace('.0', '') + ', ' + st.dy.toFixed(1).replace('.0', '');
  $('rngBlur').value = st.blur; $('outBlur').textContent = st.blur.toFixed(2).replace(/0$/, '');
  $('btnMore').hidden = ed.tier >= 2 || scriptOf(ed.origText || 'a') !== 'latin';
  $('btnOcr').textContent = ed.origText ? '重读' : '识别';
  $('btnOcr').hidden = false;
  for (const ch of $('cands').children) ch.setAttribute('aria-pressed', ch.dataset.fam === st.fam.n ? 'true' : 'false');
}
function renderCands() {
  const ed = S.edit, box = $('cands');
  box.textContent = '';
  if (!ed || !ed.cands.length) return;
  const sample = (ed.primaryText || 'Aa').slice(0, 14);
  for (const r of ed.cands.slice(0, 10)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.fam = r.fam.n;
    b.setAttribute('aria-pressed', r.fam === ed.st.fam ? 'true' : 'false');
    const s = document.createElement('span'); s.className = 's'; s.textContent = encT(r.fam, sample);
    s.style.cssText = 'font-family:' + famCss(r.fam) + ';font-weight:' + (r.fam.pdf ? r.fam.pdf.fw : r.weight) + ';font-style:' + (r.fam.pdf ? r.fam.pdf.fs : r.italic ? 'italic' : 'normal');
    const m = document.createElement('span'); m.className = 'm';
    const n = document.createElement('span'); n.textContent = famLabel(r.fam) + ' ' + r.weight;
    const p = document.createElement('span'); p.className = 'num'; p.textContent = Math.round(r.iou * 100) + '%';
    m.append(n, p); b.append(s, m);
    b.onclick = () => { if (r.rough) chooseFont(r.fam, r.weight, r.italic); else { adopt(r, false); renderCands(); } };
    box.appendChild(b);
  }
}
function buildFamilySelect() {
  const sf = $('selFamily');
  sf.textContent = '';
  const groups = [['这份 PDF 自带的字体', f => !!f.pdf], ['本机字体', f => f.sys && !f.custom && !f.pdf], ['已上传', f => f.custom], ['中文', f => !f.sys && (f.sc === 'sc' || f.sc === 'tc')],
    ['无衬线', f => !f.sys && !f.sc && f.c === 's'], ['衬线', f => !f.sys && !f.sc && f.c === 'r'], ['等宽', f => !f.sys && !f.sc && f.c === 'm'],
    ['手写', f => !f.sys && !f.sc && f.c === 'h'], ['展示', f => !f.sys && !f.sc && f.c === 'd'], ['日文', f => f.sc === 'jp'], ['韩文', f => f.sc === 'kr']];
  const all = [...FAM.values()].filter(f => !f.comp);
  for (const [label, test] of groups) {
    const list = all.filter(test);
    if (!list.length) continue;
    const og = document.createElement('optgroup'); og.label = label;
    if (!list[0].sys) list.sort((a, b) => a.n.localeCompare(b.n));
    for (const f of list) { const o = document.createElement('option'); o.value = f.n; o.textContent = famLabel(f); og.appendChild(o); }
    sf.appendChild(og);
  }
}
function autoRows(t) { t.rows = clamp(t.value.split('\n').length, 1, 4); }
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200); }

/* ---------- text inputs ---------- */
let composing = false;
function setOrig(v, fromOcr) {
  const ed = S.edit;
  if (!ed) return;
  ed.origText = v;
  ed.origLines = v.split('\n').map(s => s.trim()).filter(Boolean);
  if (fromOcr) { $('inOrig').value = v; autoRows($('inOrig')); if (!ed.newText) { ed.newText = pdfFindRepl(ed) || v; $('inNew').value = ed.newText; autoRows($('inNew')); } }
  if (ed.origLines.length) scheduleMatch(fromOcr ? 0 : 550);
  else { ed.matchToken++; ed.st.matched = false; ed.st.score = null; ed.cands = []; renderCands(); computeFit(ed); refresh(); setStatus('输入原文字后，自动比对字体。'); }
}
$('inOrig').addEventListener('compositionstart', () => { composing = true; });
$('inOrig').addEventListener('compositionend', e => { composing = false; setOrig(e.target.value); });
$('inOrig').addEventListener('input', e => { autoRows(e.target); if (!composing) setOrig(e.target.value); });
$('inNew').addEventListener('input', e => {
  autoRows(e.target);
  const ed = S.edit;
  if (!ed) return;
  ed.newText = e.target.value;
  pdfFontFor(ed);
  pdfCoverNote(ed);
  if (!ed.st.matched && ed.an.found) {
    computeFit(ed);
    if (!ed.origLines.length && ed.newText.trim() && !/正在/.test($('matchStatus').textContent)) setStatus('没有原文字：大小和位置按旧字的外框估算。填上原文字可比对出字体。');
  }
  refresh();
});

/* ---------- reading the text with Claude (optional capability) ---------- */
const OCR_PROMPT = 'The attached image is a crop from a larger picture, shown on a plain frame. It contains one short piece of text ' +
  '(Chinese, English, digits, or a mix; one or several lines). Transcribe exactly what is written, character by character: ' +
  'keep capitalisation, digits, symbols and punctuation as they appear (full-width punctuation stays full-width); ' +
  'do not translate, correct, complete or guess words that are not there. ' +
  'Put one space wherever two parts of a line are separated by a clearly visible gap, and none between adjacent Chinese characters. ' +
  'Separate lines with \\n. Reply with only JSON of the form {"text": "..."}; if nothing is readable reply {"text": ""}.';
/* the box with some margin, enlarged so a line of text is about 100px tall, on a frame that is never a thin strip */
function ocrCrop(ed) {
  const u = ed.userRect, an = ed.an;
  const src = clampRect({ x: u.x - u.h * 0.3 - 4, y: u.y - u.h * 0.2 - 4, w: u.w + u.h * 0.6 + 8, h: u.h + u.h * 0.4 + 8 });
  const hs = ed.bands.map(b => b.y1 - b.y0).sort((p, q) => p - q);
  const lineH = hs.length ? hs[hs.length >> 1] : src.h * 0.6;
  const k = Math.min(clamp(100 / lineH, 0.4, 6), 1400 / src.w, 1400 / src.h);
  const cw = Math.max(8, Math.round(src.w * k)), ch = Math.max(8, Math.round(src.h * k));
  const W = Math.max(cw + 64, 360), H = Math.max(ch + 64, 240, Math.round(W / 5));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = rgbHex(an.bgColor); x.fillRect(0, 0, W, H);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  restoreLive();
  x.drawImage(S.img, src.x, src.y, src.w, src.h, Math.round((W - cw) / 2), Math.round((H - ch) / 2), cw, ch);
  renderLive();
  return new Promise(res => c.toBlob(res, 'image/png'));
}
/* Read the original text of a fresh selection. Inside Claude the viewer's own Claude reads it; anywhere else
   (a shared link in a browser) the page's own reader does, entirely on the device. */
/* force: the user pressed 识别/重读 — retry a reader that failed to start, overwrite what is in the field,
   and when the reader is unsure, still put its best guess there for the user to correct */
async function readText(ed, force) {
  /* a PDF page knows its own text: no reading needed, and no guessing */
  const pr = S.pdf ? pdfReadEdit(ed) : null;
  if (pr && (force || !ed.origText)) {
    const mirror = !ed.newText || ed.newText === ed.origText;
    ed.ocr = { tier: 'pdf', text: pr.text, reread: true };
    ed.varDone = true; ed.pdfHint = pr.hint; ed.pdfFam = pr.fam; ed.pdfLines = pr.lines; ed.pdfAlt = false;
    if (mirror) { ed.newText = ''; $('inNew').value = ''; }
    setOrig(pr.text, true);
    return;
  }
  await Promise.race([S.sampleReady, new Promise(r => setTimeout(r, 1500))]);
  if (S.edit !== ed) return;
  if (S.sample) { recognize('quick'); return; }
  const fail = () => setStatus('页面自带的识别没能启动（' + (OCR.err || '未知原因') + '）。可以再点一次“识别”重试，或手动输入原文字。', true);
  if (OCR.failed) {
    if (!force) { if (!ed.origText) fail(); return; }
    OCR.p = null; OCR.failed = false; OCR.err = '';
  }
  $('btnOcr').disabled = true;
  try {
    const r = await readLocal(ed);
    if (S.edit !== ed) return;
    const untouched = force || !ed.origText || (ed.ocr && ed.origText === ed.ocr.text);
    const guess = force && r && !r.text && r.raw ? r.raw : '';
    if (guess) {
      const mirror = !ed.newText || ed.newText === ed.origText;
      ed.ocr = { tier: 'local', text: guess, reread: true, conf: r.conf, maybe: [], slots: [], doubt: true };
      ed.varDone = false;
      if (mirror) { ed.newText = ''; $('inNew').value = ''; }
      setOrig(guess, true);
      setStatus('这段字读得没把握，已填上最接近的结果，请核对改正后再继续。', true);
    } else if (r && r.text && untouched && (force || r.text !== ed.origText)) {
      const mirror = !ed.newText || ed.newText === ed.origText;
      ed.ocr = { tier: 'local', text: r.text, reread: false, conf: r.conf, maybe: r.maybe, slots: r.slots };
      ed.varDone = false;
      if (mirror) { ed.newText = ''; $('inNew').value = ''; }
      setOrig(r.text, true);
    } else if (!ed.origText) {
      if (OCR.failed) fail();
      else setStatus(r && r.raw ? '这段字页面自带的识别读不准（多半是手写体或艺术字）。请在上面手动输入原文字。' : '没读出文字，请手动输入原文字。', true);
    } else setStatus('');
  } finally { $('btnOcr').disabled = false; refresh(); }
}

async function recognize(tier) {
  const ed = S.edit;
  if (!ed || !S.sample) return;
  tier = tier || 'quick';
  const blob = await ocrCrop(ed);
  if (!blob || S.edit !== ed) return;
  setStatus(tier === 'quick' ? '正在识别框里的文字…' : '正在用更强的模型重读，稍等…');
  $('btnOcr').disabled = true;
  try {
    const out = await S.sample.json(OCR_PROMPT, { images: [blob], modelTier: tier, cache: tier === 'quick' });
    if (S.edit !== ed) return;
    const text = out && typeof out.text === 'string' ? out.text.replace(/\r/g, '').split('\n').map(t => t.trim()).filter(Boolean).join('\n') : '';
    const untouched = !ed.origText || (ed.ocr && ed.origText === ed.ocr.text);   // empty, or still exactly what was read before
    if (!text) { if (!ed.origText) setStatus('没认出文字，请手动输入原文字。', true); else setStatus(''); }
    else if (untouched && text !== ed.origText) {
      const mirror = !ed.newText || ed.newText === ed.origText;
      const again = !!ed.origText;
      ed.ocr = { tier, text, reread: tier !== 'quick' || !!(ed.ocr && ed.ocr.reread) };
      if (mirror) { ed.newText = ''; $('inNew').value = ''; }
      setOrig(text, true);
      if (again) toast('重读后改了原文字，请核对');
    } else {
      if (ed.ocr) ed.ocr.reread = ed.ocr.reread || tier !== 'quick';
      const auto = ed.ocr && ed.ocr.auto;
      if (ed.ocr) ed.ocr.auto = false;
      setStatus(tier === 'quick' || auto ? '' : '重读结果和刚才一样。原文字不对的话，直接改上面的输入框。');
    }
  } catch (e) {
    if (S.edit !== ed) return;
    const code = e && e.code;
    if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled' || code === 'capability_removed' || code === 'images_unavailable') {
      S.sample = null;
      if (!ed.origText) { readText(ed); return; }
      setStatus('');
    } else if (code === 'rate_limited') setStatus('识别次数暂时用完了，请手动输入原文字。', true);
    else if (!ed.origText) setStatus('识别没成功，请手动输入原文字，或点“识别”再试。', true);
    else setStatus('');
  } finally { $('btnOcr').disabled = false; }
}

/* ---------- pointer interactions ---------- */
function handleRect(d, p) {
  const r0 = d.start, q = toImg(p.x, p.y);
  let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
  if (d.h[1] === 'w') x0 = q.x; else x1 = q.x;
  if (d.h[0] === 'n') y0 = q.y; else y1 = q.y;
  return normRect(x0, y0, x1, y1);
}
function normRect(x0, y0, x1, y1) {
  const ax = clamp(Math.min(x0, x1), 0, S.iw), bx = clamp(Math.max(x0, x1), 0, S.iw);
  const ay = clamp(Math.min(y0, y1), 0, S.ih), by = clamp(Math.max(y0, y1), 0, S.ih);
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}
function warmReader() { if (!S.sample && !OCR.p) Promise.race([S.sampleReady, new Promise(r => setTimeout(r, 1500))]).then(() => { if (!S.sample) ocrLoad(); }); }
stage.addEventListener('pointerdown', e => {
  if (!S.img || e.target.closest('.zoom')) return;
  warmReader();
  if (e.pointerType === 'mouse' && e.button === 2) return;
  try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const p = stagePt(e);
  S.pointers.set(e.pointerId, p);
  if (S.pointers.size === 2) {
    const [a, b] = [...S.pointers.values()];
    S.drag = null;
    S.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    requestDraw();
    return;
  }
  if (S.pointers.size > 2) return;
  const h = e.target.dataset && e.target.dataset.h;
  if (h && S.edit) S.drag = { type: 'resize', h, start: { ...S.edit.userRect }, rect: { ...S.edit.userRect }, moved: false };
  else if (e.button === 1 || S.space) { S.drag = { type: 'pan', lx: p.x, ly: p.y }; stage.classList.add('panning'); }
  else { const q = toImg(p.x, p.y); S.drag = { type: 'new', sx: p.x, sy: p.y, ix: q.x, iy: q.y, rect: null, moved: false }; }
  e.preventDefault();
});
stage.addEventListener('pointermove', e => {
  if (!S.pointers.has(e.pointerId)) return;
  const p = stagePt(e);
  S.pointers.set(e.pointerId, p);
  if (S.pinch && S.pointers.size >= 2) {
    const [a, b] = [...S.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    S.view.tx += mx - S.pinch.mx; S.view.ty += my - S.pinch.my;
    zoomAt(mx, my, d / S.pinch.d);
    S.pinch = { d, mx, my };
    return;
  }
  const d = S.drag;
  if (!d) return;
  if (d.type === 'pan') { S.view.tx += p.x - d.lx; S.view.ty += p.y - d.ly; d.lx = p.x; d.ly = p.y; S.fitted = false; requestDraw(); }
  else if (d.type === 'new') {
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) < 6) return;
    d.moved = true;
    const q = toImg(p.x, p.y);
    d.rect = normRect(d.ix, d.iy, q.x, q.y);
    requestDraw();
  } else if (d.type === 'resize') { d.moved = true; d.rect = handleRect(d, p); requestDraw(); }
});
function endPointer(e) {
  if (!S.pointers.has(e.pointerId)) return;
  S.pointers.delete(e.pointerId);
  if (S.pinch) { if (S.pointers.size < 2) S.pinch = null; return; }
  const d = S.drag;
  S.drag = null;
  stage.classList.remove('panning');
  if (!d) return;
  if ((d.type === 'new' || d.type === 'resize') && d.moved && d.rect && e.type !== 'pointercancel') {
    const r = d.rect, s = S.view.s;
    if (r.w >= 5 && r.h >= 5 && r.w * s >= 12 && r.h * s >= 10) { startEdit(r, d.type === 'resize'); return; }
  }
  requestDraw();
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('wheel', e => { if (!S.img) return; e.preventDefault(); const p = stagePt(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); }, { passive: false });
stage.addEventListener('contextmenu', e => e.preventDefault());
$('zIn').onclick = () => zoomAt(S.vw / 2, S.vh / 2, 1.4);
$('zOut').onclick = () => zoomAt(S.vw / 2, S.vh / 2, 1 / 1.4);
$('zFit').onclick = fitView;

/* ---------- controls ---------- */
$('btnOpen').onclick = () => $('fileInput').click();
$('fileInput').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { await loadBlob(f, f.name); } catch (err) { toast(isPdf(f, f.name) ? '这个 PDF 打不开' : '这张图片打不开，换一张 PNG 或 JPG 试试'); }
};
$('btnUndo').onclick = undo;
$('btnCancel').onclick = dropEdit;
$('btnApply').onclick = () => {
  const ed = S.edit;
  if (!ed) return;
  if (!ed.newText.trim()) { toast('先在“新文字”里输入要换成的内容'); $('inNew').focus(); return; }
  if (ed.newText === ed.origText) { toast('新文字和原文字一样，改一下再应用'); $('inNew').focus(); return; }
  commit('text');
};
$('btnErase').onclick = () => commit('erase');
$('btnOcr').onclick = () => {
  const ed = S.edit;
  if (!ed) return;
  if (!S.sample) { readText(ed, true); return; }
  if (!ed.origText) { readText(ed); return; }
  ed.ocr = { tier: 'manual', text: ed.origText, reread: true };
  recognize('default');
};
$('btnMore').onclick = () => { if (S.edit) { S.edit.tier = 2; scheduleMatch(0); } };
{
  const b = $('btnCompare');
  const on = e => { e.preventDefault(); const ed = S.edit; if (!ed || !ed.live || S.comparing) return; S.comparing = true; b.classList.add('held'); S.ictx.putImageData(ed.live.before, ed.live.x, ed.live.y); requestDraw(); };
  const off = () => { const ed = S.edit; if (!S.comparing) return; S.comparing = false; b.classList.remove('held'); if (ed && ed.live) S.ictx.putImageData(ed.live.after, ed.live.x, ed.live.y); requestDraw(); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') on(e); });
  b.addEventListener('keyup', off);
}
$('selFamily').onchange = e => { const f = FAM.get(e.target.value); if (f && S.edit) { S.edit.st.famUser = true; chooseFont(f, S.edit.st.weight, S.edit.st.italic); } };
$('selWeight').onchange = e => { if (S.edit) { S.edit.st.weightUser = true; chooseFont(S.edit.st.fam, +e.target.value, S.edit.st.italic); } };
$('chkItalic').onchange = e => { if (S.edit) chooseFont(S.edit.st.fam, S.edit.st.weight, e.target.checked); };
$('numSize').oninput = e => { const v = parseFloat(e.target.value); if (S.edit && v > 0) { S.edit.st.sizeAdj = v / S.edit.st.px; refresh(); } };
$('numTrack').oninput = e => { const v = parseFloat(e.target.value); if (S.edit && isFinite(v)) { S.edit.st.trAdj = v / 1000 - S.edit.st.trEm; refresh(); } };
for (const b of document.querySelectorAll('[data-step]')) b.onclick = () => {
  const ed = S.edit; if (!ed) return;
  const st = ed.st, d = +b.dataset.d;
  if (b.dataset.step === 'size') { const px = Math.max(1, Math.round((st.px * st.sizeAdj + d * 0.5) * 2) / 2); st.sizeAdj = px / st.px; }
  else st.trAdj = (Math.round((st.trEm + st.trAdj) * 200 + d) / 200) - st.trEm;
  refresh();
};
$('inColor').oninput = e => { const c = hexRgb(e.target.value); if (S.edit && c) { S.edit.st.color = c; S.edit.userColor = true; refresh(); } };
$('inHex').oninput = e => { const c = hexRgb(e.target.value); if (S.edit && c) { S.edit.st.color = c; S.edit.userColor = true; refresh(); } };
for (const b of document.querySelectorAll('[data-align]')) b.onclick = () => { if (S.edit) { S.edit.st.align = b.dataset.align; S.edit.st.alignUser = true; refresh(); } };
for (const b of document.querySelectorAll('[data-nx]')) b.onclick = () => { if (S.edit) { S.edit.st.dx += +b.dataset.nx * 0.5; S.edit.st.dy += +b.dataset.ny * 0.5; refresh(); } };
$('rngBlur').oninput = e => { if (S.edit) { S.edit.st.blur = +e.target.value; refresh(); } };
$('rngGrow').oninput = e => {
  const ed = S.edit; if (!ed) return;
  restoreLive();
  analyzeEdit(ed, +e.target.value);
  $('outGrow').textContent = e.target.value;
  refresh();
};
$('btnFont').onclick = () => $('fontInput').click();
$('fontInput').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const name = f.name.replace(/\.[^.]+$/, '').replace(/["\\]/g, '').slice(0, 60) || '上传字体';
    const face = new FontFace(name, await f.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    const fam = { n: name, c: 's', w: [400, 700], it: 1, tier: 0, sc: '', sys: true, cjk: true, custom: true, label: name };
    FAM.set(name, fam); if (!sysFams.includes(fam)) sysFams.push(fam);
    buildFamilySelect();
    if (S.edit) chooseFont(fam, S.edit.st.weight, S.edit.st.italic);
    toast('已加入字体：' + name);
  } catch (err) { toast('这个字体文件读不了，请用 TTF、OTF 或 WOFF2'); }
};

/* ---------- saving ---------- */
async function save() {
  if (!S.img) return;
  if (S.pdf) { pdfSave(); return; }
  $('sheetTitle').textContent = '保存图片'; $('saveNote').textContent = '修改后的图片请合法使用，后果由使用者自负。'; $('sheetHow').textContent = '长按下面的图片选“存储到照片”；电脑上右键选“图片另存为”。';
  $('pdfOpts').hidden = true; $('sheetImg').parentElement.hidden = false; $('sheetShare').textContent = '存到相册 / 分享'; $('sheetLink').textContent = '直接下载';
  if (S.edit && S.edit.live) commit('text', true);
  const findLeft = pdfFindLeft();
  if (findLeft > 0) $('saveNote').textContent += ' 提醒：查找的“' + S.pic.find.q + '”还有 ' + findLeft + ' 处没改。';
  const jpg = S.type === 'image/jpeg';
  const blob = await new Promise(res => S.img.toBlob(res, S.type, jpg ? 0.95 : undefined));
  if (!blob) { toast('生成图片失败'); return; }
  const filename = (S.name || 'image') + '-改字.' + (jpg ? 'jpg' : 'png');
  if (S.downloads) {
    try { await S.downloads.save({ filename, data: blob }); toast('已保存'); return; }
    catch (e) { if (e && e.code === 'declined') return; }
  }
  const url = URL.createObjectURL(blob);
  /* phones: the share sheet saves straight to Photos */
  const file = typeof File === 'function' ? new File([blob], filename, { type: blob.type }) : null;
  let share = false;
  try { share = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { share = false; }
  $('sheetShare').hidden = !share;
  $('sheetShare').onclick = () => { navigator.share({ files: [file], title: filename }).catch(() => {}); };
  $('sheetImg').src = url;
  /* a direct link only works when the page is opened on its own, not inside a viewer frame */
  $('sheetLink').hidden = window.self !== window.top;
  $('sheetLink').href = url; $('sheetLink').download = filename;
  $('sheet').hidden = false;
}
$('btnSave').onclick = save;
$('sheetClose').onclick = () => { $('sheet').hidden = true; const u = $('sheetImg').src; $('sheetImg').removeAttribute('src'); if (u) URL.revokeObjectURL(u); };

/* ---------- keyboard, paste, drop ---------- */
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('privSheet').hidden) $('privClose').click(); else if (!$('offSheet').hidden) $('offClose').click(); else if (!$('sheet').hidden) $('sheetClose').click(); else if (S.edit) dropEdit(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && S.edit) { e.preventDefault(); commit('text'); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing()) { e.preventDefault(); undo(); }
  else if (e.key === ' ' && !typing() && e.target === document.body) { S.space = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => { if (e.key === ' ') S.space = false; });
window.addEventListener('paste', e => {
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (const it of items) if (it.kind === 'file' && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); loadBlob(f, '粘贴的图片').catch(() => toast('这张图片打不开')); } return; }
});
stage.addEventListener('dragover', e => { e.preventDefault(); $('dropHint').hidden = false; });
stage.addEventListener('dragleave', () => { $('dropHint').hidden = true; });
stage.addEventListener('drop', e => {
  e.preventDefault(); $('dropHint').hidden = true;
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && (f.type.startsWith('image/') || (BUILD === 'pages' && isPdf(f, f.name)))) loadBlob(f, f.name).catch(() => toast('这个文件打不开'));
});

/* ---------- offline fonts (installable build only) ----------
   在线: fonts come from this site as needed. 离线: whole packs are kept on the device (Cache Storage) and the
   service worker answers from there, so matching works with no network. Switching back to 在线 deletes them. */
const OFF = { cache: 'overwrite-fonts', busy: null, sel: { latin: true, sc: true, cjk: false, pdf: true } };
const offKey = 'overwrite.offline';
function offState() { try { return JSON.parse(localStorage.getItem(offKey)) || { mode: 'online', packs: {} }; } catch (e) { return { mode: 'online', packs: {} }; } }
function offSave(st) { try { localStorage.setItem(offKey, JSON.stringify(st)); } catch (e) { /* private mode: state lives for this visit only */ } }
const mb = b => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(0.1, b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + ' MB');
function offLabel() {
  const st = offState(), have = Object.keys(FONT_PACKS).filter(k => st.packs[k] === 'done');
  if (st.mode !== 'offline' || !have.length) return '在线加载';
  return '离线 · ' + have.map(k => FONT_PACKS[k].name.replace('字体', '')).join('、');
}
async function offStore() {
  let t = '';
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      t = '本机已用 ' + mb(e.usage || 0) + (e.quota ? '，浏览器允许约 ' + mb(e.quota) : '');
    }
  } catch (e) { t = ''; }
  $('offStore').textContent = t;
}
function offRender() {
  const st = offState(), off = st.mode === 'offline';
  $('modeOnline').setAttribute('aria-checked', String(!off)); $('modeOffline').setAttribute('aria-checked', String(off));
  $('offDesc').textContent = off
    ? '选好字体包下载到这台设备，之后不联网也能比对字体。没下载的字体会跳过，只用已下载的和手机自带的字体。'
    : '字体用到哪款才从网上加载，不占手机空间，需要联网。识别和改字本身不用联网。';
  const list = $('packList');
  list.textContent = '';
  if (off) for (const k of Object.keys(FONT_PACKS)) {
    const p = FONT_PACKS[k], s = st.packs[k], busy = OFF.busy && OFF.busy.k === k;
    const row = document.createElement('label'); row.className = 'pack';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = s === 'done' || (!!OFF.sel[k] && s !== 'done'); cb.disabled = s === 'done' || !!OFF.busy;
    cb.onchange = () => { OFF.sel[k] = cb.checked; offRender(); };
    const b = document.createElement('b'); b.textContent = p.name;
    const right = document.createElement('span');
    if (s === 'done') { const d = document.createElement('button'); d.type = 'button'; d.className = 'del'; d.textContent = '删除'; d.disabled = !!OFF.busy; d.onclick = e => { e.preventDefault(); offDelete([k]); }; right.appendChild(d); }
    const sm = document.createElement('small');
    sm.textContent = (p.fams ? p.fams + ' 款，约 ' : '打开 PDF 时用的字符表、标准字体和图像解码，约 ') + mb(p.bytes) + (s === 'done' ? ' · 已下载' : s === 'part' && !busy ? ' · 没下载完，可继续' : busy ? ' · 下载中 ' + Math.round(OFF.busy.frac * 100) + '%' : '');
    row.append(cb, b, right, sm);
    if (busy) { const bar = document.createElement('div'); bar.className = 'bar'; const i = document.createElement('i'); i.style.width = (OFF.busy.frac * 100).toFixed(1) + '%'; bar.appendChild(i); row.appendChild(bar); }
    list.appendChild(row);
  }
  const todo = Object.keys(FONT_PACKS).filter(k => OFF.sel[k] && st.packs[k] !== 'done');
  $('offGo').hidden = !off || (!todo.length && !OFF.busy);
  $('offGo').textContent = OFF.busy ? '停止' : '下载所选（约 ' + mb(todo.reduce((a, k) => a + FONT_PACKS[k].bytes, 0)) + '）';
  $('offlineState').textContent = offLabel();
  offStore();
}
async function offDownload() {
  const st = offState(), todo = Object.keys(FONT_PACKS).filter(k => OFF.sel[k] && st.packs[k] !== 'done');
  if (!todo.length || !('caches' in window)) { if (!('caches' in window)) toast('这个浏览器不支持离线保存'); return; }
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* best effort */ }
  let list;
  try { list = await (await fetch('fonts/packs.json', { cache: 'no-cache' })).json(); } catch (e) { toast('连不上网，没法下载字体包'); return; }
  const cache = await caches.open(OFF.cache), stop = { v: false };
  for (const k of todo) {
    const files = list[k].files, total = files.length;
    OFF.busy = { k, frac: 0, stop };
    st.packs[k] = 'part'; offSave(st); offRender();
    let done = 0, failed = 0, idx = 0;
    const worker = async () => {
      while (idx < files.length && !stop.v) {
        const url = new URL(files[idx++], document.baseURI).href;
        try {
          if (!(await cache.match(url))) {
            const r = await fetch(url, { cache: 'no-cache' });
            if (!r.ok) throw new Error(r.status);
            await cache.put(url, r);
          }
        } catch (e) { failed++; }
        done++;
        if (done % 25 === 0 || done === total) { OFF.busy.frac = done / total; offRender(); }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    if (stop.v) break;
    if (failed) { toast(FONT_PACKS[k].name + ' 有 ' + failed + ' 个文件没下载成功，可以再点下载继续'); break; }
    st.packs[k] = 'done'; offSave(st);
  }
  const stopped = stop.v;
  OFF.busy = null; offRender();
  if (!stopped && Object.keys(FONT_PACKS).every(k => !OFF.sel[k] || offState().packs[k] === 'done')) toast('字体包已存到本机，可以离线使用了');
}
async function offDelete(keys) {
  const st = offState();
  if (!('caches' in window)) return;
  const all = keys.length === Object.keys(FONT_PACKS).length;
  if (all) await caches.delete(OFF.cache);
  else {
    let list = null;
    try { list = await (await fetch('fonts/packs.json')).json(); } catch (e) { list = null; }
    const cache = await caches.open(OFF.cache);
    if (list) { for (const k of keys) await Promise.all(list[k].files.map(f => cache.delete(new URL(f, document.baseURI).href))); }
    else { await caches.delete(OFF.cache); keys = Object.keys(FONT_PACKS); }
  }
  for (const k of keys) delete st.packs[k];
  offSave(st); offRender();
}
function offInit() {
  if (BUILD !== 'pages') return;
  /* the app used to live at another address under another name: what it stored there cannot be used here */
  try { localStorage.removeItem('retext.offline'); if (window.caches) caches.keys().then(ks => ks.filter(k => k.startsWith('retext-')).forEach(k => caches.delete(k))).catch(() => {}); } catch (e) { /* storage unavailable */ }
  $('btnPrivacy').hidden = false;
  $('btnPrivacy').onclick = () => { $('privSheet').hidden = false; };
  $('privClose').onclick = () => { $('privSheet').hidden = true; };
  $('saveNote').hidden = false;
  $('btnOffline').hidden = false;
  $('offlineState').textContent = offLabel();
  $('btnOffline').onclick = () => { $('offSheet').hidden = false; offRender(); };
  $('offClose').onclick = () => { $('offSheet').hidden = true; };
  $('modeOffline').onclick = () => { const st = offState(); if (st.mode !== 'offline') { st.mode = 'offline'; offSave(st); } offRender(); };
  $('modeOnline').onclick = async () => {
    const st = offState();
    if (st.mode === 'online' || OFF.busy) return;
    const have = Object.keys(st.packs);
    if (have.length) {
      const size = have.reduce((a, k) => a + (FONT_PACKS[k] ? FONT_PACKS[k].bytes : 0), 0);
      if (!window.confirm('切回在线会删除已下载到本机的字体（约 ' + mb(size) + '）。删除吗？')) return;
      await offDelete(Object.keys(FONT_PACKS));
    }
    const s2 = offState(); s2.mode = 'online'; s2.packs = {}; offSave(s2); offRender();
    toast('已切回在线，本机字体已删除');
  };
  $('offGo').onclick = () => { if (OFF.busy) OFF.busy.stop.v = true; else offDownload(); };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
offInit();
pdfInit();

/* ---------- demo picture (clearly labelled as an example) ---------- */
async function makeDemo() {
  const D = [['Noto Serif SC', 900, '周末手作市集'], ['Noto Sans SC', 500, '11月21日—22日 · 10:00–18:00'], ['Noto Sans SC', 700, '门票 ¥25'],
    ['Oswald', 500, 'WEEKEND CRAFT MARKET'], ['Lora', 500, 'Handmade goods, coffee & live music', true]];
  const fams = [...new Set(D.map(d => FAM.get(d[0])).filter(Boolean))];
  await Promise.race([
    ensureCss(fams).then(() => Promise.all(D.map(d => (FAM.get(d[0]) ? ensureFace({ fam: FAM.get(d[0]), weight: d[1], italic: !!d[3] }, d[2]) : false)))),
    new Promise(r => setTimeout(r, 3500))
  ]);
  const c = document.createElement('canvas'); c.width = 1200; c.height = 760;
  const x = c.getContext('2d', { willReadFrequently: true });
  const g = x.createLinearGradient(0, 0, 1200, 760);
  g.addColorStop(0, '#0e4a5a'); g.addColorStop(1, '#13324a');
  x.fillStyle = g; x.fillRect(0, 0, 1200, 760);
  x.fillStyle = '#e9b44c'; x.beginPath(); x.arc(1010, 170, 120, 0, 6.2832); x.fill();
  x.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 7; i++) x.fillRect(80 + i * 150, 600, 90, 160);
  x.textBaseline = 'alphabetic';
  const F = (i, px) => { const d = D[i]; return (d[3] ? 'italic ' : '') + d[1] + ' ' + px + 'px "' + d[0] + '", ' + (i === 0 || i === 4 ? 'serif' : 'sans-serif'); };
  x.fillStyle = '#f4d58d'; x.font = F(3, 40); drawRun(x, D[3][2], 84, 150, 6, false);
  x.fillStyle = '#fffaf0'; x.font = F(0, 128); x.fillText(D[0][2], 80, 310);
  x.fillStyle = '#cfe8ef'; x.font = F(1, 46); x.fillText(D[1][2], 84, 410);
  x.fillStyle = '#e63946'; x.beginPath(); x.roundRect ? x.roundRect(84, 470, 300, 92, 14) : x.rect(84, 470, 300, 92); x.fill();
  x.fillStyle = '#ffffff'; x.font = F(2, 52); x.fillText(D[2][2], 116, 535);
  x.fillStyle = '#f4d58d'; x.font = F(4, 42); x.fillText(D[4][2], 84, 690);
  if (!S.img || S.demo) setImage(c, x, '示例图片', 'image/png', true);
}

/* ---------- boot ---------- */
function boot() {
  detectSystemFonts();
  new ResizeObserver(resizeView).observe(stage);
  resizeView();
  makeDemo();
  const cl = window.claude;
  if (cl && typeof cl.use === 'function') {
    cl.use('downloads').then(d => { S.downloads = d || null; }, () => {});
    S.sampleReady = cl.use('sample').then(async s => {
      if (!s) return;
      const lim = await s.limits().catch(() => null);
      if (!lim || !lim.images) return;
      S.sample = s;
    }, () => {});
  }
  $('btnOcr').hidden = false;
}
boot();
window.__app = { S, FAM, startEdit, setOrig, commit, loadBlob, setImage, refresh };
