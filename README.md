# 图片改字 · image-retext

Replace text inside an image while keeping it looking the same: the new text gets the original font, weight, size, letter spacing, colour and position, and the background under the old text is filled back in. Chinese, English and mixed text.

**Use it:** https://jccx.github.io/image-retext/ — on iPhone, open it in Safari, then Share → *Add to Home Screen* to use it like an app.

框住图片里的一段文字，换成新文字：字体、字重、字号、字距、颜色和位置与原文字一致，旧字底下的背景会补回来。支持中文、英文和中英混排。

## How it works

Everything runs in the browser; images are never uploaded.

1. **Separate text from background** in the selected box, and fill the background back in under the text.
2. **Read the original text** with a small reader built into the page: Chinese by comparison with characters drawn in the device's own fonts (GB 2312, 6,763 characters), Latin letters, digits and punctuation with a small classifier trained for this project (`src/latin.gen.js`, `train/`).
3. **Find the font** by drawing the text in each of 266 candidate families (plus the device's own fonts and any font the user uploads) and comparing pixel by pixel.
4. **Draw the new text** in the matched style, keeping indents, gaps and line spacing.

## PDF files

Open a PDF the same way as an image (**打开图片 / PDF**). Each page is drawn as a picture and edited like one; on saving, the edits are written back into the PDF and everything else in the file is left as it was.

- **The original text comes from the PDF itself**, exactly, wherever the file carries text. Scans and text inside form fields or notes are read from the picture by the built-in reader instead.
- **The file's own fonts are used for the new text** whenever they contain every character it needs. The result then matches the old text exactly. Fonts inside a PDF are usually cut down to the characters the document uses, so when a character is missing (the app says which), the closest font from the library draws the whole new text instead; the font names in the PDF guide that choice.
- **The replaced text is taken out of the file**, not just covered: the glyphs under each edit are removed from the page's content, so searching or copying no longer finds them. The saved file is read back to confirm this, and the save dialog reports the outcome. The new text is laid over the page as a picture at about 216 dpi; it cannot be selected or searched.
- **整页转成图片** turns every edited page into a picture. Use it when the dialog reports text that could only be covered (text inside reusable page elements), or to leave no trace of a page's original text.
- A form field or note that an edit touches is merged into the page, since PDF readers draw those on top of the page content.
- Password-protected files that restrict changes cannot be rewritten in place: they are saved as a new file with every page as a picture (up to 40 pages).

Limits: horizontal text only; pages in CMYK may show a slight colour difference at the edit; a file that does not carry its fonts looks different in every reader, and so can the edit beside its neighbours; digital signatures stop being valid once a file is changed.

PDF support uses [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) to draw pages and [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT) to write files. Both are served from this site (`docs/pdf/`), load only when a PDF is opened, and work offline.

## Offline use

Fonts are served from this site. In the app, **字体 → 设置离线使用** switches between:

- **在线 (online)** – fonts load as needed; nothing is stored.
- **离线 (offline)** – download font packs to the device: English (≈58 MB), Simplified Chinese (≈71 MB), Traditional Chinese / Japanese / Korean (≈223 MB), and the PDF helper files (≈3 MB: character maps, standard fonts, image decoders). Switching back to online deletes them.

The app itself is kept by a service worker, so it opens without a network either way.

## Reading accuracy (built-in reader)

Measured on cleanly rendered single lines: common English text faces 99.2% of characters (89% of lines exact); Chinese 黑体/宋体 about 99% of characters (about 90% of lines). Handwriting, brush and display faces are read poorly; the app then asks for the text to be typed in.

## Privacy and disclaimer · 隐私与声明

- **Images and PDFs never leave the device.** Opening, reading, editing and saving all happen in the browser. There is no backend: the app does not upload, store or collect images, PDFs or text, and has no analytics or ads. It requests only its own program, font and PDF-library files from this site. GitHub Pages, as the host, keeps ordinary access logs (such as IP addresses); these contain no image content.
- **Open source.** All code is in this repository under the GNU AGPL v3, so the statements above can be checked.
- **Use at your own risk.** For lawful use only. Whoever edits an image is solely responsible for how the result is used and for any consequences. Do not use it to forge or alter identity documents, receipts, contracts, chat records, screenshots used as evidence, or to infringe others' rights. Provided "as is", without warranty; the authors accept no liability for any loss or legal consequence arising from its use.

图片和 PDF 只在你的设备上处理，本应用没有后台，不上传、不保存、不收集图片、PDF 和文字；源代码公开可查。修改后的图片如何使用及其后果，由使用者自行负责；请勿用于伪造证件、票据、合同、截图证据等违法或侵权用途。本工具按“现状”提供，开发者不承担任何责任。

## Build

```sh
npm install            # font packages (@fontsource) and Playwright for tests
node build_site.js     # copies fonts into docs/fonts, writes the offline packs
node build.js          # docs/ (this site) and dist/ (single-file version)
node test/t_pages.js   # installable build end to end, with the service worker

# PDF tests (samples need reportlab, pikepdf, matplotlib, LibreOffice, pdfLaTeX, qpdf; checks use poppler)
python3 test/pdf/make_samples.py && node test/pdf/make_chrome.js
node test/pdf/t_strip.mjs      # glyph positions and removal from the content stream, without a browser
node test/t_pdf.js             # open → read → match → replace → save on PDFs from seven producers
node test/t_pdf_special.js     # scans, protected files, passwords, form fields, whole-page pictures
```

Set `CHROME=/path/to/chrome` to run the browser tests with a system browser.

`test/` also holds the font-matching, layout and reading tests; `train/train_latin.py` retrains the Latin classifier from samples made by `test/gen_*.js`.

## Licences

The app is under the GNU AGPL v3 (see `LICENSE`). `docs/pdf/` holds pdf.js (Apache-2.0) and pdf-lib (MIT), unmodified, with their licence files. The fonts in `docs/fonts/` are open-source fonts redistributed from [Fontsource](https://fontsource.org) under their own licences (SIL Open Font License 1.1 or Apache 2.0); each family's licence is in its folder.
