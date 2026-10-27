const { test, expect, APP_URL, setText, settle, addCard, expandUi } = require('./helpers');

const MARGIN = 20; // px at 1080p, AUTO_MARGIN in index.html
const size = (page) => page.evaluate(() => __tt.S.size);
// the room left between the card and the nearest left/right and top/bottom canvas edges, in canvas px, and the margin in px
const room = (page) => page.evaluate(() => {
  __tt.renderNow();
  const g = __tt.exportGeometry(), L = __tt.L, w = L.cardW * g.u / 2, h = L.cardH * g.u / 2;
  return { x: Math.min(g.cx, g.W - g.cx) - w, y: Math.min(g.cy, g.H - g.cy) - h, u: g.u };
});
const LONG = 'A much longer titlecard line here';

test.describe('auto-scale', () => {
  test('is on by default and fits the card when the canvas turns vertical, as one undo step', async ({ app: { page } }) => {
    await expect(page.locator('#autoScale')).toBeChecked();
    await setText(page, LONG);
    expect(await size(page)).toBe(100);
    expect((await room(page)).x).toBeGreaterThan(0);                 // fits the landscape canvas as it is
    await page.click('#orient [data-orient="v"]');
    await settle(page);
    const s = await size(page), r = await room(page);
    expect(s).toBeLessThan(100);
    expect(r.x).toBeGreaterThanOrEqual(MARGIN * r.u - 0.01);         // at least the margin on each side
    await expect(page.locator('#n_size')).toHaveValue(String(s));     // the Scale field shows it
    // and it's the largest Scale that does: one more no longer leaves the margin
    const oneMore = await page.evaluate((s) => { __tt.S.size = s + 1; __tt.renderNow(); const g = __tt.exportGeometry(), x = Math.min(g.cx, g.W - g.cx) - __tt.L.cardW * g.u / 2; __tt.S.size = s; __tt.renderNow(); return x; }, s);
    expect(oneMore).toBeLessThan(MARGIN * r.u);
    await page.keyboard.press('Control+z');                          // one step back: canvas and Scale together
    expect(await page.evaluate(() => [__tt.S.frame, __tt.S.size])).toEqual(['1920x1080', 100]);
  });

  test('grows back to the chosen Scale on a wider canvas, never past it', async ({ app: { page } }) => {
    await setText(page, LONG);
    await page.click('#orient [data-orient="v"]');
    expect(await size(page)).toBeLessThan(100);
    await page.click('#orient [data-orient="h"]');
    expect(await size(page)).toBe(100);                              // back to what was chosen, not bigger
    await setText(page, 'Hi');
    await page.selectOption('#frame', '3840x2160');
    expect(await size(page)).toBe(100);                              // plenty of room: still the chosen 100
  });

  test('a Scale set by hand becomes the one to keep', async ({ app: { page } }) => {
    await setText(page, LONG);
    await page.click('#orient [data-orient="v"]');
    await page.fill('#n_size', '40');
    await page.press('#n_size', 'Enter');
    await page.click('#orient [data-orient="h"]');
    expect(await size(page)).toBe(40);                               // not the old 100
  });

  test('picking the same size again, or another setting, changes nothing', async ({ app: { page } }) => {
    await setText(page, LONG);
    await page.click('#orient [data-orient="v"]');
    await page.fill('#n_size', '120');                               // too big on purpose
    await page.press('#n_size', 'Enter');
    await page.selectOption('#frame', '1080x1920');                  // the size it already is
    await page.check('#align input[value="left"]');
    expect(await size(page)).toBe(120);
  });

  test('fits every card that shares the style, and a card with its own style on its own', async ({ app: { page } }) => {
    await setText(page, 'Short');
    await addCard(page, LONG);                                       // shares the style
    await addCard(page, 'Own style, long enough too');
    await page.check('#cardOwn');
    await page.click('#orient [data-orient="v"]');
    await settle(page);
    // the shared style fits the long shared card, so the short one ends up the same size
    const sizes = await page.evaluate(() => [__tt.sharedStyle.size, __tt.cards[2].style ? __tt.cards[2].style.size : null, __tt.S.size]);
    expect(sizes[0]).toBeLessThan(100);
    expect(sizes[1]).toBeLessThan(100);
    for (const i of [0, 1, 2]) {
      await page.click(`#cardList [data-card="${i}"]`);
      const r = await room(page);
      expect(r.x, `card ${i + 1}`).toBeGreaterThanOrEqual(MARGIN * r.u - 0.01);
    }
  });

  test('turned off, a canvas change leaves Scale alone, and the choice is remembered', async ({ app: { page } }) => {
    await setText(page, LONG);
    await page.uncheck('#autoScale');
    await page.click('#orient [data-orient="v"]');
    expect(await size(page)).toBe(100);
    expect((await room(page)).x).toBeLessThan(0);                    // overflowing, as the user chose
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expandUi(page);
    await expect(page.locator('#autoScale')).not.toBeChecked();
  });

  test('nothing is changed when the app opens, even if the saved Scale overflows the saved canvas', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('opentitlecard.style', JSON.stringify({ size: 140, frame: '1080x1920', fw: 1080, fh: 1920 }));
    });
    const page = await context.newPage();
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    expect(await page.evaluate(() => [__tt.S.frame, __tt.S.size])).toEqual(['1080x1920', 140]);
    await context.close();
  });
});
