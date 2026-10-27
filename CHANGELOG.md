# Changelog

What changed in OpenTitlecard, newest first. The version is shown next to the app's name in the header.

Versions are `vMAJOR.MINOR`. Each merged pull request that changes the app adds one to the minor number (v1.31 → v1.32 → …). The changelog started at v1.31: v1.27 stands for everything merged before the UI review that led to v1.28–v1.31 (pull requests up to #31), so the numbers line up with the work done.

## v1.49

### Changed
- **Scale now sits with X and Y** in one section, **Position & Scale**, so the three handles you use most while laying out a mock-up are together. With tight crop on, X and Y step aside and Scale stays.
- **"✓ The card is inside the safe zone" / "⚠ The card …"** now shows at the right end of the bottom bar, next to the line count and card size, so you can read it while you work. The Mock-up & safe zone panel keeps only notes about the overlay itself.

## v1.48

### Changed
- **Size is now Scale**, in its own section in **Titlecard Properties**, right under Position. It is still the font size in px, and since the box, padding and corners are all measured from it, it scales the whole card. Weight now has the Text section's last row to itself.

## v1.47

### Added
- Sidebar sections, the floating panels, the ⋮ menu and the dialogs now animate when they open and close: a quick slide or fade (under a fifth of a second), eased at the start and end, so it's easy to see what just opened or closed. If your system is set to reduce motion, they open and close at once, as before.

## v1.46

### Added
- The **Instagram Reels UI | iPhone 16 Pro** overlay now marks where a 9:16 video plays on that taller screen: a grey area labelled "9x16 video". As in the app on iPhone, the video fills the screen from the very top (under the Dynamic Island) down to the navigation bar, so it is scaled to 2386 px tall and about 68 px of each side is cut off; the label says so. The tint sits behind your card, so the card keeps its real colours.

## v1.45

### Changed
- **A cleaner, more compact sidebar**, laid out like a design tool's properties panel: flat sections split by thin lines instead of boxes, and settings two to a row. The settings themselves are the same.
- Every slider setting (Size, Line height, Letter spacing, Stretch, Max card width, Outline width, Opacity, padding and margins, Corner radius, Clearance, Slot size) is now a **compact field**: type a value (Enter applies it; arrow keys step, Shift = 10 steps), **drag its icon sideways** to scrub (Shift = faster, double-click resets), or drag the slim slider along the bottom of the field. The ↺ reset button shows up only once a value differs from the default.
- **Alignment** is a row of three buttons (left, center, right) instead of a dropdown.
- **Colors** (text, outline, background) show their hex code next to the swatch, and you can type a new one (`#ffe066`, `ffe066` or `fe6`).
- The card **Position** and each line's **Text Position** use the same fields: drag the X or Y to move, or type a value.

## v1.44

### Added
- **iPhone 16 Pro** canvas size: 1206 × 2622, in the Canvas panel and the export dialog.
- **Instagram Reels UI | iPhone 16 Pro** overlay in the Mock-up & safe zone panel: the Reels screen (tabs, like/comment/share buttons, creator, caption and navigation bar) drawn over the preview, so footage + titlecard + interface make a complete mock-up. It fits the iPhone 16 Pro canvas exactly, works with Position, Scale and Opacity like the other overlays, tells you when the card sits under the interface, and is never exported.

## v1.43

### Added
- **Mock-up background:** load a frame of your footage (or any image) and see the card on top of it. It fills the canvas like the video would, with Position X / Y, Scale and Opacity sliders (each with ↺). It is only shown in the preview: the exported PNG stays transparent. The image isn't saved; load it again after a reload.

### Changed
- The **Safe zone** panel is now **Mock-up & safe zone**, with the mock-up at the top. The safe zone works as before and is drawn over the mock-up when both are on.

## v1.42

### Added
- Closing or reloading the tab now asks first when you have cards that aren't saved to a batch file, so a stray refresh can't wipe your work. It doesn't ask on a fresh page, or right after you used **Save batch to file** or **Open batch file…** (until you change something). The message is the browser's own and can't be reworded.

## v1.41

### Fixed
- After renaming a card, clicking the text box (or another card) works straight away: the click is no longer lost.
- **Add from list** reads spreadsheet cells that hold line breaks as one card. Before, they turned into two cards with stray quote marks in the PNG. A row with a name and an empty text cell now makes an empty card with that name.
- With a word's "!" in its own color, clicking the left edge of the "!" selects the "!" (it used to pick the word).
- Right after the app opens, a missing font is reported at once, and Download PNG and the ZIP wait the moment it takes for remembered fonts to load, so they never use a fallback font by accident.
- A font file named like the default font (for example "Inter.ttf") is added as "Inter (file)" instead of replacing the built-in Inter for good.
- The app starts even where the browser refuses access to its storage (for example inside some embedded frames).
- Renaming a card with a Japanese or Chinese keyboard: pressing Enter to confirm a conversion no longer ends the rename.

## v1.40

### Added
- An app icon for the browser tab, bookmarks and phone home screens: a capital **O** with a small raised **t**, white on a cyan, blue and green gradient in a rounded square.

## v1.39

### Added
- **Card names.** Every card has a name, like a layer: Titlecard 1, Titlecard 2 and so on, starting with the first card on a fresh page. Double-click a card (or press F2) to rename it. The list shows each name with the card's text under it.
- **Import with names.** **Add from list** also takes two columns pasted from a spreadsheet, a name and then the text, separated by a tab. Each card is named from the first column. Plain lists (one title per line) work as before, and those cards are named Titlecard N.
- **PNGs named after the cards.** Use `{name}` in the export file name pattern, or click **Name files after the cards** in the export dialog.

### Changed
- Batch files now include each card's name. Files saved before names existed open with their cards numbered Titlecard 1, 2…

## v1.38

### Added
- **Loaded fonts are remembered.** A font you load with **Load font file…** is kept in your browser on this computer, so it's there the next time you open the app, even if you move or delete the original file. Nothing is uploaded. **Forget them**, under the font buttons, removes them.
- **Reset to Inter (default)** in the missing-font warning, for when a font isn't here (another computer, cleared browser data, or a preset from someone else). The family box and the preview then show the same font again.

### Changed
- The missing-font message fades sooner: 2 seconds after you hover it and move away (was 3), or 5 seconds after you start working elsewhere (was 7).

## v1.37

### Added
- Color punctuation on its own: click a word in the preview to select it, then click the **!** (or any punctuation) again to select just that. Clicking the letters instead selects just the word without its punctuation, and one more click goes back to the whole word.

### Fixed
- The preview highlight shows exactly what a color will change. Selecting just the "!" in the text box used to light up the whole word.

## v1.36

### Changed
- New default **Red** (#CF0202) and **Green** (#02CF02) in the palette, right after White and Black, so **Alt+3** is Red and **Alt+4** is Green. They replace the previous red (#FF2D2D) and green (#0ACC09); the other colors move along by one.

## v1.35

### Changed
- When the font in **Font family** isn't installed or loaded, a red **⚠** now sits inside the family box instead of a warning banner across the top of the sidebar. Its message pops out to the right on its own (for example when the app opens with a font file you loaded last time), then fades 3 seconds after you hover it and move away, or 7 seconds after you start working elsewhere. Hover the ⚠ to see it again. Both go away as soon as the font loads.

## v1.34

### Fixed
- After clicking a card in the Cards list, holding **Space** and dragging pans the preview again.
- The **⋮** menu stays next to its button when the window is resized or the panels scroll, opens above the button when there's no room below, and closes when **Tab** moves out of it.
- The card-position fields in **Export all as ZIP…** are described the same way as in **Position** (px at 1080p).

## v1.33

### Changed
- The **Export** panel sits by itself at the bottom right, so the screen reads in order: write and style the text on the left, arrange the cards at the top right, export at the bottom right. When the open panels don't fit the window, Export stays pinned at the bottom while the others scroll.

## v1.32

### Changed
- **Font family**, **Weight** and **Size** moved into the **Text** section, under the text box, so the settings you change on almost every card are there when the page opens. **Align** and the rest of the type settings stay in **Text Settings**.

## v1.31

### Added
- The version number, next to the app's name at the top left. It links to this changelog.
- This changelog.

## v1.30

### Changed
- **Export all as ZIP…** moved from the Cards panel to the Export panel, under **Download PNG**. The Export panel's second button for the same dialog (*All cards (ZIP)…*) is gone, so there is one button for it.

## v1.29

### Changed
- The Cards panel works like a layers panel: the cards sit in a list box, with the card actions as icons in its footer (add, duplicate, move up, move down, delete). **Add from list** and **New batch** are icons above the list, and **Save batch to file** and **Open batch file…** are in a **⋮** menu next to them.
- Up/Down in the card list select the previous or next card.

### Fixed
- Clicking a card no longer drops the keyboard focus from the list.

## v1.28

### Changed
- New **Titlecard Properties** section in the sidebar, folded when the page opens. It holds **Position** (the card's place in the canvas, moved from the Canvas panel), **Text Position** (was *Line nudge*), **Text Settings** (was *Font & type*), **Background** and **Emoji Slot**. Only **Text** and **Presets** stay outside it.
- Every visit starts with only the Cards panel open; Canvas, Safe zone and Export start minimized. Hiding all the panels with **Panels** is still remembered.

## v1.27 and earlier

Before the changelog. Highlights: per-word color and italic, emoji slots, the bundled Inter font, auto-wrap, stretch and squish, line nudges, presets, batches of cards with ZIP export and batch files, undo and redo, floating panels, zoom and pan, and the safe zone overlay. See the [merged pull requests](https://github.com/wishym1shy/opentitlecard/pulls?q=is%3Apr+is%3Amerged) for the details.
