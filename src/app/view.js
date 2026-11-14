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
  const fit = Math.max(0.01, fitScale()), want = clamp(Math.min((0.7 * S.vw) / r.w, Math.min(0.2 * S.vh, 40) / r.h), fit, Math.max(fit, 8));      // a short word is not blown up to fill the view
  const s = S.view.s >= want * 0.6 && S.view.s <= want * 1.7 && r.w * S.view.s <= 0.9 * S.vw ? S.view.s : want;      // the zoom in use stays when it shows the spot well enough
  S.view = { s, tx: S.vw / 2 - (r.x + r.w / 2) * s, ty: S.vh * 0.45 - (r.y + r.h / 2) * s };
  S.fitted = false;
  requestDraw();
}
const toImg = (px, py) => ({ x: (px - S.view.tx) / S.view.s, y: (py - S.view.ty) / S.view.s });
function stagePt(e) { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
