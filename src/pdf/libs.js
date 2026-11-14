/* =====================================================================
   pdf/ — PDF files in the app (installable build only).
   A PDF page is drawn as a picture and edited exactly like an image. On saving, the edits go back
   into the PDF: the replaced glyphs are taken out of the page (core.js) and the new text is written
   in their place as text, in the file's own font or in a library font that is put into the file.
   The saved page is then drawn again and compared with the screen; an edit that cannot be written as
   text, or does not come out the same, is laid over the page as a small picture instead.
   Everything else in the file stays as it was.
   The files:
     core.js    glyph positions, taking glyphs out of a content stream, text operators (no page, no browser)
     libs.js    the three libraries, loaded when first needed
     pages.js   opening a file, drawing a page, going from page to page, keeping the edits of each page
     fonts.js   the fonts of the file and of the library: which of them can draw the new text and be written into the file
     edit.js    a selection on a PDF page: its text, its neighbours, and what an applied edit remembers for saving
     write.js   one edit goes into the file: as text (which font, which codes, the operators) or as a picture
     build.js   the whole edited file, with its checks and second tries
     save.js    the save sheet and its report; the page buttons

   pdf/libs.js — the libraries, hosted alongside the app and loaded only when needed:
     pdf.js (Mozilla, Apache-2.0) draws pages and reports the glyphs; pdf-lib (MIT) writes the file;
     fontkit (MIT) cuts a library font down to the characters used.
   PDFS, what the PDF code keeps apart from the open document (S.pdf, see pages.js):
     libP, wrP, fkP: the promises of the three libraries · saving: a file is being built
     out: { url, report, size } of the file built last, null once the pages have changed
     css: library family → its @font-face rules · files: font file → { bytes, fk } (both filled by fonts.js)
     famDirty: the font list of the panel lacks fonts found since it was built
     log, bad: set by the tests, to see what building did
   ===================================================================== */
const PDFS = { libP: null, wrP: null, fkP: null, saving: false, out: null, css: new Map(), files: new Map(), famDirty: false, log: null, bad: null };
/* where the libraries and their helper files (character maps, standard fonts, image decoders) are served from */
const PDF_DIR = 'pdf/';
const pdfUrl = f => new URL(PDF_DIR + f, document.baseURI).href;

/* pdf.js → promise of its module. A load that failed is forgotten, so the next call tries again. */
function pdfLib() {
  if (!PDFS.libP) {
    PDFS.libP = import(pdfUrl('pdf.min.js')).then(m => { m.GlobalWorkerOptions.workerSrc = pdfUrl('pdf.worker.min.js'); return m; });
    PDFS.libP.catch(() => { PDFS.libP = null; });
  }
  return PDFS.libP;
}
/* a library that comes as a plain script and leaves a global called `name` → promise of that global, kept in PDFS[key] */
function pdfScript(key, file, name) {
  if (!PDFS[key]) {
    PDFS[key] = new Promise((res, rej) => {
      if (window[name]) { res(window[name]); return; }
      const s = document.createElement('script');
      s.src = pdfUrl(file);
      s.onload = () => (window[name] ? res(window[name]) : rej(new Error(name)));
      s.onerror = () => rej(new Error(name));
      document.head.appendChild(s);
    });
    PDFS[key].catch(() => { PDFS[key] = null; });
  }
  return PDFS[key];
}
const pdfWriter = () => pdfScript('wrP', 'pdf-lib.min.js', 'PDFLib');
const pdfFontkit = () => pdfScript('fkP', 'fontkit.umd.min.js', 'fontkit');
/* let go of a document that pdf.js has open */
const pdfDestroy = doc => { try { doc.loadingTask.destroy(); } catch (e) { /* already gone */ } };
const isPdf = (blob, name) => /pdf/i.test(blob.type || '') || /\.pdf$/i.test(name || '');
