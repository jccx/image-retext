/* =====================================================================
   app.js — font registry, edit state, interactions
   ===================================================================== */
const $ = id => document.getElementById(id);
const tick = () => new Promise(r => setTimeout(r, 0));
const hex2 = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
const rgbHex = c => ('#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2])).toUpperCase();
const hexRgb = s => { const m = /^#?([0-9a-f]{6})$/i.exec(s.trim()); if (!m) return null; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
