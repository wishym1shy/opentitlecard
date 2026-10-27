const { test, expect } = require('./helpers');

// A stand-in for the live site: the tests run the app from a file, where it never checks on its own.
const SITE = 'https://opentitlecard.test/app/';
const page_ = (version) => `<!doctype html><title>x</title><style>${'a{}'.repeat(30000)}</style>`
  + `<h1>OpenTitlecard <a id="appVersion" href="#" title="What's new">${version}</a></h1>` + '<p>rest</p>'.repeat(5000);
async function serve(page, body) {
  await page.route(SITE, (route) => route.fulfill({ status: 200, contentType: 'text/html', body, headers: { 'Access-Control-Allow-Origin': '*' } }));
}
const bump = (v, by) => v.replace(/\.(\d+)$/, (m, n) => '.' + (+n + by));

test.describe('new version notice', () => {
  test('is hidden while nothing newer is known, and the app doesn\'t check when opened as a file', async ({ app: { page } }) => {
    await expect(page.locator('#updateBtn')).toBeHidden();
    let asked = false;
    await page.route('**/*', (route) => { if (/^https?:/.test(route.request().url())) asked = true; route.continue(); });
    await page.evaluate(() => __tt.update.check());   // no address given: the page's own, which is a file here
    expect(asked).toBe(false);
  });

  test('a newer version on the site shows a pulsing green "Update available" pill right next to the version', async ({ app: { page } }) => {
    const running = await page.evaluate(() => __tt.update.running);
    const next = bump(running, 1);
    await serve(page, page_(next));
    await page.evaluate((u) => __tt.update.check(u), SITE);
    const btn = page.locator('#updateBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('↻ Update available · Click to reload');
    await expect(btn).toHaveAttribute('aria-label', `Update available: version ${next}. Reload the page to update.`);
    await expect(btn).toHaveAttribute('title', `OpenTitlecard ${next} is out (you have ${running}). Click to reload the page and get it; save your set first.`);
    expect(await btn.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(62, 207, 142)');   // the app's green
    const [v, b] = await Promise.all([page.locator('#appVersion').boundingBox(), btn.boundingBox()]);
    expect(b.x).toBeGreaterThan(v.x + v.width);              // just right of the version
    expect(b.x - (v.x + v.width)).toBeLessThan(16);
    expect(Math.abs((b.y + b.height / 2) - (v.y + v.height / 2))).toBeLessThan(3);   // on the same line
    // it pulses, unless the computer asks for less motion (the test suite does)
    expect(await btn.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await btn.evaluate((e) => getComputedStyle(e).animationName)).toBe('update-pulse');
  });

  test('the same or an older version on the site, or a page without one, shows nothing', async ({ app: { page } }) => {
    const running = await page.evaluate(() => __tt.update.running);
    for (const body of [page_(running), page_(bump(running, -1)), page_('v0.9'), '<p>not the app</p>']) {
      await page.unroute(SITE); await serve(page, body);
      await page.evaluate((u) => __tt.update.check(u), SITE);
      await expect(page.locator('#updateBtn')).toBeHidden();
    }
    // a newer major version counts even with a lower minor number
    await page.unroute(SITE); await serve(page, page_(running.replace(/^v(\d+)\.\d+$/, (m, a) => `v${+a + 1}.0`)));
    await page.evaluate((u) => __tt.update.check(u), SITE);
    await expect(page.locator('#updateBtn')).toBeVisible();
  });

  test('clicking it reloads the page', async ({ app: { page } }) => {
    await serve(page, page_(bump(await page.evaluate(() => __tt.update.running), 1)));
    await page.evaluate((u) => __tt.update.check(u), SITE);
    await page.evaluate(() => { window.__beforeReload = true; });
    await Promise.all([page.waitForEvent('load'), page.click('#updateBtn')]);
    expect(await page.evaluate(() => window.__beforeReload)).toBeUndefined();
  });
});
