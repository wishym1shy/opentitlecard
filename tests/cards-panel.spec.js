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
