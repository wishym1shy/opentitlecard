# Changelog

What changed in OpenTitlecard, newest first. The version is shown next to the app's name in the header.

Versions are `vMAJOR.MINOR`. Each merged pull request that changes the app adds one to the minor number (v1.31 → v1.32 → …). The changelog started at v1.31: v1.27 stands for everything merged before the UI review that led to v1.28–v1.31 (pull requests up to #31), so the numbers line up with the work done.

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
