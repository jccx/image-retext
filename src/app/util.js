/* =====================================================================
   app.js — font registry, edit state, interactions
   ===================================================================== */
const $ = id => document.getElementById(id);
const hex2 = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
const rgbHex = c => ('#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2])).toUpperCase();
const hexRgb = s => { const m = /^#?([0-9a-f]{6})$/i.exec(s.trim()); if (!m) return null; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
const mb = b => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(0.1, b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + ' MB');
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200); }
