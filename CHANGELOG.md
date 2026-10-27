# Changelog

What changed in OpenTitlecard, newest first. The version is shown next to the app's name in the header.

Versions are `vMAJOR.MINOR`. Each merged pull request that changes the app adds one to the minor number (v1.31 → v1.32 → …). The changelog started at v1.31: v1.27 stands for everything merged before the UI review that led to v1.28–v1.31 (pull requests up to #31), so the numbers line up with the work done.

## v1.60

### Added
- **Load several font files at once.** In **Load font file…**, pick all the files of a typeface together (Regular, Bold, Italic, Bold Italic…). OpenTitlecard reads each file's own family name, weight and italic, so they join into **one family**: the **Weight** menu switches between the files, and **Italic** uses the real italic file of that weight, not a slanted copy.
- **The Weight menu shows what the font really has.** For a loaded family it lists only its weights (a variable font: the usual steps inside its range). Loading a font moves Weight to the nearest weight it has, so the menu never shows a weight that isn't drawn. A weight the family lacks is marked "(not in this font)".
- **Files that can't be read are flagged, not guessed quietly.** TTF, OTF and WOFF files are read directly. WOFF2 files are compressed in a way a browser can't open, so for those OpenTitlecard guesses the family, weight and italic from the file name, uses the font straight away, and shows a yellow row under the font controls where you can correct all three (**Update**) or confirm them (**Looks right**).

### Changed
- **Loaded fonts are named after the font, not the file.** `Gotham-Bold.otf` is now the family *Gotham* (weight Bold). A font that has the same name as one that comes with the app or one installed on your computer is called "<name> (file)", as before.
- **Old names keep working.** Presets and set files saved before this version name a loaded font after its file (for example `Gotham-Bold`). Those names still resolve to the same font at the same weight, so your cards look exactly as they did; their Weight menu is locked, with a note, because the name stands for one file. Use the family's own name to choose between weights.
- **Fonts remembered by earlier versions are upgraded automatically** the first time you open this version: each is filed under its real family and keeps its old name. A file the app can't read inside (WOFF2) stays exactly as it was.
- The font files you load are remembered face by face (up to 60), so a whole typeface comes back after a reload.

## v1.59

### Added
- **Three more fonts come with the app:** **Montserrat**, **Source Serif 4** and **Playfair Display**, next to Inter. Each has a real italic and a full weight range, and works offline with nothing to install or load. They are open source (SIL Open Font License); their notices are in the app file and in `THIRD_PARTY_LICENSES.md`.
- **A real font picker.** The **Font family** box now has an arrow (or press ↓) that opens a menu: the fonts that come with the app, the fonts you loaded from files, and, once you've pressed **Installed fonts…**, the ones installed on your computer. Every name is shown in its own typeface; type to filter, use ↑ ↓ and Enter, or click. You can still type any family name.

### Changed
- **Installed fonts… opens the menu straight away,** so you can see the list it just read.
- The app file is about 350 KB larger because of the new fonts (about 735 KB now). It still works offline.
- A font file you load that is named like an included font (for example `Montserrat.woff2`) gets its own name, `Montserrat (file)`, instead of replacing it.

## v1.58

### Changed
- **Italic in the default font is now a real italic.** OpenTitlecard now includes Inter Italic, so italic words in Inter are drawn with Inter's own italic letters (single-storey *a*, a descending *f*) and its own spacing, instead of the upright letters tilted. **Cards that already use italic in Inter will look different**: the letter shapes and the width of italic words change, so lines can wrap or fit a little differently. Re-check those cards before you export again. Italic works at every weight.
- **No extra italic correction for real italics.** The small nudge that kept tilted words from crowding their neighbours is now only applied to fonts that have no italic of their own; a real italic already spaces itself.
- The app file is about 70 KB larger because of the italic font. It still works offline.

## v1.57

### Added
- **Update available:** if a newer version of OpenTitlecard comes out while the app is open, a pulsing green **↻ Update available · Click to reload** pill appears next to the version number. Click it to reload and get the new version; if you have unsaved cards, the browser asks first. The app checks by re-reading its own page when it opens, when you come back to the tab, and every 30 minutes. It sends nothing about you or your work, and never checks when opened as a local file.

## v1.56

### Added
- **Export preview:** in **Export all as ZIP…**, click a card's thumbnail (or press Enter on it) to see it large, exactly as the PNG will be exported, with its file name, size and "2 of 5". Flip through the cards with the ‹ › buttons or ← → (Home and End jump to the first and last); empty cards aren't shown, since they aren't exported. Esc closes the preview and returns to the export dialog.

## v1.55

### Changed
- **Export all as ZIP… names files after the set.** The file name pattern now starts as `{set}-{n}`. In a set named *Promo* that gives `Promo-1.png`, `Promo-2.png`… inside `Promo.zip`. An untitled set still gives `titlecard-1.png`. **Name files after the set** returns to this pattern after you've typed your own. If your saved pattern was the old default, it switches over automatically; a pattern you typed yourself is kept.
- **The export previews show the canvas's real shape.** On a vertical canvas the thumbnails are tall, with the checkerboard on the canvas itself, so you can see where each card sits. They're also larger than before.

## v1.54

### Added
- **☰ File menu** at the top right of the toolbar: New set, Open set…, Save set, Save set as…, Import and export presets, Soft reset… and Reset all….
- **Set name:** name your set in the box next to the File menu. Saving names the file after it, and opening a file brings its name back.
- **`.opntcd` set files:** sets are saved as `.opntcd` files, so they're easy to spot. They're still plain JSON inside, and sets saved earlier as `.json` still open.
- **Save to the same file (Chrome, Edge):** the first Save asks where to put the file, and later Saves update that same file instead of downloading a new copy each time. **Save set as…** makes a copy. Other browsers still download a copy on every Save.
- **Shortcuts:** Ctrl+S (⌘S) saves the set, Ctrl+Shift+S saves it as a new file, Ctrl+O (⌘O) opens one.
- **Drag and drop:** drop a set file anywhere on the page to open it. It asks first if there's unsaved work on the page.
- **Soft reset…** puts every setting back to how the app first opens, and keeps your presets, palette colors and remembered fonts. **Reset all…** deletes everything the app keeps in your browser. Both list exactly what they clear before you confirm.

### Changed
- What was called a "batch" is now a **set** everywhere in the app.
- The Export panel now offers **Download PNG** and **Export all N as ZIP…** as two equal buttons, with the number of cards in the label.
- Save and Open moved from the Cards panel's ⋮ menu to the File menu, and preset Export JSON / Import JSON moved from the Presets section to the File menu.
- The canvas size moved from the toolbar to the bottom bar, and **Panels** is now its own button over the top right of the preview.
- A preset file that can't be read is reported in the bottom bar instead of a browser alert.

## v1.53

### Added
- The **Instagram Reels UI | iPhone 16 Pro** overlay now shows what the phone itself hides from a viewer: the screen's rounded corners (blacked out), the Dynamic Island, and the home indicator bar at the bottom. Sizes follow Apple's screen specs and commonly used developer measurements; the phone's body is outside the canvas, so it isn't drawn.

## v1.52

### Changed
- The **Instagram Reels UI | iPhone 16 Pro** overlay now matches a current Reels screenshot more closely. The **+**, **Reels** / **Friends** tabs and friend bubbles sit higher, just under the status bar, and are larger. The like, comment, repost and share buttons now sit mid-screen, as in the app (they were too low), and repost has no count. The creator row, Follow button and caption line up with the app, and the camera button and "Followed by" line are gone.

### Added
- The overlay draws the missing parts of the screen as generic shapes: the status bar (time, signal, Wi-Fi, battery), the ⋯ menu lines above the audio square, a music line under the creator's name, the video's progress line, and the nav bar's house, white Reels button, messages, search and profile icons, with a notification dot on the profile.

## v1.51

### Changed
- The **Instagram Reels UI | iPhone 16 Pro** overlay's navigation bar is now solid black, as in the app, so a mock-up background is framed by it instead of showing through. It follows the overlay's Opacity like the rest of the overlay.
- The safe zone section is now **Safe zone & overlay**, and its switch **Show safe zone/overlay**, since it also holds the phone screen overlay.

## v1.50

### Added
- **Auto-scale:** when you change the canvas size (size menu, Landscape / Vertical, a custom size, or the export dialog), Scale is set so the card fits with at least 20 px of room on each side. It shrinks the card for a narrow canvas and grows it back on a wider one, never past the Scale you chose; if you change Scale yourself, that becomes the size it keeps. It works for every card (cards sharing a style are fitted together, a card with its own style on its own), it's one undo step with the canvas change, and it never changes anything when the app opens. Turn it off under Scale in **Position & Scale**.
- **Wrong canvas warning:** with the **Instagram Reels UI | iPhone 16 Pro** overlay on and a canvas that isn't 1206 × 2622, the bottom bar and the panel say so, with a **Use iPhone 16 Pro canvas** button, so you don't lay out a card against a shrunken phone and export it at the wrong size.

### Changed
- The mock-up and safe zone **X / Y offset, Scale and Opacity** settings now look and work like Position & Scale in the sidebar: X and Y side by side, then Scale, then Opacity, each with a typed value, a drag-to-scrub icon (double-click to reset) and ↺ on Scale and Opacity.

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
