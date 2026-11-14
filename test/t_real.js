// Realistic test: text laid out by the browser's own text engine (not canvas), screenshotted, optionally JPEG-compressed,
// then edited in the app. Writes before/after contact sheets for eyeballing.
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const variant = process.argv[2] || 'png1';      // png1 | png2 | jpg
const filter = process.argv[3];
const SET = process.argv[4] || 'base';
const MIX = [
  { id: 'order', css: "font:500 24px Inter,'Noto Sans SC';color:#111827;", bg: '#ffffff', text: '订单 Order #2048 已发货', to: '订单 Order #3172 已签收', fam: 'Inter + Noto Sans SC', w: 500 },
  { id: 'sale', css: "font:700 30px Montserrat,'Noto Sans SC';color:#fff;", bg: 'linear-gradient(90deg,#be123c,#f97316)', text: '限时 SALE 5折起', to: '新品 NEW 8折起', fam: 'Montserrat + Noto Sans SC', w: 700 },
  { id: 'date', css: "font:400 22px 'Noto Serif SC';color:#3f3f46;", bg: '#fafaf9', text: '2026年11月21日 星期六', to: '2026年12月05日 星期六', fam: 'Noto Serif SC', w: 400 },
  { id: 'ver', css: "font:400 22px 'Roboto Mono','Noto Sans SC';color:#e5e7eb;", bg: '#1f2937', text: '版本 v2.4.1 更新说明', to: '版本 v3.0.0 发布说明', fam: 'Roboto Mono + Noto Sans SC', w: 400 },
  { id: 'tel', css: "font:400 20px 'Liberation Sans','Noto Sans CJK SC';color:#1e293b;", bg: '#f1f5f9', text: '联系电话 Tel: 312-555-0142', to: '客服热线 Tel: 312-555-0199', fam: 'Liberation Sans + Noto Sans CJK SC', w: 400 },
  { id: 'addr', css: 'font:400 20px Lato;color:#374151;', bg: '#ffffff', text: 'Chicago, IL 60606', to: 'Evanston, IL 60201', fam: 'Lato', w: 400 },
  { id: 'cn', css: "font:900 44px 'Noto Sans SC';color:#facc15;", bg: '#111827', text: '年终大促', to: '新春特惠', fam: 'Noto Sans SC', w: 900 }
];
const BGS = [
  { id: 'wood', css: 'font:700 40px Montserrat;color:#fff7e6;', bg: '#000', tex: 'wood', text: 'Fresh Coffee', to: 'Hot Chocolate', fam: 'Montserrat', w: 700 },
  { id: 'sky', css: "font:700 38px 'Noto Sans SC';color:#ffffff;", bg: '#000', tex: 'sky', text: '海边日落 Sunset', to: '山顶日出 Sunrise', fam: 'Noto Sans SC', w: 700 },
  { id: 'bokeh', css: "font:italic 700 42px 'Playfair Display';color:#ffe8a3;", bg: '#000', tex: 'bokeh', text: 'Golden Hour', to: 'Silver Night', fam: 'Playfair Display', w: 700 },
  { id: 'brick', css: 'font:400 44px Anton;color:#f8fafc;', bg: '#000', tex: 'brick', text: 'NO PARKING', to: 'STAFF ONLY', fam: 'Anton', w: 400 },
  { id: 'fabric', css: "font:500 30px 'Noto Serif SC';color:#2b2118;", bg: '#000', tex: 'fabric', text: '纯棉 100% Cotton', to: '亚麻 100% Linen', fam: 'Noto Serif SC', w: 500 },
  { id: 'paper', css: 'font:400 26px Lora;color:#3b2f2f;', bg: '#000', tex: 'paper', text: 'Invoice No. 00417', to: 'Invoice No. 00982', fam: 'Lora', w: 400 },
  { id: 'grad', css: 'font:800 46px Poppins;color:#0f172a;', bg: 'radial-gradient(circle at 20% 30%,#fde68a,#f472b6 60%,#7c3aed)', text: 'Summer 2026', to: 'Winter 2027', fam: 'Poppins', w: 800 }
];
const BASE = [
  { id: 'total', css: 'font:500 20px Roboto;color:#111;', bg: '#ffffff', text: 'Total due: $1,284.00', to: 'Total due: $2,460.50', fam: 'Roboto', w: 500 },
  { id: 'flash', css: 'font:800 48px Montserrat;color:#fff;', bg: 'linear-gradient(120deg,#1e3a8a,#7c3aed)', text: 'FLASH SALE', to: 'MEGA DEALS', fam: 'Montserrat', w: 800 },
  { id: 'since', css: 'font:italic 400 34px "Playfair Display";color:#5b3a29;', bg: '#f6efe2', text: 'Since 1987', to: 'Since 2003', fam: 'Playfair Display', w: 400 },
  { id: 'deliver', css: 'font:500 26px "Noto Sans SC";color:#333;', bg: '#f7f7f7', text: '预计明天 14:30 送达', to: '预计后天 09:00 送达', fam: 'Noto Sans SC', w: 500 },
  { id: 'price', css: 'font:700 40px "Noto Serif SC";color:#b22222;', bg: '#ffffff', text: '限时特惠 ¥199', to: '限时特惠 ¥259', fam: 'Noto Serif SC', w: 700 },
  { id: 'open', css: 'font:600 30px Oswald;color:#ffd166;', bg: 'photo', text: 'OPEN 24 HOURS', to: 'OPEN 9AM–9PM', fam: 'Oswald', w: 600 },
  { id: 'updated', css: 'font:400 13px Inter;color:#6b7280;', bg: '#ffffff', text: 'Last updated 2 hours ago', to: 'Last updated 5 minutes ago', fam: 'Inter', w: 400 },
  { id: 'mono', css: 'font:400 16px "Roboto Mono";color:#39ff14;', bg: '#0b0b0b', text: 'user@host:~$ ls -la', to: 'user@host:~$ cd /tmp', fam: 'Roboto Mono', w: 400 },
  { id: 'spaced', css: 'font:700 22px Lato;color:#222;letter-spacing:3px;', bg: '#e8f0fe', text: 'NEW ARRIVALS', to: 'BEST SELLERS', fam: 'Lato', w: 700 },
  { id: 'hello', css: 'font:600 36px Poppins;color:#111;', bg: '#ffd60a', text: 'Hello World', to: 'Goodbye Moon', fam: 'Poppins', w: 600 },
  { id: 'button', css: 'font:600 16px "Open Sans";color:#fff;', bg: '#15803d', text: 'Add to cart', to: 'Buy now', fam: 'Open Sans', w: 600, pad: '10px 22px', radius: 8 },
  { id: 'para', css: 'font:400 18px/1.5 Merriweather;color:#1f2937;', bg: '#fffdf5', text: 'Fresh bread every morning\nfrom our stone oven', to: 'Fresh pasta every evening\nfrom our own kitchen', fam: 'Merriweather', w: 400 },
  { id: 'script', css: 'font:700 44px "Dancing Script";color:#9d174d;', bg: '#fdf2f8', text: 'Happy Birthday', to: 'Merry Christmas', fam: 'Dancing Script', w: 700 },
  { id: 'kai', css: 'font:400 52px "Ma Shan Zheng";color:#1b1b1b;', bg: '#f3efe6', text: '厚德载物', to: '自强不息', fam: 'Ma Shan Zheng', w: 400 }
];
const CASES = SET === 'mix' ? MIX : SET === 'bg' ? BGS : BASE;
(async () => {
  const dsf = variant === 'png2' ? 2 : variant === 'jpg' ? 1.5 : 1;
  const { browser, ctx, page, logs } = await open({ dsf: 1 });
  // 1. lay the text out with the DOM engine in a second page
  const src = await ctx.browser().newContext({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: dsf });
  // reuse the font routes
  const { open: _o } = require('./harness');
  await browser.close();
  const h2 = await open({ viewport: { width: 900, height: 1400 }, dsf });
  const famW = new Map();
  for (const c of CASES) for (const f of c.fam.split(' + ')) { if (!famW.has(f)) famW.set(f, new Set()); famW.get(f).add(c.w); }
  const links = [...famW].filter(([f]) => !/Liberation|CJK/.test(f)).map(([f, ws]) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${f.replace(/ /g, '+')}:${/Playfair/.test(f) ? 'ital,wght@' + [...ws].sort().map(w => '1,' + w).join(';') : 'wght@' + [...ws].sort().join(';')}">`).join('');
  const blocks = CASES.map((c, i) => {
    const bg = c.bg === 'photo' ? 'radial-gradient(circle at 30% 40%,#5a4a3a,#1b1410 70%)' : c.bg;
    return `<div style="position:absolute;left:30px;top:${20 + i * 96}px;width:840px;height:88px;background:${bg};display:flex;align-items:center;padding-left:40px;box-sizing:border-box;overflow:hidden">
      ${c.tex ? `<canvas class="tex" data-tex="${c.tex}" width="${840 * dsf}" height="${88 * dsf}" style="position:absolute;left:0;top:0;width:840px;height:88px"></canvas>` : ''}
      <span id="${c.id}" style="position:relative;${c.css.replace(/"/g, "&quot;")}white-space:pre;display:inline-block;${c.pad ? 'padding:' + c.pad + ';border-radius:' + c.radius + 'px;background:' + c.bg + ';' : ''}">${c.text.replace(/\n/g, '<br>')}</span></div>`;
  }).join('');
  const sp = await h2.ctx.newPage();
  await sp.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8">${links}<style>body{margin:0;background:#d9dde3}</style></head><body>${blocks}
    ${SET === 'base' ? `<canvas id="nz" width="840" height="88" style="position:absolute;left:30px;top:${20 + 5 * 96}px;mix-blend-mode:overlay;opacity:.5"></canvas>` : '<canvas id="nz" width="1" height="1" style="display:none"></canvas>'}
    <script>
    (function(){
      let seed=3; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0; return seed/4294967296;};
      function fbm(w,h,oct,base){ const out=new Float32Array(w*h); let amp=1,tot=0; for(let o=0;o<oct;o++){ const cw=Math.max(2,Math.round(w/(base/Math.pow(2,o)))),ch=Math.max(2,Math.round(h/(base/Math.pow(2,o)))); const g=new Float32Array((cw+1)*(ch+1)); for(let i=0;i<g.length;i++)g[i]=rnd(); for(let y=0;y<h;y++){const fy=y/h*ch,y0=Math.floor(fy),ty=fy-y0,sy=ty*ty*(3-2*ty); for(let x=0;x<w;x++){const fx=x/w*cw,x0=Math.floor(fx),tx=fx-x0,sx=tx*tx*(3-2*tx); const a=g[y0*(cw+1)+x0],b=g[y0*(cw+1)+x0+1],c=g[(y0+1)*(cw+1)+x0],d=g[(y0+1)*(cw+1)+x0+1]; out[y*w+x]+=amp*((a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy);}} tot+=amp; amp*=0.5;} for(let i=0;i<out.length;i++)out[i]/=tot; return out; }
      for(const c of document.querySelectorAll('canvas.tex')){ const w=c.width,h=c.height,x=c.getContext('2d'),id=x.createImageData(w,h),d=id.data,t=c.dataset.tex; const S=w/840;
        const n1=fbm(w,h,5,120*S), n2=fbm(w,h,4,18*S);
        for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){ const i=y*w+xx,p=i*4; let r,g,b; const gr=(rnd()-0.5)*14;
          if(t==='wood'){ const v=Math.sin((y/S)*0.55+n1[i]*22+xx/S*0.01)*0.5+0.5; const k=0.55+0.45*v+ (n2[i]-0.5)*0.3; r=120*k+30; g=78*k+18; b=44*k+10; }
          else if(t==='sky'){ const k=y/h, c1=n1[i]; r=250-150*k+ (c1-0.5)*90; g=150-60*k+(c1-0.5)*70; b=90+90*k+(c1-0.5)*40; }
          else if(t==='bokeh'){ const k=n1[i]; r=30+40*k; g=22+30*k; b=50+60*k; }
          else if(t==='brick'){ const bh=22*S,bw=58*S,row=Math.floor(y/bh),off=(row%2)*bw/2,mx=((xx+off)%bw),my=y%bh; const mortar=mx<3*S||my<3*S; const k=0.75+ (n2[i]-0.5)*0.5 + ((Math.floor((xx+off)/bw)*7+row*13)%5)*0.03; if(mortar){r=g=b=168+(n2[i]-0.5)*40;}else{r=150*k;g=62*k;b=48*k;} }
          else if(t==='fabric'){ const wv=(Math.sin(xx/S*1.9)+Math.sin(y/S*1.9))*9; const k=n1[i]; r=214+wv+ (k-0.5)*20; g=200+wv+(k-0.5)*20; b=176+wv+(k-0.5)*20; }
          else { const dx=(xx/w-0.5),dy=(y/h-0.5),vg=1-0.5*(dx*dx+dy*dy); const k=n2[i]; r=(238+(k-0.5)*16)*vg; g=(229+(k-0.5)*16)*vg; b=(205+(k-0.5)*16)*vg; }
          d[p]=r+gr; d[p+1]=g+gr; d[p+2]=b+gr; d[p+3]=255; }
        x.putImageData(id,0,0);
        if(t==='bokeh'){ for(let k=0;k<26;k++){ const cx=rnd()*w,cy=rnd()*h,rr=(14+rnd()*30)*S; const gg=x.createRadialGradient(cx,cy,rr*0.2,cx,cy,rr); const hue=30+rnd()*40; gg.addColorStop(0,'hsla('+hue+',90%,70%,.55)'); gg.addColorStop(0.85,'hsla('+hue+',90%,60%,.4)'); gg.addColorStop(1,'hsla('+hue+',90%,60%,0)'); x.fillStyle=gg; x.beginPath(); x.arc(cx,cy,rr,0,6.3); x.fill(); } }
      }
    })();const c=document.getElementById('nz'),x=c.getContext('2d'),d=x.createImageData(840,88);let s=11;for(let i=0;i<840*88;i++){s=(s*1103515245+12345)&0x7fffffff;const v=(s>>9)%256;d.data[i*4]=d.data[i*4+1]=d.data[i*4+2]=v;d.data[i*4+3]=255}x.putImageData(d,0,0)</script></body></html>`);
  await sp.evaluate(() => document.fonts.ready);
  await sp.waitForTimeout(400);
  const rects = await sp.evaluate(() => Object.fromEntries([...document.querySelectorAll('span[id]')].map(s => { const r = s.getBoundingClientRect(); const st = getComputedStyle(s); return [s.id, { x: r.x, y: r.y, w: r.width, h: r.height, pl: parseFloat(st.paddingLeft), pt: parseFloat(st.paddingTop), ff: st.fontFamily }]; })));
  if (process.env.DBG) console.log('source fonts:', JSON.stringify(await sp.evaluate(cs => cs.map(c => { const s = document.getElementById(c.id); const ff = getComputedStyle(s).font; return [c.id, document.fonts.check(ff, c.text), [...document.fonts].filter(f => f.status === 'loaded').length, [...document.fonts].filter(f => f.status === 'error').length, [...document.fonts].filter(f => f.status === 'loading').length]; }), CASES)));
  const shot = await sp.screenshot({ type: 'png', fullPage: true });
  await sp.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'src-' + SET + '-' + variant + '.png'), shot);
  // 2. edit in the app
  const app = h2.page;
  await app.evaluate(async ({ b64, jpg }) => {
    let blob = await (await fetch('data:image/png;base64,' + b64)).blob();
    if (jpg) {
      const bmp = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.62));
    }
    await window.__app.loadBlob(blob, 'shot');
    const S = window.__app.S; const k = document.createElement('canvas'); k.width = S.iw; k.height = S.ih; k.getContext('2d').drawImage(S.img, 0, 0); window.__orig = k;
  }, { b64: shot.toString('base64'), jpg: variant === 'jpg' });
  const out = [];
  const readStats = { n: 0, ok: 0 };
  if (process.env.READ) await app.evaluate(() => { window.__READ = true; window.__OCRDBG = true; });
  for (const c of CASES) {
    if (filter && !c.id.includes(filter)) continue;
    const r = rects[c.id];
    const m = 5;      // loose box like a finger would draw
    const box = c.pad ? { x: (r.x + 8) * dsf, y: (r.y + 5) * dsf, w: (r.w - 16) * dsf, h: (r.h - 10) * dsf } : { x: (r.x - m) * dsf, y: (r.y - m + (c.id === 'para' ? 0 : r.h * 0.06)) * dsf, w: (r.w + 2 * m) * dsf, h: (r.h + 2 * m - (c.id === 'para' ? 0 : r.h * 0.12)) * dsf };
    let res;
    try {
      res = await app.evaluate(async ({ c, box }) => {
        const R = window.__app, S = R.S;
        R.startEdit(box, false);
        const ed = S.edit;
        if (window.__READ) {
          // let the built-in reader fill in the original text
          await new Promise((res, rej) => { const t = Date.now(); const iv = setInterval(() => { if (ed.origText) { clearInterval(iv); res(); } else if (Date.now() - t > 120000 || /请手动|没能启动/.test(document.getElementById('matchStatus').textContent)) { clearInterval(iv); rej(new Error('read: ' + document.getElementById('matchStatus').textContent)); } }, 50); });
        } else R.setOrig(c.text, true);
        await new Promise((res, rej) => { const t = Date.now(); const iv = setInterval(() => { if (ed.st.matched && ed.cands.length && !/正在/.test(document.getElementById('matchStatus').textContent)) { clearInterval(iv); res(); } else if (Date.now() - t > 90000) { clearInterval(iv); rej(new Error('timeout ' + document.getElementById('matchStatus').textContent)); } }, 50); });
        const st = ed.st;
        const o = { read: ed.origText, fam: st.fam.n, w: st.weight, it: st.italic, px: st.px, tr: st.trEm, blur: st.blur, col: st.color.map(Math.round), iou: st.score, grain: ed.an.grain, grow: ed.an.grow, rect: { ...ed.rect },
          cands: ed.cands.slice(0, 3).map(r => r.fam.n + ' ' + r.weight + (r.italic ? 'i' : '') + ' ' + (r.iou * 100).toFixed(0)) };
        ed.newText = c.to; document.getElementById('inNew').value = c.to;
        R.refresh();
        R.commit('text', true);
        return o;
      }, { c, box });
    } catch (e) { res = { err: e.message.split('\n')[0] }; }
    res.id = c.id; out.push(res);
    if (res.err) { console.log('ERR', c.id, res.err); continue; }
    const ok = res.fam === c.fam ? (res.w === c.w ? 'OK ' : 'wgt') : 'FAM';
    if (process.env.READ) { const same = res.read === c.text; readStats.n++; if (same) readStats.ok++; console.log(same ? '  read OK ' : '  read ≠  ', JSON.stringify(res.read), same ? '' : ' truth ' + JSON.stringify(c.text)); }
    const cssPx = parseFloat(/(\d+)px/.exec(c.css)[1]) * dsf;
    console.log(ok, c.id.padEnd(8), (c.fam + ' ' + c.w).padEnd(22), '→', (res.fam + ' ' + res.w + (res.it ? 'i' : '')).padEnd(24), 'px', res.px.toFixed(1), '(' + cssPx + ')', 'tr', (res.tr * 1000).toFixed(0), 'blur', res.blur, 'col', res.col.join(','), 'iou', (res.iou * 100).toFixed(1), 'grain', res.grain.toFixed(1), '|', res.cands.join(' ; '));
  }
  // 3. contact sheet: before | after for each case
  const sheet = await app.evaluate(({ rects, dsf, ids }) => {
    const S = window.__app.S, O = window.__orig;
    const rowH = 96 * dsf, W = 840 * dsf, z = dsf >= 2 ? 0.75 : 1.5;
    const half = Math.round(520 * (dsf >= 2 ? 1.5 : 1));
    const c = document.createElement('canvas'); c.width = Math.round(half * z) * 2 + 6; c.height = Math.round(ids.length * (88 * dsf * z + 4));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingEnabled = z < 1;
    ids.forEach((id, i) => {
      const idx = Object.keys(rects).indexOf(id);
      const sy = (20 + idx * 96) * dsf, sx = 30 * dsf, sw = Math.min(W, half), sh = 88 * dsf;
      const dy = Math.round(i * (sh * z + 4));
      x.drawImage(O, sx, sy, sw, sh, 0, dy, Math.round(sw * z), Math.round(sh * z));
      x.drawImage(S.img, sx, sy, sw, sh, Math.round(half * z) + 6, dy, Math.round(sw * z), Math.round(sh * z));
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { rects, dsf, ids: CASES.filter(c => !filter || c.id.includes(filter)).map(c => c.id) });
  fs.writeFileSync(path.join(__dirname, 'out', 'sheet-' + SET + '-' + variant + '.png'), Buffer.from(sheet, 'base64'));
  if (process.env.READ) { console.log('read exact', readStats.ok + '/' + readStats.n); console.log(h2.logs.filter(l => /OCRDBG/.test(l)).map(l => l.replace('warning: OCRDBG ', '  ')).join('\n')); }
  const bad = h2.logs.filter(l => !/400|Failed to load/.test(l));
  if (bad.length) console.log('LOGS\n' + bad.slice(0, 10).join('\n'));
  await h2.browser.close();
})();
