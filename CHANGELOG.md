# Changelog

What changed in OpenTitlecard, newest first. The version is shown next to the app's name in the header.

Versions are `vMAJOR.MINOR`. Each merged pull request that changes the app adds one to the minor number (v1.31 → v1.32 → …). The changelog started at v1.31: v1.27 stands for everything merged before the UI review that led to v1.28–v1.31 (pull requests up to #31), so the numbers line up with the work done.

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
