/* =====================================================================
   app/offline.js — what only the installable build has: fonts kept on the device, the privacy note, the service worker.
   在线: fonts come from this site as they are needed. 离线: whole packs are kept on the device (Cache Storage) and the
   service worker (src/sw.js) answers from there, so matching works with no network. Switching back to 在线 deletes them.
   The packs are listed in FONT_PACKS (selffonts.gen.js; the PDF helper files are one more pack, added by build.js);
   which files a pack has is in docs/fonts/packs.json.
   What is remembered on the device (localStorage, offKey): { mode: 'online' | 'offline', packs: { pack: 'part' | 'done' } }
   ===================================================================== */
/* cache: the name of the Cache Storage the packs are kept in (the service worker uses the same name)
   busy: the download that is running → { k: pack, frac: how far, stop: { v } }, or null · sel: the packs ticked for download */
const OFF = { cache: 'overwrite-fonts', busy: null, sel: { latin: true, sc: true, cjk: false, pdf: true } };
const offKey = 'overwrite.offline';
/* what is remembered on the device, read and written */
function offState() { try { return JSON.parse(localStorage.getItem(offKey)) || { mode: 'online', packs: {} }; } catch (e) { return { mode: 'online', packs: {} }; } }
function offSave(st) { try { localStorage.setItem(offKey, JSON.stringify(st)); } catch (e) { /* private mode: state lives for this visit only */ } }
/* the few words on the button: 在线加载, or which packs are on the device */
function offLabel() {
  const st = offState(), have = Object.keys(FONT_PACKS).filter(k => st.packs[k] === 'done');
  if (st.mode !== 'offline' || !have.length) return '在线加载';
  return '离线 · ' + have.map(k => FONT_PACKS[k].name.replace('字体', '')).join('、');
}
/* how much room the site takes up on the device, as far as the browser tells */
async function offStore() {
  let t = '';
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      t = '本机已用 ' + mb(e.usage || 0) + (e.quota ? '，浏览器允许约 ' + mb(e.quota) : '');
    }
  } catch (e) { t = ''; }
  $('offStore').textContent = t;
}
/* draw the sheet: the two modes, the packs with their state, the download button */
function offRender() {
  const st = offState(), off = st.mode === 'offline';
  $('modeOnline').setAttribute('aria-checked', String(!off)); $('modeOffline').setAttribute('aria-checked', String(off));
  $('offDesc').textContent = off
    ? '选好字体包下载到这台设备，之后不联网也能比对字体。没下载的字体会跳过，只用已下载的和手机自带的字体。'
    : '字体用到哪款才从网上加载，不占手机空间，需要联网。识别和改字本身不用联网。';
  const list = $('packList');
  list.textContent = '';
  if (off) for (const k of Object.keys(FONT_PACKS)) {
    const p = FONT_PACKS[k], s = st.packs[k], busy = OFF.busy && OFF.busy.k === k;
    const row = document.createElement('label'); row.className = 'pack';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = s === 'done' || (!!OFF.sel[k] && s !== 'done'); cb.disabled = s === 'done' || !!OFF.busy;
    cb.onchange = () => { OFF.sel[k] = cb.checked; offRender(); };
    const b = document.createElement('b'); b.textContent = p.name;
    const right = document.createElement('span');
    if (s === 'done') { const d = document.createElement('button'); d.type = 'button'; d.className = 'del'; d.textContent = '删除'; d.disabled = !!OFF.busy; d.onclick = e => { e.preventDefault(); offDelete([k]); }; right.appendChild(d); }
    const sm = document.createElement('small');
    sm.textContent = (p.fams ? p.fams + ' 款，约 ' : '打开 PDF 时用的字符表、标准字体和图像解码，约 ') + mb(p.bytes) + (s === 'done' ? ' · 已下载' : s === 'part' && !busy ? ' · 没下载完，可继续' : busy ? ' · 下载中 ' + Math.round(OFF.busy.frac * 100) + '%' : '');
    row.append(cb, b, right, sm);
    if (busy) { const bar = document.createElement('div'); bar.className = 'bar'; const i = document.createElement('i'); i.style.width = (OFF.busy.frac * 100).toFixed(1) + '%'; bar.appendChild(i); row.appendChild(bar); }
    list.appendChild(row);
  }
  const todo = Object.keys(FONT_PACKS).filter(k => OFF.sel[k] && st.packs[k] !== 'done');
  $('offGo').hidden = !off || (!todo.length && !OFF.busy);
  $('offGo').textContent = OFF.busy ? '停止' : '下载所选（约 ' + mb(todo.reduce((a, k) => a + FONT_PACKS[k].bytes, 0)) + '）';
  $('offlineState').textContent = offLabel();
  offStore();
}
/* fetch the ticked packs into the cache, eight files at a time. A pack that was interrupted carries on where it stopped. */
async function offDownload() {
  const st = offState(), todo = Object.keys(FONT_PACKS).filter(k => OFF.sel[k] && st.packs[k] !== 'done');
  if (!todo.length || !('caches' in window)) { if (!('caches' in window)) toast('这个浏览器不支持离线保存'); return; }
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* best effort */ }
  let list;
  try { list = await (await fetch('fonts/packs.json', { cache: 'no-cache' })).json(); } catch (e) { toast('连不上网，没法下载字体包'); return; }
  const cache = await caches.open(OFF.cache), stop = { v: false };
  for (const k of todo) {
    const files = list[k].files, total = files.length;
    OFF.busy = { k, frac: 0, stop };
    st.packs[k] = 'part'; offSave(st); offRender();
    let done = 0, failed = 0, idx = 0;
    const worker = async () => {
      while (idx < files.length && !stop.v) {
        const url = new URL(files[idx++], document.baseURI).href;
        try {
          if (!(await cache.match(url))) {
            const r = await fetch(url, { cache: 'no-cache' });
            if (!r.ok) throw new Error(r.status);
            await cache.put(url, r);
          }
        } catch (e) { failed++; }
        done++;
        if (done % 25 === 0 || done === total) { OFF.busy.frac = done / total; offRender(); }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    if (stop.v) break;
    if (failed) { toast(FONT_PACKS[k].name + ' 有 ' + failed + ' 个文件没下载成功，可以再点下载继续'); break; }
    st.packs[k] = 'done'; offSave(st);
  }
  const stopped = stop.v;
  OFF.busy = null; offRender();
  if (!stopped && Object.keys(FONT_PACKS).every(k => !OFF.sel[k] || offState().packs[k] === 'done')) toast('字体包已存到本机，可以离线使用了');
}
/* delete these packs from the device */
async function offDelete(keys) {
  const st = offState();
  if (!('caches' in window)) return;
  const all = keys.length === Object.keys(FONT_PACKS).length;
  if (all) await caches.delete(OFF.cache);
  else {
    let list = null;
    try { list = await (await fetch('fonts/packs.json')).json(); } catch (e) { list = null; }
    const cache = await caches.open(OFF.cache);
    if (list) { for (const k of keys) await Promise.all(list[k].files.map(f => cache.delete(new URL(f, document.baseURI).href))); }
    else { await caches.delete(OFF.cache); keys = Object.keys(FONT_PACKS); }
  }
  for (const k of keys) delete st.packs[k];
  offSave(st); offRender();
}
/* wire the sheet and its buttons; nothing of this exists in the artifact */
function offInit() {
  if (BUILD !== 'pages') return;
  /* the app used to live at another address under another name: what it stored there cannot be used here */
  try { localStorage.removeItem('retext.offline'); if (window.caches) caches.keys().then(ks => ks.filter(k => k.startsWith('retext-')).forEach(k => caches.delete(k))).catch(() => {}); } catch (e) { /* storage unavailable */ }
  $('btnPrivacy').hidden = false;
  $('btnPrivacy').onclick = () => { $('privSheet').hidden = false; };
  $('privClose').onclick = () => { $('privSheet').hidden = true; };
  $('saveNote').hidden = false;
  $('btnOffline').hidden = false;
  $('offlineState').textContent = offLabel();
  $('btnOffline').onclick = () => { $('offSheet').hidden = false; offRender(); };
  $('offClose').onclick = () => { $('offSheet').hidden = true; };
  $('modeOffline').onclick = () => { const st = offState(); if (st.mode !== 'offline') { st.mode = 'offline'; offSave(st); } offRender(); };
  $('modeOnline').onclick = async () => {
    const st = offState();
    if (st.mode === 'online' || OFF.busy) return;
    const have = Object.keys(st.packs);
    if (have.length) {
      const size = have.reduce((a, k) => a + (FONT_PACKS[k] ? FONT_PACKS[k].bytes : 0), 0);
      if (!window.confirm('切回在线会删除已下载到本机的字体（约 ' + mb(size) + '）。删除吗？')) return;
      await offDelete(Object.keys(FONT_PACKS));
    }
    const s2 = offState(); s2.mode = 'online'; s2.packs = {}; offSave(s2); offRender();
    toast('已切回在线，本机字体已删除');
  };
  $('offGo').onclick = () => { if (OFF.busy) OFF.busy.stop.v = true; else offDownload(); };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
