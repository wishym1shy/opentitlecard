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

  test('Export all as ZIP… is in the Export panel, once, and opens the export dialog', async ({ app: { page } }) => {
    await expect(page.locator('#fp_export #batchOpen')).toHaveText('Export all as ZIP…');
    await expect(page.locator('#fp_cards button', { hasText: /ZIP/ })).toHaveCount(0);
    await expect(page.locator('#panels button', { hasText: /ZIP/ })).toHaveCount(1);
    await page.click('#batchOpen');
    await expect(page.locator('#batchDlg')).toBeVisible();
  });

  test('a panel minimizes to its title and comes back, by mouse or keyboard', async ({ app: { page } }) => {
    const head = page.locator('#fph_cards');
    await expect(head).toHaveAttribute('aria-expanded', 'true');
    await head.click();
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#cardList')).toBeHidden();
    await expect(page.locator('#frame')).toBeVisible(); // the others stay open
    await head.focus();
    await page.keyboard.press('Enter'); // keyboard works too
    await expect(page.locator('#cardList')).toBeVisible();
    await expect(head).toHaveAttribute('aria-expanded', 'true');
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

  test('broken saved panel settings are ignored, and an old saved minimize choice no longer applies', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('opentitlecard.panels', JSON.stringify({ hidden: 'yes', min: { cards: true, canvas: false } })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expect(page.locator('#panels')).toBeVisible();   // only a real true hides
    await expect(page.locator('#cardList')).toBeVisible(); // every load starts the same way
    await expect(page.locator('#frame')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
  });
});

// The page as a user first sees it: the fixture leaves everything as the app opens it.
test.describe('first open', () => {
  test.use({ expandUi: false });
  const OPEN = { cards: true, canvas: false, safezone: false, export: false };
  const MOVED = ['Position', 'Text Position', 'Text Settings', 'Background', 'Emoji Slot'];

  const expectFresh = async (page) => {
    for (const [k, open] of Object.entries(OPEN)) {
      await expect(page.locator(`#fph_${k}`), k).toHaveAttribute('aria-expanded', String(open));
      await expect(page.locator(`#fpb_${k}`), k).toBeVisible({ visible: open });
    }
    await expect(page.locator('#tcProps')).not.toHaveAttribute('open');
    await expect(page.locator('#text')).toBeVisible();
    await expect(page.locator('#presetSel')).toBeVisible();
  };

  test('only Cards is open, Titlecard Properties is folded, and Text and Presets are open', async ({ app: { page } }) => {
    await expectFresh(page);
    const top = await page.evaluate(() => [...document.querySelectorAll('aside > details > summary')].map((s) => s.textContent.trim()));
    expect(top).toEqual(['Text', 'Titlecard Properties', 'Presets']);
  });

  test('Titlecard Properties holds Position, Text Position, Text Settings, Background and Emoji Slot', async ({ app: { page } }) => {
    const inner = await page.evaluate(() => [...document.querySelectorAll('#tcProps > .body > details > summary')].map((s) => s.textContent.trim()));
    expect(inner).toEqual(MOVED);
    await expect(page.locator('#size')).toBeHidden();
    await page.click('#tcProps > summary');
    for (const id of ['#offX', '#offY', '#nudges .nudge', '#family', '#size', '#bgOn', '#slot']) await expect(page.locator(id).first(), id).toBeVisible();
    await expect(page.locator('#panels #offX')).toHaveCount(0); // the card position left the Canvas panel
  });

  test('the Position fields move the card; with tight crop on they give way to a note', async ({ app: { page } }) => {
    await page.click('#tcProps > summary');
    await page.fill('#offX', '120');
    expect(await page.evaluate(() => __tt.S.offX)).toBe(120);
    await expect(page.locator('#posTight')).toBeHidden();
    await page.click('#fph_canvas');
    await page.check('#tight');
    await expect(page.locator('#offX')).toBeHidden();
    await expect(page.locator('#posTight')).toBeVisible();
  });

  test('every reload starts fresh, whatever was opened or minimized before', async ({ app: { page } }) => {
    await page.click('#tcProps > summary');
    for (const k of Object.keys(OPEN)) await page.click(`#fph_${k}`);
    await expect(page.locator('#fpb_canvas')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expectFresh(page);
  });
});
