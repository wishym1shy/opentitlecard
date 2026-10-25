# opentok-titlecard

**Open-source TikTok and Instagram-style titlecards as transparent PNGs, straight from your browser. No fussy plugins to install needed!**

![opentok-titlecard screenshot](docs/screenshot.png)

Type a line of text, color individual words, and export a transparent PNG with the familiar rounded-box look, ready to drop into Premiere Pro, After Effects, DaVinci Resolve, CapCut, or any editor that reads PNGs.

It's a single HTML file. There's nothing to install, nothing to build, and nothing is uploaded anywhere: everything runs locally in your browser.

**Live app:** <https://wishym1shy.github.io/opentok-titlecard/>

## Why this exists

Paid plugins and MOGRTs can make this style of caption, but:

- **Emoji break.** Paste a titlecard with an emoji into an Adobe text layer and the emoji turns black-and-white and hollow, because Adobe's text engine doesn't render color emoji fonts.
- **One color per card.** Most templates only let you color the whole text block, not a single word.
- **Everyone needs the plugin.** Every editor has to install it, license it, and keep it updated.

opentok-titlecard fixes each of those. Emoji are handled as an empty, correctly-sized **slot** so you can paste your own color emoji on top, and any word can have its own color.

## Features

- **Per-word color and italic.** Put the caret in a word (or select a range) and click a swatch. Click any word in the preview to select it. Includes a palette, custom colors, and an eyedropper.
- **Emoji slots.** Type or paste an emoji and it becomes a blank slot in the layout. The background box wraps around it exactly as it would around the real thing. The slot is outlined in the preview only, never in the export.
- **Smart background box.** Each line gets its own rounded box, with inverse corners where line widths differ, like TikTok's own captions. The box grows downward automatically when descenders (`g`, `y`, `p`, `q`, `j`) or an emoji would crowd the bottom edge.
- **Line nudge.** Fine-tune the X/Y position of each line's text inside its box. Use the fields, arrow keys (**Shift** = 10px), or **Alt**-drag a line in the preview.
- **Bring your own font.** Pick any installed font, or load a `.ttf`, `.otf`, `.woff` or `.woff2` file for a client's brand font.
- **Background control.** Color, opacity, padding, corner radius, top/bottom margins, and optional soft shadows. Text outline and text shadow are available too.
- **Transparent PNG export.** Full-frame at 1920×1080, 1080×1920, 3840×2160, 1080×1080, 1080×1350 or a custom size, or a tight crop of just the card at up to 4×.
- **Presets.** Save a style (font, colors, sizes) per client and export/import it as JSON.

## Quick start

1. Open the live app, or download [`index.html`](index.html) and open it in **Chrome or Edge**.
2. Type your text. Press **Enter** for a new line.
3. Select a word and click a color. Add an emoji anywhere to reserve a slot.
4. Click **Download PNG**.

### Using it in Premiere Pro (or any editor)

1. Export a **full-frame** PNG that matches your sequence size.
2. Drag the PNG onto the timeline. It keeps its transparency.
3. Paste your emoji image on top. The **Emoji slot** panel in the app lists each slot's size in pixels and the **Position** to type into the Motion/Transform controls, assuming the PNG sits at its default position and 100% scale.

> Tip: if you want the card sized by the editor instead of the canvas, use **Tight crop** and scale the PNG in your editor.

## Fonts

The default font family is `Linik Sans` (Bold). If it isn't installed on your machine, the app shows a warning and renders with a fallback font so you know the export won't match the intended look. To fix that, either:

- type another installed family into **Font family** (use **Installed fonts…** to browse the list), or
- use **Load font file…** to load any font from disk for the current session.

The app never bundles or uploads fonts.

## Browser support

Use a Chromium browser (Chrome, Edge, Brave, Arc) for the full experience. The app relies on the Canvas API with letter-spacing, `Intl.Segmenter`, and (optionally) the Local Font Access API and EyeDropper API. Firefox and Safari may work for basic use but are not tested.

## Privacy

Everything happens in your browser. No text, fonts, or images leave your computer. Your last style settings, custom palette colors and saved presets are stored in your browser's `localStorage` and nowhere else.

## Limitations

- Output is a **flat PNG**: the text is not live or editable once exported. Re-open the app to change it.
- Line breaks are manual (no auto-wrap) so line nudges stay attached to the lines you chose.
- Emoji are never drawn by the app. They're intentionally left as empty slots.
- No animation. Exports are still images.

## Development

There is no build step and no dependencies. The whole app is `index.html`.

```bash
# any static server works, or just open the file
python3 -m http.server 8000
```

For automated tests, the page exposes a small hook, `window.__tt`, with the state (`S`), the last layout (`L`), `render()`/`renderNow()`, `exportGeometry()` and `draw()`.

Contributions are welcome. Open an issue first for anything big. All changes land through pull requests that the maintainer reviews and merges.

## License

[MIT](LICENSE)

## Disclaimer

This is an independent project. It isn't affiliated with, endorsed by, or sponsored by TikTok, ByteDance, or Adobe. "TikTok" and "Adobe" are trademarks of their respective owners and are used here only to describe compatibility and the style being recreated.
