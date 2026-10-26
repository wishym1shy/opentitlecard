const { test, expect, APP_URL, loadTestFont } = require('./helpers');

// The missing-font warning: a ⚠ inside the Font family box, and a message that pops out to its right and fades.
const MISSING = 'Definitely Not An Installed Font 12345';
const box = (page, sel) => page.locator(sel).boundingBox();

async function missingFont(page) {
  await page.fill('#family', MISSING);
  await expect(page.locator('#fontWarnMsg')).toBeVisible();
  await page.mouse.move(5, 5); // well away from the warning
}

test.describe('missing-font warning', () => {
  test('a ⚠ sits inside the right of the family box, its message pops out to the right over the canvas, and both go once a font loads', async ({ app: { page } }) => {
    await missingFont(page);
    const [field, icon, msg, aside] = await Promise.all([box(page, '#family'), box(page, '#fontWarn'), box(page, '#fontWarnMsg'), box(page, 'aside')]);
    expect(icon.x).toBeGreaterThan(field.x + field.width / 2);                       // right half of the box…
    expect(icon.x + icon.width).toBeLessThanOrEqual(field.x + field.width);           // …and inside it
    expect(icon.y).toBeGreaterThanOrEqual(field.y); expect(icon.y + icon.height).toBeLessThanOrEqual(field.y + field.height);
    expect(msg.x).toBeGreaterThan(icon.x + icon.width);                               // to the right of the ⚠
    expect(msg.x + msg.width).toBeGreaterThan(aside.x + aside.width);                 // spills out of the sidebar
    expect(msg.y).toBeLessThan(icon.y + icon.height); expect(msg.y + msg.height).toBeGreaterThan(icon.y); // level with it
    await expect(page.locator('#fontWarnMsg')).toContainText(`“${MISSING}” isn't installed or loaded`);
    await expect(page.locator('#banner')).toBeHidden();                               // no more banner across the sidebar
    await expect(page.locator('#fontWarn')).toHaveAttribute('aria-label', /isn't loaded/);
    await loadTestFont(page);
    await expect(page.locator('#fontWarn')).toBeHidden();
    await expect(page.locator('#fontWarnMsg')).toBeHidden();
  });

  test('after a hover it fades a few seconds after the pointer leaves; hovering the ⚠ brings it back', async ({ app: { page } }) => {
    await missingFont(page);
    await page.hover('#fontWarnMsg');
    await page.waitForTimeout(3600);
    await expect(page.locator('#fontWarnMsg')).toBeVisible();                         // not while the pointer is on it
    await page.mouse.move(5, 5);
    await page.waitForTimeout(1000);
    await expect(page.locator('#fontWarnMsg')).toBeVisible();                         // not straight away either
    await expect(page.locator('#fontWarnMsg')).toBeHidden({ timeout: 2500 });         // gone 2 s (+ fade) after leaving
    await expect(page.locator('#fontWarn')).toBeVisible();                            // the ⚠ stays
    await page.hover('#fontWarn');
    await expect(page.locator('#fontWarnMsg')).toBeVisible();
  });

  test('without a hover it fades several seconds after the first action elsewhere', async ({ app: { page } }) => {
    await missingFont(page);
    await page.waitForTimeout(1500);
    await expect(page.locator('#fontWarnMsg')).toBeVisible();                         // nothing happening: it stays
    await page.click('#text');
    await page.waitForTimeout(2000);
    await page.keyboard.type('Hi');                                                  // more activity doesn't restart the countdown
    await page.waitForTimeout(1500);
    await expect(page.locator('#fontWarnMsg')).toBeVisible();                         // 3.5 s in
    await expect(page.locator('#fontWarnMsg')).toBeHidden({ timeout: 2500 });         // 5 s (+ fade)
  });

  test('a new missing family pops it out again, and keyboard focus on the ⚠ shows it', async ({ app: { page } }) => {
    await missingFont(page);
    await page.hover('#fontWarnMsg'); await page.mouse.move(5, 5);
    await expect(page.locator('#fontWarnMsg')).toBeHidden({ timeout: 5000 });
    await page.fill('#family', 'Another Missing Family 999');
    await expect(page.locator('#fontWarnMsg')).toBeVisible();
    await expect(page.locator('#fontWarnMsg')).toContainText('Another Missing Family 999');
    await page.hover('#fontWarnMsg'); await page.mouse.move(5, 5);
    await expect(page.locator('#fontWarnMsg')).toBeHidden({ timeout: 5000 });
    await page.focus('#fontWarn');
    await expect(page.locator('#fontWarnMsg')).toBeVisible();
  });
});

test('on boot with a saved font that is no longer loaded, the ⚠ shows its message without any click', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('opentitlecard.style', JSON.stringify({ family: 'Gone Since Last Time Sans' })));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await expect(page.locator('#fontWarn')).toBeVisible();
  await expect(page.locator('#fontWarnMsg')).toBeVisible();
  await expect(page.locator('#fontWarnMsg')).toContainText('Gone Since Last Time Sans');
  expect(errors).toEqual([]);
  await context.close();
});
