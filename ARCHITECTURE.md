# Architecture

How the code of Text Overwrite (查缺补漏) is put together, for whoever changes it next.
What the app does, and its limits, are in `README.md`.

## One script, many files

The app is a single page with one inline script. `build.js` makes it by putting the files of `src/` one after
another, in the order of its `MODULES` list, and writes two targets:

| Target | Made for | Differences |
| --- | --- | --- |
| `dist/index.html` (`BUILD === 'artifact'`) | a Claude artifact: one file, nothing else | fonts from Google Fonts; inside Claude, Claude reads the text of a selection and saves the file; no PDFs, no find box, no offline fonts |
| `docs/` (`BUILD === 'pages'`) | the installable site on GitHub Pages | fonts hosted alongside, offline packs, service worker, PDFs, the find box |

There is no bundler and no module system, on purpose: the build needs nothing but Node, and the page stays a
single file that works inside Claude and offline. The price is that **all files share one scope**. Three things
keep that manageable:

- **Names carry their module**: `pdf…` (PDF support), `find…` (the find box), `ocr…` / `OCR…` (the built-in reader),
  `off…` (offline fonts). Module-wide state lives in one object per module: `S` (the page), `PDFS`, `OCR`, `OFF`.
- **`node build.js` refuses to build a page that would not start**: a syntax error, or a name declared with
  `const`/`let` in two files, stops the build with the file and line.
- **`node tools/modules.js --check`** (`npm run check`) finds what the shared scope hides: a function declared
  twice (the later one would silently win), a name that nothing declares (a typo, a renamed function), an
  assignment to another file's variable, and a file that reaches into a layer above its own.
  `node tools/modules.js --names` prints what every file declares and which names it uses from which file.

A local variable can still shadow a function of the same name (`const findLeft = findLeft()` fails at run time).
Neither check sees that; the tests do.

## The files

```
src/
  index.html, style.css      the page and its looks (build.js fills in the script, the styles and the head)
  sw.js                      the service worker of the installable build
  *.gen.js                   generated data, never edited by hand (see “Generated files”)
  base.js                    clamp, tick: the two helpers every layer may use

  image/                     pixels and type; knows nothing about the page
    pixels.js                filling holes, threshold, growing a mask, blur
    analyze.js               what is in a box: text mask, text colour, repaired background, lines, words
    typeset.js               drawing and measuring type: CSS for a face, the shared scratch canvas, ink metrics, coverage
    fontfit.js               comparing a face with the text in the picture: targets, geometry, stage1, refineCand

  reader/                    the built-in text reader (Chinese by drawn templates, Latin by a small classifier)
    models.js                the two models, made ready on first use (ocrLoad)
    classify.js              one box of ink → a character
    line.js                  one line → glyphs → text with its spaces (ocrReadBand, ocrCompose)
    variants.js              spellings the reader cannot tell apart, for the font fit to settle
    read.js                  a whole selection (ocrReadLines), a whole picture (ocrFindLines, ocrPage)

  pdf/core.js                PDF work that needs no page: glyph positions, taking glyphs out of a content stream,
                             text operators, the ink check. Runs in Node too (test/pdf/t_strip.mjs).

  app/                       the page
    util.js                  $, colours and sizes as text, toast
    state.js                 S, the one state object — and the description of every field of it and of an edit
    families.js              FAM: the fonts the app knows (library, device, uploaded, pairs, a PDF's own)
    webfonts.js              loading library fonts (style sheets and font files)
    view.js                  showing the picture: zoom, fit, stage ↔ picture coordinates
    panel.js                 the editing panel: refresh(), the fonts that fit, the status line
    load.js                  opening a file; setImage()
    edit.js                  an edit from the box to the analysed region: startEdit, analyzeEdit, dropEdit
    layout.js                where the old text sat (computeFit), where the new text goes (layoutNew)
    apply.js                 the edit as pixels: compose, the preview, commit, undo
    match.js                 finding the font of the old text: runMatch, adopt, chooseFont
    inputs.js                the two text boxes: 原文字, 新文字
    read.js                  reading the original text: from the PDF, by Claude, or by the built-in reader
    pointer.js               fingers and mouse on the picture
    controls.js              the buttons and fields of the panels
    save.js                  saving a picture
    shortcuts.js             keyboard, paste, drop
    offline.js               fonts kept on the device, privacy note, service worker (installable build)
    find.js                  the find box: every occurrence of a text, in PDFs and in pictures
    demo.js                  the sample picture
    main.js                  boot(): starts everything. Last file of the script.

  pdf/                       PDF support (installable build)
    libs.js                  pdf.js, pdf-lib and fontkit, loaded when first needed; PDFS
    pages.js                 the open document (S.pdf): opening, drawing a page, turning pages, keeping edits per page
    fonts.js                 the file's own fonts and the library's: which can draw the new text and go into the file
    edit.js                  a selection on a PDF page: its text, its neighbours, what saving needs to know
    write.js                 one edit into the file: as text (font plan, subset fix, operators) or as a picture
    build.js                 the whole edited file: plan, strip, write, check, try again
    save.js                  the save sheet and its report; pdfInit()
```

Every file starts with a comment that says what it is for and describes the data it owns. Those comments are the
reference for data shapes; this document only says where to look:

| Data | Described in |
| --- | --- |
| `S`, an edit (`S.edit`), its style (`edit.st`), undo entries | `app/state.js` |
| analysed region `an`, bands | `image/analyze.js` |
| targets `T`, geometries, candidates (results of `refineCand`) | `image/fontfit.js` |
| family records (`FAM`) | `app/families.js`; the `pdf` part in `pdf/fonts.js` |
| line references (`edit.fit`) | `app/layout.js` |
| glyph map of a PDF page | `pdf/core.js` |
| `S.pdf`, page records, kept edits | `pdf/pages.js` |
| what an applied edit remembers for saving (`.pdf`) | `pdf/edit.js` |
| plan entries and the report of a build | `pdf/build.js` |
| what can be searched (`findCtx()`), hits | `app/find.js` |
| reader state `OCR`, glyphs of a line | `reader/models.js`, `reader/line.js` |

## Layers

```
base.js  ←  image/  ←  reader/
pdf/core.js  (stands alone)
                    ↑
        app/  ⇄  pdf/ (all but core.js)        the page: these call each other freely
```

- `image/` uses only `base.js` and itself. It takes pixels, faces and sizes as arguments and never looks at `S`.
- `reader/` uses `base.js`, `image/` and its two data files.
- `pdf/core.js` uses nothing, not even the browser.
- `app/` and the rest of `pdf/` are one layer. PDF support is woven into editing at a few places
  (`pdfReadEdit`, `pdfProtect`, `pdfExact`, `pdfFontFor`, `pdfEditInfo`, `pdfSave`); each is guarded by `S.pdf` or
  `BUILD`, so the artifact build never runs them.

`tools/modules.js --check` enforces the first three rules.

## Start-up

While the script loads, nothing happens but declarations: a few of them look up elements of the page
(`app/state.js`), and one loop fills `FAM` from the font list.
`app/main.js` is the last file; its `boot()` does everything, in this order:

1. every part wires its own buttons: `inputsInit`, `pointerInit`, `controlsInit`, `saveInit`, `shortcutsInit`,
   then `offInit`, `pdfInit`, `findInit` (these three do nothing in the artifact build);
2. `detectSystemFonts()`, the stage is sized, `makeDemo()` draws the sample picture;
3. inside Claude, the two capabilities are asked for (`downloads`, `sample`).

A new button is wired in the `…Init()` of the file it belongs to. A new file is added to `MODULES` in `build.js`;
where it goes only matters if it declares a `const` that something else uses while the script is still loading.

## How an edit runs

Picture pixels are the unit throughout; a PDF page is drawn as a picture first and then edited the same way.

1. **A box is drawn** (`app/pointer.js`) → `startEdit()` opens `S.edit`.
2. **`analyzeEdit()`** cuts out the region (the box plus a margin) and `analyzeRegion()` separates text from
   background: alpha map, text colour, repaired background. `findBands()` finds the lines.
3. **The original text** is read (`app/read.js`): from the PDF itself, by Claude, or by `reader/`; or the user
   types it. `setOrig()` stores it and schedules the match.
4. **`runMatch()`** (`app/match.js`) finds the font: candidates are drawn over the longest line and compared
   (`image/fontfit.js`). `adopt()` puts the winner's face, size, spacing and place into `edit.st`.
5. **`computeFit()`** makes a reference for every line (where it sat); **`layoutNew()`** sets the new text on them.
6. **`compose()`** builds the patch: repaired background where the old text was, new text drawn on it.
   `renderLive()` paints it into the picture as a preview (and remembers what was there); `refresh()` runs this
   after every change.
7. **`commit()`** makes it final and pushes it on `S.undo`. On a PDF page it also stores `pdfEditInfo()`:
   which glyphs were replaced and where every character of the new text goes.

Saving a picture writes the canvas out (`app/save.js`). Saving a PDF (`pdf/build.js`) writes each edit into the
file as real text where that works and looks right, otherwise as a small picture, and reads the result back to
check; its header comment lists the rounds.

The find box (`app/find.js`) keeps the text of every page as folded characters with their boxes, turns a query
into hits, and `findStep()` opens an edit on the next hit that has not been edited (`startEdit(…, hit)`).
Text inside pictures has to be read once first (`findReadPics()` → `ocrPage()`).

## Coordinates

Most bugs so far were a mix-up of two of these.

| Space | Used by | Converting |
| --- | --- | --- |
| stage (CSS pixels of the view) | pointer events, the selection frame | `toImg()`; `S.view` |
| picture pixels | `userRect`, `rect`, undo entries, find hits, glyph maps, everything saved with an edit | — |
| region pixels (from the corner of `edit.rect`) | `an`, bands, `edit.fit`, `st.geo`, candidates, `layoutNew()` | add `rect.x`, `rect.y` |
| band coordinates (from the corner of a band, both ends included) | glyph boxes inside `reader/line.js` | add `b.x0`, `b.y0` |
| target pixels (a line, padded and reduced) | `image/fontfit.js` internally | `T.offX`, `T.offY`, `T.kx`, `T.ky` |
| PDF points | the file | the page's pdf.js viewport (`pg.vp`) |

## Things that are easy to get wrong

- **The scratch canvas is shared** (`mctx()` in `image/typeset.js`). Anything that measures or draws type resets
  its font. Set the font *after* calling such a function (`layoutNew()`, `lineMetrics()`…), not before.
- **The preview is in the picture.** While an edit is open, `S.ictx` holds its preview. Code that reads pixels
  around the edit must call `restoreLive()` first (and `renderLive()` afterwards); `compose()` relies on it.
- **Everything asynchronous can outlive its edit.** After every `await`, check that the edit is still the open one
  (`S.edit !== ed`, `stale()` in `runMatch`), that the document is still the same (`S.pdf !== P`,
  `findCtx() !== P`), that the search is still the same (`P.find !== F`).
- **Edit records of a PDF page are made anew** whenever the page is left or saved (`pdfStash()`); the pixels
  (`after`) are the same object. Anything that has to recognise an edit across that keys on `after` (`force` in
  `pdfBuild`).
- **`matchToken`** must go up whenever a running match has become pointless (the edit was dropped, applied, or its
  text changed).
- **A PDF's own font has only the characters the file uses.** Text for it goes through `encT()`; new characters
  may be missing (`pdfMissing`), and the font in use then changes (`pdfFontFor`).
- **A font family's style sheet may claim characters its files lack.** `pdfUncovered()` asks the font files.
- **fontkit cannot cut down WOFF2 fonts by itself**; `pdfFixSubset()` and `pdfGlyf()` write the outlines.
- **The script must not contain `</script`**, not even in a comment or a string; the build checks.

## Generated files

| File | Made by | Holds |
| --- | --- | --- |
| `src/fontdb.gen.js` | `node gen_fontdb.js` | `GF`: the library's families, weights, scripts |
| `src/selffonts.gen.js` | `node build_site.js` | `SELF_FONTS`, `FONT_PACKS`: fonts the site hosts, offline packs (`docs/fonts/` is written by the same script) |
| `src/hanzi.gen.js` | written once; the set does not change | the GB 2312 characters the reader draws as templates |
| `src/latin.gen.js` | `train/train_latin.py`, from samples of `test/gen_*.js` | the Latin classifier |

## Tests

All tests drive the built page in headless Chrome (Playwright), except `t_strip.mjs`. Build first (`node build.js`).
Set `CHROME=/path/to/chrome` to use a system browser. The PDF tests need the samples
(`python3 test/pdf/make_samples.py && node test/pdf/make_chrome.js`) and poppler.

| Test | What it covers | A good run ends with |
| --- | --- | --- |
| `test/pdf/t_strip.mjs` | `pdf/core.js` alone: text of a selection, glyph removal, nothing else moves | `summary 47/47` |
| `test/t_ui.js` | the page at phone and desktop size: select, match, tune, apply | two lines with a matched font |
| `test/t_flow.js` | inside Claude (capabilities mocked): read → match → replace → undo → save | `fallback sheet shown: [ true, … ]` |
| `test/t_shared.js` | no Claude at all: the built-in reader, match, save sheet | `save sheet shown: true` |
| `test/t_ocr.js` | a wrong reading is noticed and corrected by one re-read | three `OK` lines |
| `test/t_layout.js` | where replacement text lands (same length, longer, shorter, several lines) | `summary OK …` |
| `test/t_match.js`, `t_real.js` | font matching accuracy on drawn and on browser-laid text | `OK` on every line |
| `test/t_read.js` | the built-in reader alone, on many faces | a `TOTAL` line (about 98% of characters) |
| `test/t_pdf.js` | PDFs from seven producers: read, match, replace, save as real text, verified with poppler | `summary 27/27` |
| `test/t_pdf_special.js` | scans, protected files, passwords, form fields, whole-page pictures | `summary 13/13` |
| `test/t_pdf_find.js` | find on every page, replace each occurrence, nothing missed | `all passed` |
| `test/t_find_ocr.js` | text in scans and pictures: read once, then found | `all passed` |
| `test/t_pages.js` | the installable build on a local server: offline packs, airplane mode, back online | five numbered stages |

The tests reach into the page through `window.__app` (`app/main.js`) and, since the script is not wrapped, through
its global names (`pdfBuild`, `findAll`, `findCtx`, `PDFS`…). Renaming one of those means changing the tests too.

After a change that should not alter behaviour, compare the script with comments and layout removed, before and
after (`esbuild --minify-whitespace` on the inline script): the reorganisation into these files was checked that way.

## Deployment

GitHub Pages serves `docs/` of `main`. `build.js` stamps `docs/sw.js` with a hash of the page; a visitor gets
the new version on the launch after the one that fetched it. On the device the app keeps: `localStorage`
`overwrite.offline`, Cache Storage `overwrite-shell-<version>` and `overwrite-fonts`.
