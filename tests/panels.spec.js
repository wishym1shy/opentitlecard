const { test, expect, APP_URL, settle } = require('./helpers');

const PANELS = ['cards', 'canvas', 'export'];
const box = (page, sel) => page.locator(sel).boundingBox();
const canvasWidth = async (page) => { await settle(page); return (await box(page, '#cv')).width; };

test.describe('floating panels', () => {
  test('Cards, Canvas and Export float on the right of the preview, clear of the canvas', async ({ app: { page } }) => {
    const cv = await box(page, '#cv');
    for (const k of PANELS) {
      const p = await box(page, `#fp_${k}`);
      expect(p.x, k).toBeGreaterThanOrEqual(cv.x + cv.width); // right of the canvas, never covering it
    }
    for (const id of ['#cardList', '#frame', '#orient', '#export', '#batchOpen']) await expect(page.locator(`#panels ${id}`)).toBeVisible();
    await expect(page.locator('aside #presetSel')).toBeVisible(); // presets stay with the style controls
  });

  test('a panel minimizes to its title and comes back; the choice is remembered', async ({ app: { page } }) => {
    const head = page.locator('#fph_cards');
    await expect(head).toHaveAttribute('aria-expanded', 'true');
    await head.click();
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#cardList')).toBeHidden();
    await expect(page.locator('#frame')).toBeVisible(); // the others stay open
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expect(page.locator('#cardList')).toBeHidden();
    await page.locator('#fph_cards').focus();
    await page.keyboard.press('Enter'); // keyboard works too
    await expect(page.locator('#cardList')).toBeVisible();
  });

  test('Panels hides the whole stack and the preview takes the space', async ({ app: { page } }) => {
    const before = await canvasWidth(page);
    await page.click('#panelsToggle');
    await expect(page.locator('#panels')).toBeHidden();
    await expect(page.locator('#panelsToggle')).toHaveAttribute('aria-pressed', 'false');
    expect(await canvasWidth(page)).toBeGreaterThan(before + 100);
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expect(page.locator('#panels')).toBeHidden();
    await page.click('#panelsToggle');
    await expect(page.locator('#panels')).toBeVisible();
    expect(await canvasWidth(page)).toBeCloseTo(before, -1);
  });

  test('clicks pass through the empty space around the panels', async ({ app: { page } }) => {
    await page.click('#fph_cards'); await page.click('#fph_canvas'); await page.click('#fph_export');
    const stack = await box(page, '#panels'), last = await box(page, '#fp_export');
    const x = stack.x + stack.width / 2, y = last.y + last.height + 40; // below the minimized panels, inside the stack
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('#panels') === null, [x, y]);
    expect(hit).toBe(true);
  });

  test('broken saved panel settings are ignored', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('opentitlecard.panels', JSON.stringify({ hidden: 'yes', min: { cards: 1, canvas: true } })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expect(page.locator('#panels')).toBeVisible();   // only a real true hides
    await expect(page.locator('#cardList')).toBeVisible();
    await expect(page.locator('#frame')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
  });
});
