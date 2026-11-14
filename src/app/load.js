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
  findRender();
  fitView();
}
