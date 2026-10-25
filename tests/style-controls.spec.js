const { test, expect, setText, settle, setRange, addCard } = require('./helpers');

// Every slider in these panels must have a reset button, including any added later.
const SECTIONS = ['Font & type', 'Background'];
const sliderIds = (page) => page.evaluate((names) => [...document.querySelectorAll('details')]
  .filter((d) => names.includes(d.querySelector('summary').textContent.trim()))
  .flatMap((d) => [...d.querySelectorAll('input[type=range]')].map((r) => r.id)), SECTIONS);

test.describe('slider reset buttons', () => {
  test('every Font & type and Background slider has one, and it puts the slider back to its default', async ({ app: { page } }) => {
    const ids = await sliderIds(page);
    expect(ids.length).toBeGreaterThanOrEqual(11);
    for (const id of ids) {
      const btn = page.locator(`button[data-reset-key="${id}"]`);
      await expect(btn, id).toHaveCount(1);
      await expect(btn, `${id} starts at its default`).toBeDisabled();
      const { def, min, max, label } = await page.evaluate((id) => {
        const el = document.querySelector('#' + id);
        return { def: +el.value, min: +el.min, max: +el.max, label: document.querySelector('#v_' + id).textContent };
      }, id);
      await setRange(page, id, def === max ? min : max);
      await expect(btn, id).toBeEnabled();
      await btn.click();
      await settle(page);
      expect(await page.evaluate((id) => __tt.S[id], id), id).toBe(def);
      await expect(page.locator('#v_' + id), id).toHaveText(label);
      await expect(btn, id).toBeDisabled();
      expect(await page.evaluate((id) => JSON.parse(localStorage.getItem('opentitlecard.style'))[id], id), `${id} saved`).toBe(def);
    }
  });

  test('buttons are named for screen readers and say what the default is', async ({ app: { page } }) => {
    await expect(page.locator('button[data-reset-key="size"]')).toHaveAttribute('aria-label', 'Reset Size');
    await expect(page.locator('button[data-reset-key="size"]')).toHaveAttribute('title', /default \(100 px\)/);
    await expect(page.locator('button[data-reset-key="wrap"]')).toHaveAttribute('title', /default \(Off\)/);
  });

  test('double-clicking a slider resets it too', async ({ app: { page } }) => {
    await setRange(page, 'radius', 0.4);
    await page.dblclick('#radius');
    await settle(page);
    expect(await page.evaluate(() => __tt.S.radius)).toBe(0.17);
  });

  test('on a card with its own style, reset changes only that card', async ({ app: { page } }) => {
    await setText(page, 'One');
    await setRange(page, 'size', 140); // shared style
    await addCard(page, 'Two');
    await page.check('#cardOwn');
    await page.click('button[data-reset-key="size"]');
    await settle(page);
    expect(await page.evaluate(() => __tt.S.size)).toBe(100);
    await page.click('#cardList [data-card="0"]');
    await settle(page);
    expect(await page.evaluate(() => __tt.S.size)).toBe(140);
  });
});
