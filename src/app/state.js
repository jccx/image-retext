/* =====================================================================
   app/state.js — everything the page knows at any moment, in one object: S.

   The picture
     img, ictx      the canvas that is edited, and its context. Every applied edit is painted into it; saving writes it out.
                    A page of a PDF is such a picture too.
     iw, ih         its size in pixels · name, type: the file name (no extension) and the kind of file to save
     demo           it is the sample picture, not one the user opened
   The view
     view           { s, tx, ty }: pixel (x, y) of the picture is shown at (tx + x·s, ty + y·s) of the stage
     vw, vh, dpr    the size of the stage in CSS pixels, and device pixels per CSS pixel
     fitted         the picture is shown whole (and is fitted again when the stage changes size)
   Pointers
     pointers       Map pointerId → { x, y }: the fingers, or the mouse, on the stage
     drag           what one pointer is doing: { type: 'new' | 'resize' | 'pan', … }, or null
     pinch          two fingers: { d, mx, my }, their distance and middle, or null · space: the space bar is held (dragging pans)
   Editing
     edit           the selection being edited (below), or null
     undo           the applied edits, oldest first: [{ x, y, data: the pixels before, after: the pixels after, pdf: see pdf/edit.js }]
     lastFam        the family of the edit applied last: the first guess for the next one
     comparing      按住看原图 is held down
   What is open
     pdf            the open PDF (pdf/pages.js), or null · pic: what can be searched in a plain picture (app/find.js), or null
   Claude, when the page runs inside Claude (app/main.js)
     sample         its capability of reading text in a picture, or null · sampleReady: resolves once that is known
     downloads      its capability of saving a file, or null

   An edit (S.edit) lives from the moment a box is drawn until it is applied or dropped. userRect and rect are in pixels of
   the picture; everything else is in pixels of the analysed region, counted from the corner of rect.
     userRect       the box as drawn · rect: the box with a margin, cut to the picture: the region that is analysed and repainted
     an             what is in the region (image/analyze.js) · bands: its lines of text
     origText       what the picture says there, typed or read · origLines: the same as trimmed lines
     newText        what it should say
     ocr            where origText came from, or null → { tier: 'pdf' | 'local' | 'quick' | 'default' | 'manual', text, reread,
                    conf, maybe, slots, doubt, auto } (app/read.js)
     varDone        other spellings of a text that was read have been tried against the picture (app/match.js)
     st             the style the new text is set in (below)
     cands          the fonts that fit, best first: results of refineCand (image/fontfit.js); those marked `rough` were
                    ranked but not fitted
     fit            one reference for every line of the old text: where it sat (app/layout.js)
     primary        the line the fonts were fitted on (the longest) · primaryText: its text · T2, T2c: its targets (image/fontfit.js)
     tier           1: the short list of fonts is tried · 2: the long one too (在更多字体里再找一遍)
     matchToken     goes up whenever a match that is still running has become out of date
     live           the preview painted into the picture → { x, y, before, after }; null while the picture is untouched
     userColor      the colour was picked by hand
     pdfHint, pdfFam, pdfLines, pdfAlt   on a PDF page: what the file says about the old text's font (pdf/edit.js, pdf/fonts.js)
     find           the occurrence of a searched text that this edit is for (app/find.js), or null

   The style (edit.st)
     fam, weight, italic   the face (fam is a family record, app/families.js)
     px             size in pixels of the picture · trEm: letter spacing per 1px of size
     color          [r, g, b] · blur: how soft the edges are · align: 'left' | 'center' | 'right'
     sizeAdj, trAdj, dx, dy   what the user changed by hand on top of the fit: a factor, spacing per 1px of size, pixels
     matched        a fitted font has been adopted: px, trEm and geo come from it · score: how well it fits, 0…1, or null
     geo            where the fitted line sits → { ox, oy, xs, words }
     famUser, weightUser, alignUser   the user chose these; later fits leave them alone
   ===================================================================== */
const S = {
  sampleReady: Promise.resolve(),
  img: null, ictx: null, iw: 0, ih: 0, name: 'image', type: 'image/png', demo: false,
  view: { s: 1, tx: 0, ty: 0 }, vw: 0, vh: 0, dpr: 1, fitted: false,
  edit: null, undo: [], drag: null, pointers: new Map(), pinch: null, space: false,
  sample: null, downloads: null, lastFam: null, comparing: false, pdf: null, pic: null
};
/* the area the picture is shown in, its canvas and context, and the frame around the selection */
const stage = $('stage'), vcan = $('view'), vctx = vcan.getContext('2d'), selEl = $('sel');
