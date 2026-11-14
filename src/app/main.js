/* =====================================================================
   app/main.js — starting up. This file comes last in the script: everything it calls has been declared by then.
   ===================================================================== */
function boot() {
  /* every part of the page wires its own buttons and keys */
  inputsInit(); pointerInit(); controlsInit(); saveInit(); shortcutsInit();
  offInit(); pdfInit(); findInit();
  detectSystemFonts();
  new ResizeObserver(resizeView).observe(stage);
  resizeView();
  makeDemo();
  /* inside Claude the page may ask for two capabilities: saving a file, and having Claude read the text of a selection.
     Anywhere else window.claude does not exist, and the page saves and reads by itself. */
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
/* for the tests (test/): a way to reach the state and drive an edit from outside */
window.__app = { S, FAM, startEdit, setOrig, commit, loadBlob, setImage, refresh };
