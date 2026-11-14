/* ---------- state ---------- */
const S = {
  sampleReady: Promise.resolve(),
  img: null, ictx: null, iw: 0, ih: 0, name: 'image', type: 'image/png', demo: false,
  view: { s: 1, tx: 0, ty: 0 }, vw: 0, vh: 0, dpr: 1,
  edit: null, undo: [], drag: null, pointers: new Map(), pinch: null, space: false,
  sample: null, downloads: null, lastFam: null, comparing: false, pdf: null, pic: null
};
const stage = $('stage'), vcan = $('view'), vctx = vcan.getContext('2d'), selEl = $('sel');
