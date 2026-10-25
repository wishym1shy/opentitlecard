# CLAUDE.md — working habits for OpenTitlecard

Read this first. It describes the app, the rules for changing it, and how to work with the maintainer.

## What this is

**OpenTitlecard** (repo `wishym1shy/opentitlecard`) is a single-file, no-dependency HTML app that renders TikTok-style titlecards for social video to a transparent PNG. See `README.md` for the user-facing description.

- **One file:** `index.html` holds all markup, CSS and JS. Keep it that way. No bundler, no framework, no CDN or network requests.
- `docs/screenshot.png` is the README image. Regenerate it only when the UI visibly changes.
- `LICENSE` is MIT.
- **Name:** the project was called `opentok-titlecard` until the rename. Storage keys are `opentitlecard.*`; `index.html` copies any old `opentok.*` values over once (see `migrateOldKeys`). Keep that migration. "OpenTok" is an unrelated, established product, so don't reintroduce the name.

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

- Tests live in `tests/`: `app.spec.js` (loading, fonts, emoji slots, colour/italic, preview interaction, nudge), `geometry.spec.js` (box rules, descender clearance regression), `wrap.spec.js` (auto-wrap), `nudge-sliders.spec.js` (X/Y nudge sliders), `export.spec.js` (PNG output), `storage-and-presets.spec.js`.
- `tests/helpers.js` has the shared fixture. It opens the app, loads the pinned Inter font through the app's own **Load font file…** input, and fails any test that logs a page error, console error or dialog.
- Dependencies are **dev-only** (`@playwright/test`, `@fontsource/inter`), pinned exactly, with `package-lock.json` committed. The app has no runtime dependencies. Don't add any.
- Keep `window.__tt` (state `S`, layout `L`, `render`, `renderNow`, `exportGeometry`, `draw`) stable. The tests depend on it. If you must change it, update the tests in the same branch.
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
- **Text edits** use a diff against the old text, biased by the caret, to keep the color/italic arrays aligned.

## Calibration (do not change defaults casually)

Box geometry was measured from real reference cards, in em of font size:

- box top ≈ **0.44em** above the cap line (`topPad`)
- box bottom ≈ **0.49em** below the baseline (`botPad`), or **0.24em** below the lowest ink (`clear`), whichever is lower
- side padding ≈ **0.42em**, corner radius ≈ **0.17em**, line pitch ≈ **1.25em**
- each line's box overlaps its neighbours; steps out at the lower line's top, steps in at the upper line's bottom

If you change geometry, re-measure against reference images (alpha channel) and show the numbers in the PR description.

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

## Working with the maintainer

- Be candid. If there is a better approach than the one being asked for, say so, even if the maintainer seems invested. They'd rather pivot than build the wrong thing.
- Explain trade-offs briefly, give a recommendation, then proceed. Ask a question only when the answer changes what you build.
- Give real credit when something is done well. Don't pad it.
- Report what you verified and what you couldn't (for example, a font that isn't installed in the test environment).
- Keep summaries short: what changed, how it was checked, and the one next step worth taking.
