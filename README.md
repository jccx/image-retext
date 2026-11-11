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

## Privacy and disclaimer · 隐私与声明

- **Images never leave the device.** Opening, reading, editing and saving all happen in the browser. There is no backend: the app does not upload, store or collect images or text, and has no analytics or ads. It requests only its own program and font files from this site. GitHub Pages, as the host, keeps ordinary access logs (such as IP addresses); these contain no image content.
- **Open source.** All code is in this repository under the GNU AGPL v3, so the statements above can be checked.
- **Use at your own risk.** For lawful use only. Whoever edits an image is solely responsible for how the result is used and for any consequences. Do not use it to forge or alter identity documents, receipts, contracts, chat records, screenshots used as evidence, or to infringe others' rights. Provided "as is", without warranty; the authors accept no liability for any loss or legal consequence arising from its use.

图片只在你的设备上处理，本应用没有后台，不上传、不保存、不收集图片和文字；源代码公开可查。修改后的图片如何使用及其后果，由使用者自行负责；请勿用于伪造证件、票据、合同、截图证据等违法或侵权用途。本工具按“现状”提供，开发者不承担任何责任。

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
