/* =====================================================================
   core.js — pixel analysis, background repair, font matching, re-render
   ===================================================================== */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const tick = () => new Promise(r => setTimeout(r, 0));
