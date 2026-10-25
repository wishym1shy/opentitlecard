// Shared helpers for the opentitlecard tests.
const path = require('path');
const { pathToFileURL } = require('url');
const { test: base, expect } = require('@playwright/test');

const APP_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
// Open-source font (SIL OFL) from devDependencies. It is loaded through the app's own
// "Load font file…" input so every machine (and CI) renders with identical metrics.
const FONT_FILE = require.resolve('@fontsource/inter/files/inter-latin-800-normal.woff2');
const FONT_FAMILY = 'inter-latin-800-normal'; // the app derives the family from the file name

async function loadTestFont(page) {
  await page.setInputFiles('#fontFile', FONT_FILE);
  await page.waitForFunction(
    (fam) => window.__tt && window.__tt.S.family === fam && document.querySelector('#fontChip').classList.contains('ok'),
    FONT_FAMILY
  );
}

/** Fixture: opens the app, loads the test font, and fails the test on any page/console error. */
const test = base.extend({
  app: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await loadTestFont(page);
    await use({ page, errors });
    expect(errors, 'no page errors, console errors or dialogs').toEqual([]);
  },
});

/** Replace the textarea contents (and reset per-character formatting, as a user typing would). */
async function setText(page, text) {
  await page.fill('#text', text);
  await settle(page);
}

/** Force a synchronous render and return a JSON-safe snapshot of the layout. */
async function settle(page) {
  return page.evaluate(() => {
    __tt.renderNow();
    const L = __tt.L;
    return {
      size: L.size, capH: L.capH, cardW: L.cardW, cardH: L.cardH, padX: L.padX,
      lines: L.lines.map((l) => ({
        x0: l.x0, x1: l.x1, y0: l.y0, y1: l.y1, base: l.base, cy: l.cy, below: l.below, tx: l.tx, nx: l.nx, ny: l.ny,
        w: l.w, words: l.words,
        items: l.items.map((i) => ({ k: i.k, x: i.x, w: i.w, text: i.text, s: i.s, e: i.e })),
      })),
    };
  });
}

async function setRange(page, id, value) {
  await page.evaluate(({ id, value }) => {
    const el = document.querySelector('#' + id);
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, value });
  await settle(page);
}

async function setSelection(page, start, end = start) {
  await page.evaluate(({ start, end }) => {
    const t = document.querySelector('#text');
    t.focus();
    t.setSelectionRange(start, end);
  }, { start, end });
}

/** Click "Download PNG" and return the file as a Buffer. */
async function exportPng(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const stream = await dl.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return { buffer: Buffer.concat(chunks), filename: dl.suggestedFilename() };
}

/**
 * Decode a PNG inside the browser and answer pixel questions without shipping megabytes of pixels back.
 * queries: [{type:'px',x,y} | {type:'bbox'} | {type:'inkRuns',gap} | {type:'colBox',x} | {type:'lowestDark',x0,x1} | {type:'noBlue',x0,y0,x1,y1}]
 */
async function inspectPng(page, buffer, queries) {
  return page.evaluate(async ({ b64, queries }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const cx = cv.getContext('2d');
    cx.drawImage(bmp, 0, 0);
    const W = bmp.width, H = bmp.height;
    const d = cx.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    const out = { w: W, h: H, results: [] };
    for (const q of queries) {
      if (q.type === 'px') out.results.push(at(q.x, q.y));
      else if (q.type === 'bbox') {
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        out.results.push(x1 < 0 ? null : { x0, y0, x1, y1 });
      } else if (q.type === 'colBox') {
        let a = -1, b = -1;
        for (let y = 0; y < H; y++) if (d[(y * W + q.x) * 4 + 3] > 128) { if (a < 0) a = y; b = y; }
        out.results.push(a < 0 ? null : { top: a, bottom: b });
      } else if (q.type === 'inkRuns') {
        // column ranges that contain ink, merging columns closer than q.gap px (i.e. one run per word)
        const runs = []; let last = -1e9;
        for (let x = 0; x < W; x++) {
          let ink = false;
          for (let y = 0; y < H && !ink; y++) if (d[(y * W + x) * 4 + 3] > 128) ink = true;
          if (!ink) continue;
          if (x - last > q.gap) runs.push([x, x]); else runs[runs.length - 1][1] = x;
          last = x;
        }
        out.results.push(runs);
      } else if (q.type === 'lowestDark') {
        let low = -1;
        for (let y = 0; y < H; y++) for (let x = q.x0; x <= q.x1; x++) { const p = at(x, y); if (p[3] > 200 && p[0] + p[1] + p[2] < 150) { low = y; break; } }
        out.results.push(low);
      } else if (q.type === 'noBlue') {
        let n = 0;
        for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) { const p = at(x, y); if (p[3] > 60 && p[2] > 200 && p[0] < 150) n++; }
        out.results.push(n);
      }
    }
    return out;
  }, { b64: buffer.toString('base64'), queries });
}

module.exports = { test, expect, APP_URL, FONT_FILE, FONT_FAMILY, loadTestFont, setText, settle, setRange, setSelection, exportPng, inspectPng };
