/* =====================================================================
   base.js — two helpers that every part of the app may use.
   Nothing here knows about pictures, PDFs or the page.
   ===================================================================== */
/* v, kept within a … b */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/* let the page breathe: what follows `await tick()` runs after the browser has handled input and drawn the screen */
const tick = () => new Promise(r => setTimeout(r, 0));
