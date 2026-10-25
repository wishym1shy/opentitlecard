# CLAUDE.md — working habits for OpenTitlecard

Read this first. It describes the app, the rules for changing it, and how to work with the maintainer.

## What this is

**OpenTitlecard** (repo `wishym1shy/opentitlecard`) is a single-file, no-dependency HTML app that renders TikTok-style titlecards for social video to a transparent PNG. See `README.md` for the user-facing description.

- **One file:** `index.html` holds all markup, CSS and JS. Keep it that way. No bundler, no framework, no CDN or network requests.
- `docs/screenshot.png` is the README image. Regenerate it only when the UI visibly changes.
- `LICENSE` is MIT.
- **Name:** the project was called `opentok-titlecard` until the rename. Storage keys are `opentitlecard.*`; `index.html` copies any old `opentok.*` values over once (see `migrateOldKeys`). Keep that migration. "OpenTok" is an unrelated, established product, so don't reintroduce the name.

## Product context (why it is built this way)

- **Who it is for:** video editors who need TikTok-style titlecards (white rounded box, bold text, per-line boxes) as a transparent PNG without buying plugins. The workflow target is editors staying inside Premiere Pro; the PNG also works in After Effects, DaVinci Resolve, CapCut and anything else that reads PNGs.
- **Static PNG only.** No animation, pop-ins or video export. Animated templates are a separate, later project (a MOGRT). A MOGRT is a zip of an After Effects project with expression logic and cannot be generated from this HTML app, so don't try to emit one here.
- **Emoji are empty slots, never drawn.** Adobe's text engine can't render colour emoji fonts (they come out hollow and black-and-white), and Apple's emoji artwork is copyrighted and can't be bundled. The editor pastes the real iOS emoji on top in their editor. The slot reserves exactly the right space, and the **Emoji slot** panel gives its size and Position values. Don't "helpfully" draw emoji.
- **Default font is Linik Sans Bold**, but it must stay swappable (installed fonts or a loaded file) because clients bring their own. Fonts are never bundled; if the selected family isn't installed the app says so.
- **Per-word colour and italic are the headline features** that existing templates lack (they colour the whole text block only).
- **Keep the repo neutral.** This is a public, general-purpose open-source tool. Don't put any employer, studio or client names, internal paths, sample client copy or branding in code, tests, docs, commit messages or PRs.

## Git and PR rules (important)

Tooling note: in Claude Code web sessions `gh pr create` fails because GraphQL is blocked. Open PRs with the REST API instead: `gh api repos/wishym1shy/opentitlecard/pulls --input pr.json` (JSON with `title`, `head`, `base`, `body`).

1. **Never push to `main`.** The initial commit was the only exception. Every change goes on a branch (`feat/…`, `fix/…`, `docs/…`, `ci/…`) and reaches `main` through a pull request.
2. **Open a pull request when a branch is ready** (tests pass locally). Don't wait to be asked, and don't open PRs for half-finished work. The PR description says what changed, why, how it was verified, and what could *not* be verified. For geometry changes, include the measurements.
3. **Never merge, approve, or enable auto-merge.** The maintainer reviews and merges every PR, personally. Your job ends at an open PR with green CI.
4. Never force-push, rewrite published history, or delete branches unless asked.
5. Keep commits small and focused, with clear messages. One concern per branch.
6. Don't commit test output (`test-results/`, `playwright-report/`), scratch scripts, downloaded fonts or exported PNGs. Anything under `docs/` must be intentional.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs the Playwright suite in headless Chromium on every pull request and every push to `main`. A PR is only ready when CI is green. The maintainer still reviews and merges.

- Tests live in `tests/`: `app.spec.js` (loading, fonts, emoji slots, colour/italic, preview interaction, nudge), `geometry.spec.js` (box rules, descender clearance regression), `wrap.spec.js` (auto-wrap), `nudge-sliders.spec.js` (X/Y nudge sliders), `export.spec.js` (PNG output), `storage-and-presets.spec.js`, `batch.spec.js` (cards, file names, ZIP writer, export dialog), `card-styles.spec.js` (per-card styles, apply preset to all).
- `tests/helpers.js` has the shared fixture. It opens the app, loads the pinned Inter font through the app's own **Load font file…** input, and fails any test that logs a page error, console error or dialog.
- Dependencies are **dev-only** (`@playwright/test`, `@fontsource/inter`), pinned exactly, with `package-lock.json` committed. The app has no runtime dependencies. Don't add any.
- Keep `window.__tt` (state `S`, layout `L`, `render`, `renderNow`, `exportGeometry`, `draw`, and the batch helpers `cards`, `active`, `batchNames`, `zipStem`, `crc32`, `buildZip`) stable. The tests depend on it. If you must change it, update the tests in the same branch.
- **A bug fix needs a test that fails without the fix.** Prove it: break the code on purpose, watch the test fail, restore it.
- Tests assert *rules* (em-based margins, alignment, transparency), not font-specific pixel values, so they hold on any machine.
- Tests that fail only on CI: check the uploaded `playwright-report` artifact before guessing.

## Architecture in one screen

- **State** `S` holds text plus per-UTF-16-unit `colors[]` and `ital[]` arrays, per-line `nudges[]`, and all style settings.
- **`layout()`** works in design units (px at 1080p-class, `scale = max(W,H)/1920`). It returns lines, items (text runs and emoji slots), word boxes for hit-testing, and the per-line box rectangles.
- **`wrapItems()`** (called from `layout()` once per manual line) does optional greedy word-wrap when `S.wrap` > 0. `S.wrap` is the whole card width, padding included. A word is a run of non-space pieces, so an emoji slot typed right after a word stays glued to it. Styled runs are rebuilt after splitting so color and italic survive. Breaks happen only at spaces.
- **`draw()`** paints from the layout at any scale. Preview and export use the same function, so they match. Geometry is computed in units and multiplied by `u`; shadows and letter-spacing are set in device pixels.
- **`roundedUnion()`** builds the outline of the overlapping per-line rectangles and rounds every corner (convex and concave) with `arcTo`.
- **Emoji** are detected with `Intl.Segmenter` plus a regex (`Emoji_Presentation`, VS16, regional indicators, keycaps, ZWJ). `™ © # 1` stay text. Emoji are never drawn, only reserved as slots.
- **`italicShift()`** fixes a slanted word looking too close to the next word and too far from the previous one: a slanted glyph keeps its baseline but leans right as it rises. It measures how far the ink of a fixed reference glyph (`H`) moves when italic, and `layout()` shifts every italic run left by that amount (run `x` and word boxes, so highlight and click targets match what is drawn). A fixed glyph is deliberate: measuring each word's own ink overshoots on words with tall letters such as `Titlecard`.
- **Nudge controls:** `S.nudges[i] = {x,y}` is the single source of truth. Each line row has three controls per axis (slider resting at 0, a draggable X/Y scrub label, and a number field) and all read and write it through `setNudge()`. The slider covers +-200, the number field accepts any value, and `syncNudgeRows()` keeps them in step. Number inputs carry `data-i`/`data-a`; sliders and labels use `data-slider`/`data-scrub` plus `data-line`, so the two kinds of selector never collide. Alt-drag in the preview writes the same state.
- **Cards (batch):** the active card always lives in `S` (text, `colors`, `ital`, `nudges`), so every existing control and test keeps working. `cards[]` holds a copy of each card; `selectCard()` stashes `S` into `cards[active]` and adopts the next one. Style is shared by default: `sharedStyle` is what every card without its own `card.style` uses, and a card can carry its own copy of the `CARD_STYLE_KEYS` (canvas/crop keys stay global, they belong to the export). Whichever style applies to the active card is what `S` holds, so the style controls edit "the card in front of you"; `persistStyle()` always saves the shared one so a card's own style never becomes what the app opens with. "Apply preset to all" sets `sharedStyle` and drops every card's own style. `withCard(card, fn)` swaps a card into `S`/`L` for the duration of `fn` (thumbnails and export) and always restores the active card. `exportCanvas()` is the single place a card is painted at export size, used by both Download PNG and the ZIP.
- **Batch export:** `batchNames()` turns the pattern (`{n}` token) into unique file names, `buildZip()` writes a stored (uncompressed) ZIP with its own `crc32()`; no library, no network. Empty cards are skipped and don't use up a number. The dialog is a native `<dialog>`; its naming settings persist under `opentitlecard.batch`.
- **Default preset:** its name is stored under `opentitlecard.defaultPreset`. It applies on **first load only** (maintainer decision on #15): at startup, if there is no saved `opentitlecard.style` yet, `applyStyle()` copies the preset into `S` right after `S` is built and `persistStyle()` keeps it as the last-used style. Once any style is saved, the last-used style wins on later loads. Deleting a preset clears it if it was the default.
- **Text edits** use a diff against the old text, biased by the caret, to keep the color/italic arrays aligned.

## Calibration (do not change defaults casually)

Box geometry was measured from real reference cards, in em of font size:

- box top ≈ **0.44em** above the cap line (`topPad`)
- box bottom ≈ **0.49em** below the baseline (`botPad`), or **0.24em** below the lowest ink (`clear`), whichever is lower
- side padding ≈ **0.42em**, corner radius ≈ **0.17em**, line pitch ≈ **1.25em**
- each line's box overlaps its neighbours; steps out at the lower line's top, steps in at the upper line's bottom

If you change geometry, re-measure against reference images (alpha channel) and show the numbers in the PR description.

**The reference cards are not in this repo** (they are third-party material). Before changing any calibration number, ask the maintainer for fresh reference images and measure those. Don't tune geometry by eye or from the app's own output, and don't treat "the tests pass" as proof the look is right: the tests check rules, not fidelity to the originals.

## Rules for contributions

- No new runtime dependencies. No network calls. Nothing is uploaded.
- **Never bundle proprietary assets:** fonts, Apple emoji artwork, plugin/MOGRT files, or client branding. Fonts come from the user's machine or a file the user loads.
- Wrap every `localStorage` access in try/catch. The app must work with storage unavailable.
- Chromium-only APIs (`queryLocalFonts`, `EyeDropper`, `ctx.letterSpacing`, `roundRect`) must be feature-detected where practical and degrade gracefully.
- Keep the font-missing banner honest: if the selected family isn't available, say so.
- Preserve accessibility basics: labels on inputs, visible focus, keyboard-reachable controls.
- Prefer small, readable functions. Comment the *why* for geometry and text-diff code.

## Testing

```bash
npm ci && npx playwright install chromium   # once
npm test                                    # whole suite, ~1 min
npx playwright test --grep "descender"      # a subset
```

Before proposing a change: run the suite, and for geometry changes also render the reference texts and measure box edges from the alpha channel (see Calibration). Report what you verified and anything you couldn't (e.g. a font that isn't installed in the test environment).

## Working in a Claude Code web sandbox (quirks to expect)

- **GitHub access is per session.** If `gh` returns "GitHub access to this repository is not enabled", attach the repo with `add_repo` (use `access: "push"`), and only clone once. GraphQL (`gh pr create`) and org-wide search are blocked; use REST (`gh api repos/wishym1shy/opentitlecard/...`). Some paths, such as the Pages settings API, are blocked too, so ask the maintainer to check those in the web UI.
- **Don't `sleep`.** Foreground `sleep` is blocked. To wait for CI, poll in a loop, e.g. until `gh api repos/wishym1shy/opentitlecard/commits/$SHA/check-runs` reports every run completed.
- **Single-branch clones:** the clone may fetch only `main`. After creating a branch, add a matching `remote.origin.fetch` refspec so the session's stop hook can see the remote branch, and push every branch before ending a turn (the hook flags unpushed commits).
- **Untracked `node_modules`:** a branch that predates `.gitignore` shows it as untracked; put `node_modules/`, `test-results/` and `playwright-report/` in `.git/info/exclude` locally instead of committing anything.
- **Playwright browsers** are pre-installed (`/opt/pw-browsers`); don't run `playwright install` there. Run the suite with `npm test`.
- **Check, don't assume, that PRs merge cleanly.** Before saying two branches are independent, run `git merge-tree --write-tree --name-only A B` (or merge them in a throwaway branch and run the suite). Conflicts have happened in `CLAUDE.md` and `tests/app.spec.js` because several PRs touch the same lines.
- **Prove tests can fail.** For every new test, break the code on purpose (a mutant), watch that test fail, then restore. A test that has never been seen to fail proves little.
- **Unique element ids.** A duplicate `id` once broke the preview-background buttons silently; there is a regression test, but keep ids unique when adding controls.

## Known gaps and backlog

- Unverified things (Linik Sans, touch, screen readers, Premiere end to end, real italic faces, a real pre-rename browser profile) are tracked in issue #11. Don't claim any of them as verified until its box is ticked.
- Repo settings and housekeeping that only the maintainer can do (branch protection, About text and topics, Pages check, retiring the older local copy) are tracked in issue #12. Claude never changes repo settings, merges, or approves.

## Working with the maintainer

- Be candid. If there is a better approach than the one being asked for, say so, even if the maintainer seems invested. They'd rather pivot than build the wrong thing.
- Explain trade-offs briefly, give a recommendation, then proceed. Ask a question only when the answer changes what you build.
- Give real credit when something is done well. Don't pad it.
- Report what you verified and what you couldn't (for example, a font that isn't installed in the test environment).
- Keep summaries short: what changed, how it was checked, and the one next step worth taking.
