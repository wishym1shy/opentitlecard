# OpenTitlecard

**Open-source titlecards for social video.** TikTok and Instagram-style titlecards as transparent PNGs, straight from your browser. No fussy plugins to install needed!

![OpenTitlecard screenshot](docs/screenshot.png)

Type a line of text, color individual words, and export a transparent PNG with the familiar rounded-box look, ready to drop into Premiere Pro, After Effects, DaVinci Resolve, CapCut, or any editor that reads PNGs.

Unlike title-card tools built for TV episodes, movies or lower thirds, this one is made for short-form social video.

It's a single HTML file. There's nothing to install, nothing to build, and nothing is uploaded anywhere: everything runs locally in your browser.

**Live app:** <https://wishym1shy.github.io/opentitlecard/>

## Why this exists

Paid plugins and MOGRTs can make this style of caption, but:

- **Emoji break.** Paste a titlecard with an emoji into an Adobe text layer and the emoji turns black-and-white and hollow, because Adobe's text engine doesn't render color emoji fonts.
- **One color per card.** Most templates only let you color the whole text block, not a single word.
- **Everyone needs the plugin.** Every editor has to install it, license it, and keep it updated.

OpenTitlecard fixes each of those. Emoji are handled as an empty, correctly-sized **slot** so you can paste your own color emoji on top, and any word can have its own color.

## Features

- **Per-word color and italic.** Put the caret in a word (or select a range) and click a swatch. Click any word in the preview to select it; click it again on its punctuation to select just that (say, a black "!" after a red word). Includes a palette, custom colors, and an eyedropper.
- **Emoji slots.** Type or paste an emoji and it becomes a blank slot in the layout. The background box wraps around it exactly as it would around the real thing. The slot is outlined in the preview only, never in the export.
- **Smart background box.** Each line gets its own rounded box, with inverse corners where line widths differ, like TikTok's own captions. The box grows downward automatically when descenders (`g`, `y`, `p`, `q`, `j`) or an emoji would crowd the bottom edge.
- **Optional auto-wrap.** Set a **Max card width** and long lines wrap at spaces to fit, with the padding included. Your own line breaks always win, and color, italic and emoji slots carry through the wrap.
- **Stretch and squish.** Scale the letters wider or narrower, taller or shorter (50–200%) to play with the shape of any font. The box follows the letters with the same padding, and emoji slots stay square.
- **Text position (line nudge).** Fine-tune the X/Y position of each line's text inside its box with Premiere-style controls: a slider per axis that rests at 0 in the middle (left = negative, right = positive, +Y is down), a number field, and a draggable **X**/**Y** label to scrub. Arrow keys step by 1 (**Shift** = 10), double-click resets an axis, and **Alt**-drag a line in the preview works too.
- **Bring your own font.** Pick any installed font, or load a `.ttf`, `.otf`, `.woff` or `.woff2` file for a client's brand font. A font file you load is remembered in your browser, so it's there next time, even if you move or delete the original. If a font isn't available (say, on another computer), a ⚠ in the family box says so and offers **Reset to Inter (default)**.
- **Background control.** Color, opacity, padding, corner radius, top/bottom margins, and optional soft shadows. Text outline and text shadow are available too.
- **One-click resets.** Size and every Text Settings and Background slider have a ↺ button (or double-click the slider) that puts it back to its default.
- **Transparent PNG export.** Full-frame at 1920×1080, 1080×1920, 3840×2160, 2160×3840, 1080×1080, 1080×1350 or a custom size, or a tight crop of just the card at up to 4×. **Landscape / Vertical** flips the canvas in one click. Exports are limited to 3840 px (4K) on each side.
- **Card names.** Cards are named like layers (Titlecard 1, Titlecard 2…); double-click one to rename it. Paste two columns from a spreadsheet into **Add from list** (a name, then the text) and each card takes its name from the first column. Use `{name}` in the export file name pattern, or click **Name files after the cards**, and every PNG is named after its card.
- **Batch export.** Add several cards (or paste a list of titles), then **Export all as ZIP…** in the Export panel opens a preview of every card, lets you set the canvas (size, custom size, tight crop and scale, card position), apply a preset to the whole batch, and set a file name pattern such as `ClientA-Vid{n}-TC` (first number and zero-padding included), and downloads one transparent PNG per card in a single ZIP. Cards share one style (font, colors, box) unless a card is given its own (◆); text, per-word color, italic and line nudges are always per card. **Apply preset to all cards** restyles the whole batch (after asking you to confirm).
- **Save and open batches.** In the Cards panel's **⋮** menu, **Save batch to file** downloads your cards (text, per-word colors, italics, nudges and styles) as a `.json` file; **Open batch file…** loads it again later. **New batch** (the icon above the card list) starts over. Both ask before replacing cards you haven't saved (a fresh page doesn't ask). Nothing about your cards is kept in the browser.
- **Undo and redo.** **Ctrl+Z** / **Ctrl+Shift+Z** (or **Ctrl+Y**; **⌘Z** / **⌘⇧Z** on a Mac), or the buttons above the preview, step back and forward through text, colors, styles, nudges and card changes, including *New batch* and *Open batch file…*. A burst of typing or one slider drag is a single step. The last 100 steps are kept while the page is open.
- **A tidy first screen.** The page opens on the text: the card's look (Position, Text Position, Text Settings, Background, Emoji Slot) sits folded under **Titlecard Properties**, and only the Cards panel is open on the right.
- **Presets.** Save a style (font, colors, sizes) per client and export/import it as JSON. Mark one as the **default** (★) and the app starts with it the first time it opens (before any settings are saved); after that your last-used settings come back, and **Load** returns to any preset.

## Layout

The version is shown next to the name at the top left; see [CHANGELOG.md](CHANGELOG.md) for what changed in each one.


The design controls are on the left: **Text** at the top (with the font family, weight and size), **Presets** at the bottom, and everything about the card's look in between under **Titlecard Properties** (Position, Text Position, Text Settings, Background, Emoji Slot), folded when the page opens. **Cards**, **Canvas** and **Safe zone** float at the top right of the preview, and **Export** sits by itself at the bottom right: click a panel's title to minimize or expand it (every visit starts with only Cards open), or use **Panels** in the toolbar to hide them all and give the preview the whole width. The app remembers whether the panels are hidden.

**Zoom and pan:** **Ctrl+scroll** (⌘+scroll on a Mac, or pinch on a trackpad) zooms around the cursor; scroll to move around, **Shift+scroll** sideways, or drag with **Space** held or the middle mouse button. The zoom bar at the bottom-left of the preview has −/+, **Fit** and **100%** (actual size); **Ctrl+=**, **Ctrl+−** and **Ctrl+0** do the same. 100% shows one canvas pixel per screen pixel, so past that you see the real export pixels.

## Safe zones

Turn on **Show safe zone** in the **Safe zone** panel to see where a platform's interface covers your video. **Stories** and **Reels** (9:16) shade the interface bars red (250 px at the top and bottom of a 1080 × 1920 frame, plus the side buttons in Reels) and the safe zone green, and the panel tells you whether the card in front is inside it or which part it runs into. You can also load **your own image** (PNG, JPG, WebP or SVG) as the overlay. **Position X / Y** and **Scale** move and resize it, **Opacity** fades it, and **↺** resets each one. The overlay is fitted to the canvas, so it matches exactly on 1080 × 1920 and 2160 × 3840. It is only drawn on the preview: it is **never exported**. The settings are remembered; a loaded image is kept until you reload the page.

## Quick start

1. Open the live app, or download [`index.html`](index.html) and open it in **Chrome or Edge**.
2. Type your text. Press **Enter** for a new line.
3. Select a word and click a color. Add an emoji anywhere to reserve a slot.
4. Click **Download PNG**. Making a set? Add more cards and use **Export all as ZIP…** instead.

### Using it in Premiere Pro (or any editor)

1. Export a **full-frame** PNG that matches your sequence size.
2. Drag the PNG onto the timeline. It keeps its transparency.
3. Paste your emoji image on top. The **Emoji Slot** section (under **Titlecard Properties**) lists each slot's size in pixels and the **Position** to type into the Motion/Transform controls, assuming the PNG sits at its default position and 100% scale.

> Tip: if you want the card sized by the editor instead of the canvas, use **Tight crop** and scale the PNG in your editor.

## Fonts

The default font is **Inter** (Bold), a free, open-source typeface (SIL Open Font License 1.1) that works well for this style. It ships inside `index.html` (about 64 KB, Latin alphabet), so the app looks right on any computer with nothing to install and nothing downloaded. If you have Inter installed, your own copy is used instead (it covers more languages).

To use another font:

- type another installed family into **Font family** (use **Installed fonts…** to browse the list), or
- use **Load font file…** to load any font from disk for the current session.

If the selected family isn't available, the app shows a warning and renders with a fallback font, so you know the export won't match the intended look.

Inter is the only font bundled, and it is open source. The app never bundles any other font, and never uploads fonts. Its copyright notice and license are kept next to the embedded font in `index.html` and in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

## Browser support

Use a Chromium browser (Chrome, Edge, Brave, Arc) for the full experience. The app relies on the Canvas API with letter-spacing, `Intl.Segmenter`, and (optionally) the Local Font Access API and EyeDropper API. Firefox and Safari may work for basic use but are not tested.

## Privacy

Everything happens in your browser. No text, fonts, or images leave your computer. Your last style settings, custom palette colors, saved presets, your batch file-name pattern are stored in your browser's `localStorage` and nowhere else. Font files you load are kept in your browser's IndexedDB on this computer, so they come back next time; **Forget them** under the font buttons removes them. Your cards and their text are **not** stored: they exist only on the page until you save them to a file you choose. The undo history is kept in memory too, and is gone when you close or reload the page. A safe zone image you load stays in memory for the session only.

## Limitations

- Output is a **flat PNG**: the text is not live or editable once exported. Re-open the app to change it.
- Auto-wrap breaks only at spaces (no hyphenation, no mid-word breaks), and a word wider than the limit keeps its own line. Line nudges are tied to line numbers, so changing the max width can change which text a nudge applies to.
- Cards are not kept anywhere automatically: reloading the page starts over, so use **Save batch to file** first. A batch file doesn't contain fonts; a font loaded with **Load font file…** has to be loaded again. Cards share one style unless you tick **This card has its own style**; canvas size and crop are always shared by the whole export. The ZIP uses plain (stored) entries, since PNGs are already compressed.
- Emoji are never drawn by the app. They're intentionally left as empty slots so you can insert any emoji style (iOS, Android) you like in post. This app never bundles or distributes licensed emojis such as the Apple Emoji suite.

## Development

The app itself has **no build step and no runtime dependencies**: it's just `index.html`. Node is only needed to run the tests.

```bash
# run the app: open index.html, or serve the folder
python3 -m http.server 8000

# run the tests (Playwright + Chromium)
npm ci
npx playwright install chromium
npm test
```

The tests load a pinned open-source font (Inter, via `@fontsource/inter`) through the app's own **Load font file…** feature, so results are identical on any machine. GitHub Actions runs the same suite on every pull request and on every push to `main`.

The page exposes a small hook for tests, `window.__tt`, with the state (`S`), the last layout (`L`), `render()`/`renderNow()`, `exportGeometry()` and `draw()`, plus the batch helpers (`cards`, `active`, `batchNames()`, `buildZip()`, `crc32()`).

Contributions are welcome. Open an issue first for anything big. All changes land through pull requests that the maintainer reviews and merges, and CI must pass.

## License

[MIT](LICENSE)

## Disclaimer

This is an independent project. It isn't affiliated with, endorsed by, or sponsored by TikTok, ByteDance, or Adobe. "TikTok" and "Adobe" are trademarks of their respective owners and are used here only to describe compatibility and the style being recreated.
