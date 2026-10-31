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

  test('Tight crop and Leave emoji slots empty are export options, so they sit in the Export panel (Tight crop\'s scale too), not the Canvas panel', async ({ app: { page } }) => {
    for (const id of ['#tight', '#emptySlots']) { await expect(page.locator(`#fp_export ${id}`), id).toBeVisible(); await expect(page.locator(`#fp_canvas ${id}`), id).toHaveCount(0); }
    await expect(page.locator('#fp_export #exportScale')).toBeHidden();
    await page.check('#tight');
    await expect(page.locator('#fp_export #exportScale')).toBeVisible();
    const y = async (sel) => (await page.locator(sel).boundingBox()).y;
    expect(await y('#tight')).toBeLessThan(await y('#export'));         // the options come before the buttons they apply to
  });

  test('Export all as ZIP… is in the Export panel, once, and opens the export dialog', async ({ app: { page } }) => {
    await expect(page.locator('#fp_export #batchOpen')).toHaveText('Export as ZIP…');
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
    await page.click('#fph_cards'); await page.click('#fph_canvas'); await page.click('#fph_safezone'); await page.click('#fph_export');
    const stack = await box(page, '#panels'), above = await box(page, '#fp_safezone'), last = await box(page, '#fp_export');
    const x = stack.x + stack.width / 2, y = (above.y + above.height + last.y) / 2; // the gap above Export, inside the stack
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('#panels') === null, [x, y]);
    expect(hit).toBe(true);
  });

  test('Export sits by itself at the bottom right, minimized or open, and stays there when the stack overflows', async ({ app: { page } }) => {
    const bottomGap = async () => { const [s, e] = await Promise.all([box(page, '#panels'), box(page, '#fp_export')]); return s.y + s.height - (e.y + e.height); };
    const gapAbove = async () => { const [z, e] = await Promise.all([box(page, '#fp_safezone'), box(page, '#fp_export')]); return e.y - (z.y + z.height); };
    await page.click('#fph_emoji'); await page.click('#fph_canvas'); await page.click('#fph_safezone'); await page.click('#fph_export'); // all but Cards minimized
    expect(Math.abs(await bottomGap())).toBeLessThan(1);
    expect(await gapAbove()).toBeGreaterThan(100); // set apart, not stacked under the others
    await page.click('#fph_export');
    expect(Math.abs(await bottomGap())).toBeLessThan(1);
    // everything open in a short window: the stack scrolls, Export stays in view at the bottom
    await page.click('#fph_emoji'); await page.click('#fph_canvas'); await page.click('#fph_safezone');
    await page.setViewportSize({ width: 1280, height: 600 });
    expect(await page.locator('#panels').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(Math.abs(await bottomGap())).toBeLessThan(1);
    const s = await box(page, '#panels'), b = await box(page, '#export');
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).id, [b.x + b.width / 2, b.y + b.height / 2])).toBe('export');
    expect(b.y + b.height).toBeLessThanOrEqual(s.y + s.height);
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
  const MOVED = ['Position & Scale', 'Text Position', 'Text Settings', 'Background', 'Emoji Slot'];

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

  test('Titlecard Properties holds Position & Scale, Text Position, Text Settings, Background and Emoji Slot', async ({ app: { page } }) => {
    const inner = await page.evaluate(() => [...document.querySelectorAll('#tcProps > .body > details > summary')].map((s) => s.textContent.trim()));
    expect(inner).toEqual(MOVED);
    await expect(page.locator('#lh')).toBeHidden();
    await page.click('#tcProps > summary');
    for (const id of ['#offX', '#offY', '#nudges .nudge', '#align', '#lh', '#bgOn', '#slotRows .slotrow']) await expect(page.locator(id).first(), id).toBeVisible();
    await expect(page.locator('#panels #offX')).toHaveCount(0); // the card position left the Canvas panel
  });

  const sectionOf = (page, id) => page.locator(id).evaluate((el) => el.closest('details > .body').parentElement.querySelector('summary').textContent.trim());

  test('Font family and Weight are in the Text section, ready on first open', async ({ app: { page } }) => {
    for (const id of ['#family', '#loadInstalled', '#loadFile', '#weight']) {
      await expect(page.locator(id), id).toBeVisible();
      expect(await sectionOf(page, id), id).toBe('Text');
    }
    // the test font is a single Extra Bold file, so that is the only weight its menu offers (see font-families.spec.js)
    expect(await page.locator('#weight option').evaluateAll((o) => o.map((x) => x.value))).toEqual(['800']);
    expect(await page.evaluate(() => __tt.S.weight)).toBe(800);
  });

  test('X, Y and Scale sit together in Position & Scale; in tight crop only Scale stays', async ({ app: { page } }) => {
    await expect(page.locator('#size')).toBeHidden();   // Titlecard Properties starts closed
    await page.click('#tcProps > summary');
    for (const id of ['#offX', '#offY', '#n_size', 'button[data-reset-key="size"]']) {
      await expect(page.locator(id), id).toBeVisible();
      expect(await sectionOf(page, id), id).toBe('Position & Scale');
    }
    const [x, y, sc] = await Promise.all(['#offX', '#offY', '#n_size'].map((id) => page.locator(id).boundingBox()));
    expect(sc.y).toBeGreaterThan(x.y); expect(sc.y - x.y).toBeLessThan(80);   // Scale is the row right under X / Y
    await expect(page.locator('label[for="n_size"]')).toHaveText('Scale');
    await page.fill('#n_size', '150');
    await page.press('#n_size', 'Enter');
    expect(await page.evaluate(() => __tt.S.size)).toBe(150);
    await page.evaluate(() => { const t = document.querySelector('#tight'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); });
    await expect(page.locator('#offX')).toBeHidden();
    await expect(page.locator('#posTight')).toBeVisible();
    await expect(page.locator('#n_size')).toBeVisible();   // the card's size still matters in a tight crop
  });

  test('the Position fields move the card; with tight crop on they give way to a note', async ({ app: { page } }) => {
    await page.click('#tcProps > summary');
    await page.fill('#offX', '120');
    expect(await page.evaluate(() => __tt.S.offX)).toBe(120);
    await expect(page.locator('#posTight')).toBeHidden();
    await page.click('#fph_export');   // Tight crop is an export option
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
