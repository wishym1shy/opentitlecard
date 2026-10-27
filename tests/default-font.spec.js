const { test, expect, expandUi, APP_URL, setText, settle, setRange, exportPng, inspectPng } = require('./helpers');

// These tests never load the test font: they use the Inter that ships inside index.html, i.e. what a first-time
// visitor gets. (Every other spec loads a pinned static Inter through "Load font file…" for identical metrics.)

// Some machines (a developer's, maybe CI) have Inter installed, which would hide the bundled path. This makes the app's
// "is it installed?" probe behave as if Inter were not installed, like on a first-time visitor's computer.
const NO_SYSTEM_INTER = () => {
  const measure = CanvasRenderingContext2D.prototype.measureText;
  CanvasRenderingContext2D.prototype.measureText = function (text) {
    if (text === 'mmmmmmmmmmlliWWW@@ABC123' && /\bInter\b/.test(this.font)) {
      const f = this.font;
      this.font = f.replace(/"?\bInter\b"?,\s*/, '');
      const r = measure.call(this, text);
      this.font = f;
      return r;
    }
    return measure.call(this, text);
  };
};
const combine = (...fns) => ({ content: fns.map((f) => `(${f})();`).join('\n') });

async function openPlain(browser, init) {
  const context = await browser.newContext();
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await expandUi(page);
  return { context, page, errors, requests };
}
const bundledLoaded = (page) => page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes('OpenTitlecard Inter') && f.status === 'loaded'));

test.describe('bundled default font (Inter)', () => {
  test('a fresh load on a computer without Inter is ready to use: Inter is selected, the chip is green, no warning, and nothing is fetched', async ({ browser }) => {
    const { context, page, errors, requests } = await openPlain(browser, NO_SYSTEM_INTER);
    await bundledLoaded(page);
    expect(await page.evaluate(() => ({ family: __tt.S.family, weight: __tt.S.weight }))).toEqual({ family: 'Inter', weight: 700 });
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    await expect(page.locator('#fontChip')).toContainText('Inter 700');
    await expect(page.locator('#fontWarn')).toBeHidden();
    await expect(page.locator('#export')).toHaveText('Download PNG');
    expect(requests.filter((u) => !/^(file|data|blob):/.test(u)), 'no network requests').toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('the warning never flashes while the embedded font loads', async ({ browser }) => {
    const { context, page } = await openPlain(browser, combine(NO_SYSTEM_INTER, () => {
      // hold the embedded font back for 600 ms so the "still loading" window is long enough to observe
      const load = FontFace.prototype.load;
      FontFace.prototype.load = function () { return new Promise((r) => setTimeout(r, 600)).then(() => load.call(this)); };
      window.__bannerSeen = false;
      const t = () => { const b = document.querySelector('#fontWarn'); if (b && !b.hidden) window.__bannerSeen = true; if (performance.now() < 2500) requestAnimationFrame(t); };
      requestAnimationFrame(t);
    }));
    await bundledLoaded(page);
    await page.waitForTimeout(2600);
    expect(await page.evaluate(() => window.__bannerSeen)).toBe(false);
    await context.close();
  });

  test('the embedded face is real and its weight axis works for every weight in the menu (measured on the bundled family itself)', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await bundledLoaded(page);
    const m = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('2d'), out = { bundled: {}, mono: 0 };
      c.font = '700 100px monospace'; out.mono = c.measureText('Titlecard weights').width;
      for (const w of [400, 500, 600, 700, 800, 900]) { c.font = `${w} 100px "OpenTitlecard Inter"`; out.bundled[w] = c.measureText('Titlecard weights').width; }
      return out;
    });
    const seq = Object.values(m.bundled);
    expect(Math.abs(seq[3] - m.mono), 'not the generic fallback').toBeGreaterThan(5);
    for (let i = 1; i < seq.length; i++) expect(seq[i], `weight ${Object.keys(m.bundled)[i]} is wider than the one before`).toBeGreaterThan(seq[i - 1]);
    expect(seq[5] / seq[0]).toBeGreaterThan(1.03);
    await context.close();
  });

  test('the default draws in Inter (not a generic fallback) and every weight in the menu changes the layout', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await bundledLoaded(page);
    await setText(page, 'Titlecard weights');
    const widths = [];
    for (const w of [400, 700, 900]) { await page.selectOption('#weight', String(w)); widths.push((await settle(page)).lines[0].w); }
    expect(widths[1]).toBeGreaterThan(widths[0]);
    expect(widths[2]).toBeGreaterThan(widths[1]);
    await page.selectOption('#weight', '700');
    const inter = (await settle(page)).lines[0].w;
    await page.fill('#family', 'Courier New');
    expect(Math.abs((await settle(page)).lines[0].w - inter)).toBeGreaterThan(5);
    await context.close();
  });

  test('the app draws with a stack that puts the bundled face right after "Inter" (an installed Inter wins; otherwise the bundled one)', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await bundledLoaded(page);
    // draw() restores the canvas state, so record every font string it sets instead of reading the final one
    const fontsUsed = (family) => page.evaluate((fam) => {
      __tt.S.family = fam; __tt.renderNow();
      const c = document.createElement('canvas'); c.width = 400; c.height = 200;
      const ctx = c.getContext('2d'), desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font'), seen = new Set();
      Object.defineProperty(ctx, 'font', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); seen.add(desc.get.call(this)); } });
      __tt.draw(ctx, 400, 200, { u: 0.2, cx: 200, cy: 100, guides: false, sel: null });
      return [...seen];
    }, family);
    const inter = await fontsUsed('Inter');
    expect(inter.length).toBeGreaterThan(0);
    for (const f of inter) expect(f).toMatch(/Inter, "?OpenTitlecard Inter"?, /);
    for (const f of await fontsUsed('inter')) expect(f).toMatch(/inter, "?OpenTitlecard Inter"?, /i);
    const other = await fontsUsed('Courier New');
    expect(other.length).toBeGreaterThan(0);
    for (const f of other) expect(f).not.toContain('OpenTitlecard Inter'); // other families keep the plain fallback
    await context.close();
  });

  test('the export dialog does not warn about the default font on a computer without Inter, and a card with its own Inter style is fine too', async ({ browser }) => {
    const { context, page } = await openPlain(browser, NO_SYSTEM_INTER);
    await bundledLoaded(page);
    await page.click('#batchOpen');
    await expect(page.locator('#bFont')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.click('#cardAdd');
    await page.fill('#text', 'Second');
    await page.check('#cardOwn');
    await page.click('#batchOpen');
    await expect(page.locator('#bFont')).toBeHidden();
    await context.close();
  });

  test('"inter" in any case counts as the bundled font; a family that is not installed still warns', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await bundledLoaded(page);
    await page.fill('#family', 'inter');
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    await page.fill('#family', 'Definitely Not An Installed Font 12345');
    await expect(page.locator('#fontChip')).toHaveClass(/bad/);
    await expect(page.locator('#fontWarnMsg')).toContainText("isn't installed");
    await context.close();
  });

  test('if the embedded font cannot load, the app says so instead of pretending', async ({ browser }) => {
    const { context, page } = await openPlain(browser, combine(NO_SYSTEM_INTER, () => {
      const Orig = window.FontFace;
      window.FontFace = function (name, ...rest) { if (String(name).includes('OpenTitlecard Inter')) throw new Error('blocked'); return new Orig(name, ...rest); };
      window.FontFace.prototype = Orig.prototype;
    }));
    await expect(page.locator('#fontChip')).toHaveClass(/bad/);
    await expect(page.locator('#fontWarn')).toBeVisible();
    await expect(page.locator('#fontWarnMsg')).toContainText('Inter');
    await expect(page.locator('#export')).toContainText('fallback font');
    await context.close();
  });

  test('the box rules hold with the real default: descenders never touch the bottom edge of the exported PNG', async ({ browser }) => {
    const { context, page, errors } = await openPlain(browser);
    await bundledLoaded(page);
    await setText(page, 'gypq');
    await setRange(page, 'clear', 0.5);
    const L = await settle(page);
    expect(L.lines[0].below).toBeGreaterThan(0.1 * L.size); // g/y/p/q really descend in the bundled font
    const { buffer } = await exportPng(page);
    const g = await page.evaluate(() => __tt.exportGeometry());
    const x0 = Math.round(g.cx - (L.lines[0].w / 2) * g.u), x1 = Math.round(g.cx + (L.lines[0].w / 2) * g.u);
    const { results } = await inspectPng(page, buffer, [{ type: 'colBox', x: Math.round(g.cx) }, { type: 'lowestDark', x0, x1 }]);
    const [box, lowestInk] = results;
    expect(lowestInk).toBeGreaterThan(0);
    expect(box.bottom - lowestInk).toBeGreaterThanOrEqual(0.5 * L.size * g.u * 0.9);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('the default font has a real italic: different letter shapes and spacing, not the upright tilted', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await bundledLoaded(page);
    await page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes('OpenTitlecard Inter') && f.style === 'italic' && f.status === 'loaded'));
    const m = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('2d'), out = {};
      for (const w of [400, 700, 900]) for (const st of ['normal', 'italic']) { c.font = `${st} ${w} 100px "OpenTitlecard Inter"`; out[`${st}${w}`] = c.measureText('Titlecard affiliate').width; }
      return out;
    });
    // a faked slant keeps the upright advance widths exactly; a real italic face does not
    for (const w of [400, 700, 900]) expect(Math.abs(m[`italic${w}`] - m[`normal${w}`]), `weight ${w}`).toBeGreaterThan(1);
    expect(m.italic900).toBeGreaterThan(m.italic400); // the italic has the weight axis too
    await context.close();
  });

  test('italic words in the default font are not shifted: a real italic spaces itself', async ({ browser }) => {
    const { context, page } = await openPlain(browser, NO_SYSTEM_INTER);
    await bundledLoaded(page);
    await page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes('OpenTitlecard Inter') && f.style === 'italic' && f.status === 'loaded'));
    await setText(page, 'Hello world');
    await page.check('#align input[value="left"]'); // left-aligned, so the first run starts at the same place whatever its width
    const before = (await settle(page)).lines[0].items[0].x;
    await page.evaluate(() => { const t = document.querySelector('#text'); t.focus(); t.setSelectionRange(0, 5); });
    await page.click('#ital');
    const L = await settle(page);
    const first = L.lines[0].items[0], rest = L.lines[0].items[1];
    expect(first.text).toBe('Hello'); // the italic run is split off from the rest
    expect(first.x).toBeCloseTo(before, 3); // a faked slant would be shifted left of this by the italic correction
    expect(rest.x).toBeGreaterThan(first.x);
    await context.close();
  });
});
