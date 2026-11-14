/* =====================================================================
   app/demo.js — the sample picture shown until the user opens a file of their own: a poster and a notice under it,
   drawn here in library fonts, with light and dark type, Chinese and English, and words that come up more than once,
   so that every feature can be tried on it. It is labelled 示例图片 on screen.
   ===================================================================== */
async function makeDemo() {
  const D = [['Noto Serif SC', 900, '周末手作市集'], ['Noto Sans SC', 500, '11月21日—22日 · 10:00–18:00'], ['Noto Sans SC', 700, '门票 ¥25'],
    ['Oswald', 500, 'WEEKEND CRAFT MARKET'], ['Lora', 500, 'Handmade goods, coffee & live music', true],
    /* the notice under the poster: dark type on a light ground, and words that come up more than once (the date, the price,
       the name), so that finding and replacing every occurrence can be tried on it */
    ['Noto Sans SC', 700, '活动须知'], ['Noto Sans SC', 500, '时间：11月21日—22日 10:00–18:00地点：滨江路 88 号创意园 3 号馆票价：¥25 / 人，儿童免票电话：021-5550-0188Weekend Craft Market · Tickets ¥25 · Nov 21–22']];
  const NOTE = ['时间：11月21日—22日 10:00–18:00', '地点：滨江路 88 号创意园 3 号馆', '票价：¥25 / 人，儿童免票', '电话：021-5550-0188'];
  const fams = [...new Set(D.map(d => FAM.get(d[0])).filter(Boolean))];
  await Promise.race([
    ensureCss(fams).then(() => Promise.all(D.map(d => (FAM.get(d[0]) ? ensureFace({ fam: FAM.get(d[0]), weight: d[1], italic: !!d[3] }, d[2]) : false)))),
    new Promise(r => setTimeout(r, 3500))
  ]);
  const c = document.createElement('canvas'); c.width = 1200; c.height = 1200;
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
  x.fillStyle = '#f6f1e7'; x.fillRect(0, 760, 1200, 440);
  x.fillStyle = '#13324a'; x.font = F(5, 44); x.fillText(D[5][2], 84, 846);
  x.fillStyle = '#2a2f36'; x.font = F(6, 36); NOTE.forEach((t, i) => x.fillText(t, 84, 918 + i * 60));
  x.fillStyle = '#5b6470'; x.font = F(6, 30); x.fillText('Weekend Craft Market · Tickets ¥25 · Nov 21–22', 84, 1162);
  if (!S.img || S.demo) setImage(c, x, '示例图片', 'image/png', true);
}
