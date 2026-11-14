/* =====================================================================
   app/pointer.js — fingers and the mouse on the picture: dragging out a box (a new edit), dragging a handle of the
   box (resizing it), two fingers or the wheel (zoom), the middle button or the space bar (moving the picture).
   What a pointer is doing is kept in S.drag:
     { type: 'new', sx, sy: where it went down on the stage · ix, iy: the same in the picture · rect: the box so far · moved }
     { type: 'resize', h: which handle ('nw', 'ne', 'sw', 'se') · start: the box before · rect · moved }
     { type: 'pan', lx, ly: where the pointer was last }
   ===================================================================== */
/* the box of a resize, with the dragged corner at the point p of the stage */
function handleRect(d, p) {
  const r0 = d.start, q = toImg(p.x, p.y);
  let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
  if (d.h[1] === 'w') x0 = q.x; else x1 = q.x;
  if (d.h[0] === 'n') y0 = q.y; else y1 = q.y;
  return normRect(x0, y0, x1, y1);
}
/* the rectangle between two corners, cut to the picture */
function normRect(x0, y0, x1, y1) {
  const ax = clamp(Math.min(x0, x1), 0, S.iw), bx = clamp(Math.max(x0, x1), 0, S.iw);
  const ay = clamp(Math.min(y0, y1), 0, S.ih), by = clamp(Math.max(y0, y1), 0, S.ih);
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}
/* a finger or a button goes down: a second finger starts a pinch, otherwise a box, a resize or a pan */
function pointerDown(e) {
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
}
/* the pointer moves: zoom and move with two fingers, otherwise carry on with what S.drag says */
function pointerMove(e) {
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
}
/* the pointer is lifted: a box that is large enough opens an edit */
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
function pointerInit() {
  stage.addEventListener('pointerdown', pointerDown);
  stage.addEventListener('pointermove', pointerMove);
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('wheel', e => { if (!S.img) return; e.preventDefault(); const p = stagePt(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); }, { passive: false });
  stage.addEventListener('contextmenu', e => e.preventDefault());
  $('zIn').onclick = () => zoomAt(S.vw / 2, S.vh / 2, 1.4);
  $('zOut').onclick = () => zoomAt(S.vw / 2, S.vh / 2, 1 / 1.4);
  $('zFit').onclick = fitView;
}
