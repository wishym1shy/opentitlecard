const { test, expect, APP_URL } = require('./helpers');

/* The open/close animations, which every other spec turns off (reduced motion, in playwright.config.js). */
test.use({ contextOptions: { reducedMotion: 'no-preference' }, expandUi: false });

/* Clicks `click` and records the height of `measure` on every frame for `ms`: what the user sees, frame by frame. An
   animation shows heights strictly between where it started and where it ended. */
const frames = (page, click, measure, ms = 500) => page.evaluate(([click, measure, ms]) => new Promise((done) => {
  const h = () => document.querySelector(measure).getBoundingClientRect().height, out = [h()], t0 = performance.now();
  document.querySelector(click).click();
  const tick = () => { out.push(h()); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(out); };
  requestAnimationFrame(tick);
}), [click, measure, ms]);
const between = (hs) => { const a = hs[0], b = hs[hs.length - 1]; return hs.filter((h) => h > Math.min(a, b) + 1 && h < Math.max(a, b) - 1).length; };
const ready = (page) => page.waitForFunction(() => document.documentElement.classList.contains('anim'));

test.describe('open and close animations', () => {
  test('a floating panel grows open and shrinks closed, quickly', async ({ app: { page } }) => {
    await ready(page);
    const opening = await frames(page, '#fph_canvas', '#fp_canvas');
    expect(opening[opening.length - 1]).toBeGreaterThan(opening[0] + 50);   // it opened
    expect(between(opening)).toBeGreaterThan(2);                            // through several in-between frames
    expect(between(opening)).toBeLessThan(25);                              // and done in well under half a second
    const closing = await frames(page, '#fph_canvas', '#fp_canvas');
    expect(closing[closing.length - 1]).toBeLessThan(closing[0] - 50);
    expect(between(closing)).toBeGreaterThan(2);
    await expect(page.locator('#fpb_canvas')).toBeHidden();
  });

  test('a sidebar section slides open and closed', async ({ app: { page } }) => {
    await ready(page);
    const opening = await frames(page, '#tcProps > summary', '#tcProps');
    expect(opening[opening.length - 1]).toBeGreaterThan(opening[0] + 50);
    expect(between(opening)).toBeGreaterThan(2);
    await expect(page.locator('#tcProps #offX')).toBeVisible();
    const closing = await frames(page, '#tcProps > summary', '#tcProps');
    expect(between(closing)).toBeGreaterThan(2);
    await expect(page.locator('#tcProps #offX')).toBeHidden();
  });

  test('a section is usable from the moment it starts opening', async ({ app: { page } }) => {
    await ready(page);
    // open it and focus a slider inside in the same instant, as a fast keyboard user might
    const focused = await page.evaluate(() => {
      document.querySelector('#tcProps').open = true;
      const s = document.querySelector('#tcProps input[type=range][data-line="0"]'); s.focus();
      return document.activeElement === s;
    });
    expect(focused).toBe(true);
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => __tt.S.nudges[0].x)).toBe(1);
  });

  test('the File menu and the dialogs fade in', async ({ app: { page } }) => {
    await ready(page);
    const fade = (sel) => page.evaluate((sel) => document.getAnimations()
      .some((a) => a.effect && a.effect.target === document.querySelector(sel) && a.transitionProperty === 'opacity'), sel);
    await page.click('#fileMenuBtn');
    expect(await fade('#fileMenu')).toBe(true);
    await expect(page.locator('#fileMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#fileMenu')).toBeHidden();
    await page.click('#fph_export');
    await expect(page.locator('#batchOpen')).toBeVisible();
    await page.click('#batchOpen');
    expect(await fade('#batchDlg')).toBe(true);
    await expect(page.locator('#batchDlg')).toBeVisible();
  });

  test('nothing animates as the page loads', async ({ app: { page } }) => {
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  });
});

test('with reduced motion, panels and sections open and close at once', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(APP_URL);
  await ready(page);
  for (const [click, measure] of [['#fph_canvas', '#fp_canvas'], ['#tcProps > summary', '#tcProps']]) {
    const hs = await frames(page, click, measure, 200);
    expect(hs[hs.length - 1]).toBeGreaterThan(hs[0] + 50);
    expect(between(hs)).toBe(0);
  }
  await context.close();
});
