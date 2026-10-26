const { test, expect, settle } = require('./helpers');

// The sidebar's compact fields: a typed value, a scrub icon and a slim slider, all writing the same setting.
const S = (page, k) => page.evaluate((k) => __tt.S[k], k);

test.describe('sidebar fields', () => {
  test('every slider setting has a typed value that follows the slider', async ({ app: { page } }) => {
    const keys = await page.evaluate(() => [...document.querySelectorAll('aside .fld input[type=range][id]')].map((r) => r.id));
    expect(keys.length).toBeGreaterThanOrEqual(14);
    for (const k of keys) {
      const v = await page.evaluate((k) => { const r = document.querySelector('#' + k); r.value = r.max; r.dispatchEvent(new Event('input', { bubbles: true })); return r.max; }, k);
      await expect(page.locator('#n_' + k), k).toHaveValue(String(+v));
    }
  });

  test('a typed value applies on Enter, clamped to the slider range and step', async ({ app: { page } }) => {
    await page.fill('#n_size', '15');
    expect(await S(page, 'size')).toBe(100); // nothing applies while typing
    await page.press('#n_size', 'Enter');
    expect(await S(page, 'size')).toBe(30); // the minimum
    await expect(page.locator('#n_size')).toHaveValue('30');
    await page.fill('#n_lh', '1.333');
    await page.press('#n_lh', 'Tab');
    expect(await S(page, 'lh')).toBe(1.33);
    await page.fill('#n_lh', ''); // cleared: the field shows the real value again
    await page.press('#n_lh', 'Enter');
    expect(await S(page, 'lh')).toBe(1.33);
    await expect(page.locator('#n_lh')).toHaveValue('1.33');
  });

  test('arrow keys step the value, Shift by 10 steps', async ({ app: { page } }) => {
    await page.focus('#n_size');
    await page.keyboard.press('ArrowUp');
    expect(await S(page, 'size')).toBe(101);
    await page.keyboard.press('Shift+ArrowDown');
    expect(await S(page, 'size')).toBe(91);
  });

  test('max card width shows Off at 0, and an empty field turns wrapping off', async ({ app: { page } }) => {
    await expect(page.locator('#n_wrap')).toHaveValue('');
    await expect(page.locator('#n_wrap')).toHaveAttribute('placeholder', 'Off');
    await page.fill('#n_wrap', '600'); await page.press('#n_wrap', 'Enter');
    expect(await S(page, 'wrap')).toBe(600);
    await page.fill('#n_wrap', ''); await page.press('#n_wrap', 'Enter');
    expect(await S(page, 'wrap')).toBe(0);
  });

  test('dragging the icon scrubs the value, and double-clicking it resets', async ({ app: { page } }) => {
    const h = page.locator('[data-scrub-for="size"]');
    await h.scrollIntoViewIfNeeded();
    const b = await h.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2, { steps: 4 });
    await page.mouse.up();
    expect(await S(page, 'size')).toBe(120);
    await h.dblclick();
    expect(await S(page, 'size')).toBe(100);
  });

  test('the card position can be scrubbed by its X label', async ({ app: { page } }) => {
    const h = page.locator('[data-scrub-for="offX"]');
    await h.scrollIntoViewIfNeeded();
    const b = await h.boundingBox();
    await page.mouse.move(b.x + 5, b.y + 5);
    await page.mouse.down();
    await page.mouse.move(b.x - 25, b.y + 5, { steps: 3 });
    await page.mouse.up();
    expect(await S(page, 'offX')).toBe(-30);
    await expect(page.locator('#offX')).toHaveValue('-30');
  });

  test('colors take a typed hex code, with or without # and in short form', async ({ app: { page } }) => {
    await expect(page.locator('#hx_bgColor')).toHaveValue('FFFFFF');
    await page.fill('#hx_bgColor', '#ffe066'); await page.press('#hx_bgColor', 'Enter');
    expect(await S(page, 'bgColor')).toBe('#ffe066');
    await expect(page.locator('#bgColor')).toHaveValue('#ffe066');
    await page.fill('#hx_textColor', 'f00'); await page.press('#hx_textColor', 'Enter');
    expect(await S(page, 'textColor')).toBe('#ff0000');
    await page.fill('#hx_textColor', 'nope'); await page.press('#hx_textColor', 'Enter');
    expect(await S(page, 'textColor')).toBe('#ff0000');
    await expect(page.locator('#hx_textColor')).toHaveValue('FF0000');
  });

  test('alignment is a row of three buttons, and undo brings the old one back', async ({ app: { page } }) => {
    await expect(page.locator('#align input[type=radio]')).toHaveCount(3);
    await expect(page.locator('#align input[value="center"]')).toBeChecked();
    await page.check('#align input[value="right"]');
    expect(await S(page, 'align')).toBe('right');
    await page.keyboard.press('Control+z');
    await settle(page);
    expect(await S(page, 'align')).toBe('center');
    await expect(page.locator('#align input[value="center"]')).toBeChecked();
  });
});
