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
