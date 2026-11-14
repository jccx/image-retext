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
