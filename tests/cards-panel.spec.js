const { test, expect, addCard, settle } = require('./helpers');

const activeCard = (page) => page.evaluate(() => __tt.active);
const focusedId = (page) => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.dataset.card));

test.describe('Cards panel (layers)', () => {
  test('the list sits in its own box; card actions are icons in its footer, batch actions above it', async ({ app: { page } }) => {
    await expect(page.locator('.layers #cardList')).toBeVisible();
    const foot = await page.evaluate(() => [...document.querySelectorAll('.layers .layerfoot button')].map((b) => b.id));
    expect(foot).toEqual(['cardAdd', 'cardDup', 'cardUp', 'cardDown', 'cardDel']);
    const bar = await page.evaluate(() => [...document.querySelectorAll('.layerbar button')].map((b) => b.id));
    expect(bar).toEqual(['listToggle', 'cardsNew', 'batchMenuBtn']);
    for (const id of [...foot, ...bar]) {
      const b = page.locator('#' + id);
      await expect(b, id).toHaveText('');                        // an icon, not a word
      await expect(b, id).toHaveAttribute('aria-label', /\w/);   // but still named for screen readers
      await expect(b, id).toHaveAttribute('title', /\w/);        // and on hover
    }
    const box = await page.locator('.layers').boundingBox(), bar1 = await page.locator('.layerbar').boundingBox();
    expect(bar1.y + bar1.height).toBeLessThanOrEqual(box.y);    // above the list
  });

  test('Save and Open batch file live in the ⋮ menu, which opens, steps with the arrows and closes with Esc', async ({ app: { page } }) => {
    const btn = page.locator('#batchMenuBtn');
    await expect(page.locator('#batchSave')).toBeHidden();
    await expect(page.locator('#batchOpenFile')).toBeHidden();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#batchSave')).toBeVisible();
    expect(await focusedId(page)).toBe('batchSave');
    await page.keyboard.press('ArrowDown');
    expect(await focusedId(page)).toBe('batchOpenFile');
    await page.keyboard.press('ArrowDown');                       // wraps round
    expect(await focusedId(page)).toBe('batchSave');
    await page.keyboard.press('Escape');
    await expect(page.locator('#batchSave')).toBeHidden();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    // opens under its button, lined up on the right
    await btn.click();
    const [m, b] = await Promise.all([page.locator('#batchMenu').boundingBox(), btn.boundingBox()]);
    expect(m.y).toBeGreaterThanOrEqual(b.y + b.height);
    expect(m.x + m.width).toBeCloseTo(b.x + b.width, 0);
  });

  test('choosing a menu item closes the menu and does the job', async ({ app: { page } }) => {
    await page.click('#batchMenuBtn');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#batchSave')]);
    expect(dl.suggestedFilename()).toMatch(/\.json$/);
    await expect(page.locator('#batchMenu')).toBeHidden();
    await expect(page.locator('#batchMenuBtn')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#fileMsg')).toContainText('Saved 1 card');
  });

  test('Up and Down walk the list and focus follows the selected card', async ({ app: { page } }) => {
    await addCard(page, 'Two'); await addCard(page, 'Three');
    await page.click('#cardList [data-card="0"]');
    await page.keyboard.press('ArrowDown');
    expect(await activeCard(page)).toBe(1);
    expect(await focusedId(page)).toBe('1');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); // stops at the last card
    expect(await activeCard(page)).toBe(2);
    await page.keyboard.press('ArrowUp');
    expect(await activeCard(page)).toBe(1);
    await expect(page.locator('#text')).toHaveValue('Two');
  });

  test('the menu closes when Tab leaves it, its button toggles it, and it follows the button when the panels move', async ({ app: { page } }) => {
    const menu = page.locator('#batchMenu'), btn = page.locator('#batchMenuBtn');
    await btn.click();
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); // past the last item and out
    await expect(menu).toBeHidden();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click(); await expect(menu).toBeVisible();
    await btn.click(); await expect(menu).toBeHidden();             // a second click closes it, it doesn't reopen
    // open it, then make the stack scroll (a short window with every panel open): it stays under its button
    await btn.click();
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.locator('#panels').evaluate((el) => { el.scrollTop = 40; });
    await expect(menu).toBeVisible();
    await expect.poll(async () => {
      const [m, b] = await Promise.all([menu.boundingBox(), btn.boundingBox()]);
      return [Math.round(m.y - (b.y + b.height)), Math.round(m.x + m.width - (b.x + b.width))];
    }).toEqual([4, 0]);
  });

  test('with no room below its button, the menu opens above it', async ({ app: { page } }) => {
    // as on first open (only Cards open), so the pinned Export panel can't cover the button in such a short window
    for (const k of ['canvas', 'safezone', 'export']) await page.click(`#fph_${k}`);
    await page.setViewportSize({ width: 1280, height: 230 }); // the button still fits, the menu doesn't below it
    const btn = page.locator('#batchMenuBtn');
    await btn.click();
    const [m, b] = await Promise.all([page.locator('#batchMenu').boundingBox(), btn.boundingBox()]);
    expect(m.y + m.height).toBeLessThanOrEqual(b.y);
    expect(m.y).toBeGreaterThanOrEqual(0);
  });

  test('clicking the card already selected, or Up at the top of the list, does no work', async ({ app: { page } }) => {
    await addCard(page, 'Two words');
    await page.click('#cardList [data-card="0"]');
    await page.evaluate(() => { document.querySelector('#cardList [data-card="0"]').__mark = 1; });
    await page.click('#cardList [data-card="0"]');
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => [__tt.active, document.querySelector('#cardList [data-card="0"]').__mark])).toEqual([0, 1]); // not rebuilt
    expect(await focusedId(page)).toBe('0');
  });

  test('after clicking a card, Space+drag still pans the preview', async ({ app: { page } }) => {
    await addCard(page, 'Two');
    await page.click('#cardList [data-card="0"]');
    expect(await focusedId(page)).toBe('0');
    const a = await page.locator('#cv').boundingBox();
    const x = a.x + a.width / 2, y = a.y + a.height / 2;
    await page.keyboard.down(' ');
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 100, y + 30, { steps: 4 }); await page.mouse.up();
    await page.keyboard.up(' ');
    const b = await page.locator('#cv').boundingBox();
    expect(b.x).toBeCloseTo(a.x + 100, 0);
    expect(await page.evaluate(() => __tt.active)).toBe(0); // Space didn't press the row either
  });

  test('the count and the delete button follow the batch', async ({ app: { page } }) => {
    await expect(page.locator('#cardCount')).toHaveText('1 card');
    await expect(page.locator('#cardDel')).toHaveAttribute('aria-label', 'Clear card');
    await addCard(page, 'Two');
    await settle(page);
    await expect(page.locator('#cardCount')).toHaveText('2 cards');
    await expect(page.locator('#cardDel')).toHaveAttribute('aria-label', 'Delete card');
    await expect(page.locator('#cardUp')).toBeEnabled();
    await expect(page.locator('#cardDown')).toBeDisabled();   // the new card is the last one
  });
});
