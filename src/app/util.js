/* =====================================================================
   app/util.js — small helpers of the page: finding an element, colours and sizes as text, the toast.
   ===================================================================== */
/* the element with this id */
const $ = id => document.getElementById(id);
/* colours: [r, g, b] → '#RRGGBB', and back (null when the text is not a colour) */
const hex2 = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
const rgbHex = c => ('#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2])).toUpperCase();
const hexRgb = s => { const m = /^#?([0-9a-f]{6})$/i.exec(s.trim()); if (!m) return null; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
/* a number of bytes, for people */
const mb = b => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(0.1, b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + ' MB');
/* a short message at the bottom of the screen, gone after three seconds */
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200); }
