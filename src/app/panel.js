/* =====================================================================
   app/panel.js — the editing panel. It shows the open edit: its font, size and colour, how well the font fits,
   and the fonts that fit. Every change to an edit ends in refresh(), which also repaints the preview in the picture.
   ===================================================================== */
/* the line under the text boxes that says what is going on. warn: it is something the user should look at */
function setStatus(t, warn) { const el = $('matchStatus'); el.textContent = t || ''; el.classList.toggle('warn', !!warn); }
/* the open edit has changed: repaint its preview in the picture, and show its values in the panel */
function refresh() {
  const ed = S.edit;
  if (!ed) return;
  const st = ed.st;
  renderLive();
  const px = st.px * st.sizeAdj;
  $('mFont').textContent = famLabel(st.fam) + (st.italic ? ' 斜体' : '');
  $('mFont').title = famLabel(st.fam);
  $('mWeight').textContent = st.weight;
  $('mSize').textContent = px.toFixed(1) + 'px';
  $('mColor').textContent = rgbHex(st.color);
  $('mSwatch').style.background = rgbHex(st.color);
  const sc = $('mScore');
  sc.textContent = st.score == null ? '—' : Math.round(st.score * 100) + '%';
  sc.className = 'num' + (st.score == null ? '' : st.score >= 0.8 ? ' ok' : st.score < 0.6 ? ' low' : '');
  const sp = $('specSample'), tx = $('specText');
  sp.style.background = rgbHex(ed.an.bgColor);
  tx.textContent = encT(st.fam, (ed.newText || ed.origText || 'Aa 文字 123').split('\n')[0]);
  tx.style.cssText = 'font-family:' + famCss(st.fam) + ';font-weight:' + (st.fam.pdf ? st.fam.pdf.fw : st.weight) + ';font-style:' + (st.fam.pdf ? st.fam.pdf.fs : st.italic ? 'italic' : 'normal') +
    ';color:' + rgbHex(st.color) + ';letter-spacing:' + (st.trEm + st.trAdj).toFixed(4) + 'em';
  // controls
  const sf = $('selFamily');
  if (sf.options.length < 2) buildFamilySelect();
  let cur = $('optCur');
  if (st.fam.comp) {
    if (!cur) { cur = document.createElement('option'); cur.id = 'optCur'; sf.insertBefore(cur, sf.firstChild); }
    cur.value = st.fam.n; cur.textContent = famLabel(st.fam);
  } else if (cur) cur.remove();
  sf.value = st.fam.n;
  const sw = $('selWeight');
  const want = st.fam.w.join(',');
  if (sw.dataset.w !== want) { sw.dataset.w = want; sw.innerHTML = st.fam.w.map(w => '<option value="' + w + '">' + w + '</option>').join(''); }
  sw.value = st.weight;
  $('chkItalic').checked = st.italic;
  if (document.activeElement !== $('numSize')) $('numSize').value = px.toFixed(1);
  if (document.activeElement !== $('numTrack')) $('numTrack').value = Math.round((st.trEm + st.trAdj) * 1000);
  $('inColor').value = rgbHex(st.color).toLowerCase();
  if (document.activeElement !== $('inHex')) $('inHex').value = rgbHex(st.color);
  for (const b of document.querySelectorAll('[data-align]')) b.setAttribute('aria-pressed', b.dataset.align === st.align ? 'true' : 'false');
  $('outNudge').textContent = st.dx.toFixed(1).replace('.0', '') + ', ' + st.dy.toFixed(1).replace('.0', '');
  $('rngBlur').value = st.blur; $('outBlur').textContent = st.blur.toFixed(2).replace(/0$/, '');
  $('btnMore').hidden = ed.tier >= 2 || scriptOf(ed.origText || 'a') !== 'latin';
  $('btnOcr').textContent = ed.origText ? '重读' : '识别';
  $('btnOcr').hidden = false;
  for (const ch of $('cands').children) ch.setAttribute('aria-pressed', ch.dataset.fam === st.fam.n ? 'true' : 'false');
}
/* the row of fonts that fit; tapping one uses it */
function renderCands() {
  const ed = S.edit, box = $('cands');
  box.textContent = '';
  if (!ed || !ed.cands.length) return;
  const sample = (ed.primaryText || 'Aa').slice(0, 14);
  for (const r of ed.cands.slice(0, 10)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.fam = r.fam.n;
    b.setAttribute('aria-pressed', r.fam === ed.st.fam ? 'true' : 'false');
    const s = document.createElement('span'); s.className = 's'; s.textContent = encT(r.fam, sample);
    s.style.cssText = 'font-family:' + famCss(r.fam) + ';font-weight:' + (r.fam.pdf ? r.fam.pdf.fw : r.weight) + ';font-style:' + (r.fam.pdf ? r.fam.pdf.fs : r.italic ? 'italic' : 'normal');
    const m = document.createElement('span'); m.className = 'm';
    const n = document.createElement('span'); n.textContent = famLabel(r.fam) + ' ' + r.weight;
    const p = document.createElement('span'); p.className = 'num'; p.textContent = Math.round(r.iou * 100) + '%';
    m.append(n, p); b.append(s, m);
    b.onclick = () => { if (r.rough) chooseFont(r.fam, r.weight, r.italic); else { adopt(r, false); renderCands(); } };
    box.appendChild(b);
  }
}
/* the list of all fonts, in groups. It is built again whenever fonts are added (an uploaded file, the fonts of a PDF). */
function buildFamilySelect() {
  const sf = $('selFamily');
  sf.textContent = '';
  const groups = [['这份 PDF 自带的字体', f => !!f.pdf], ['本机字体', f => f.sys && !f.custom && !f.pdf], ['已上传', f => f.custom], ['中文', f => !f.sys && (f.sc === 'sc' || f.sc === 'tc')],
    ['无衬线', f => !f.sys && !f.sc && f.c === 's'], ['衬线', f => !f.sys && !f.sc && f.c === 'r'], ['等宽', f => !f.sys && !f.sc && f.c === 'm'],
    ['手写', f => !f.sys && !f.sc && f.c === 'h'], ['展示', f => !f.sys && !f.sc && f.c === 'd'], ['日文', f => f.sc === 'jp'], ['韩文', f => f.sc === 'kr']];
  const all = [...FAM.values()].filter(f => !f.comp);
  for (const [label, test] of groups) {
    const list = all.filter(test);
    if (!list.length) continue;
    const og = document.createElement('optgroup'); og.label = label;
    if (!list[0].sys) list.sort((a, b) => a.n.localeCompare(b.n));
    for (const f of list) { const o = document.createElement('option'); o.value = f.n; o.textContent = famLabel(f); og.appendChild(o); }
    sf.appendChild(og);
  }
}
/* a text box is as tall as its text, up to four lines */
function autoRows(t) { t.rows = clamp(t.value.split('\n').length, 1, 4); }
