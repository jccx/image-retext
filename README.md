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

## Offline use

Fonts are served from this site. In the app, **字体 → 设置离线使用** switches between:

- **在线 (online)** – fonts load as needed; nothing is stored.
- **离线 (offline)** – download font packs to the device: English (≈58 MB), Simplified Chinese (≈71 MB), Traditional Chinese / Japanese / Korean (≈223 MB). Switching back to online deletes them.

The app itself is kept by a service worker, so it opens without a network either way.

## Reading accuracy (built-in reader)

Measured on cleanly rendered single lines: common English text faces 99.2% of characters (89% of lines exact); Chinese 黑体/宋体 about 99% of characters (about 90% of lines). Handwriting, brush and display faces are read poorly; the app then asks for the text to be typed in.

## Build

```sh
npm install            # font packages (@fontsource) and Playwright for tests
node build_site.js     # copies fonts into docs/fonts, writes the offline packs
node build.js          # docs/ (this site) and dist/ (single-file version)
node test/t_pages.js   # installable build end to end, with the service worker
```

`test/` also holds the font-matching, layout and reading tests; `train/train_latin.py` retrains the Latin classifier from samples made by `test/gen_*.js`.

## Licences

The app is under the GNU AGPL v3 (see `LICENSE`). The fonts in `docs/fonts/` are open-source fonts redistributed from [Fontsource](https://fontsource.org) under their own licences (SIL Open Font License 1.1 or Apache 2.0); each family's licence is in its folder.
