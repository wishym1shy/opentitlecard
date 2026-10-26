const { test, expect, APP_URL, FONT_FAMILY, expandUi, confirmDialog } = require('./helpers');

// Fonts loaded from a file are remembered in the browser (IndexedDB) and come back on the next visit. The fixture has
// already loaded the test font through "Load font file…", so it is remembered at the start of every test here.
const chipOk = (page, fam) => expect(page.locator('#fontChip')).toHaveText(new RegExp(fam));
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await expandUi(page);
}

test.describe('remembered fonts', () => {
  test('a loaded font is back after a reload, with no warning, not even for a moment', async ({ app: { page } }) => {
    await expect(page.locator('#fontMem')).toBeVisible();
    await expect(page.locator('#fontMemText')).toHaveText('1 loaded font remembered on this computer');
    await page.addInitScript(() => {
      window.__warnSeen = false;
      const t = () => { const b = document.querySelector('#fontWarn'); if (b && !b.hidden) window.__warnSeen = true; if (performance.now() < 2500) requestAnimationFrame(t); };
      requestAnimationFrame(t);
    });
    await reload(page);
    await chipOk(page, FONT_FAMILY);
    expect(await page.evaluate(() => __tt.S.family)).toBe(FONT_FAMILY);
    await expect(page.locator('#family')).toHaveValue(FONT_FAMILY);
    await page.waitForTimeout(2600);
    expect(await page.evaluate(() => window.__warnSeen)).toBe(false);
    expect(await page.evaluate((f) => [...document.fonts].some((x) => x.family.replace(/"/g, '') === f && x.status === 'loaded'), FONT_FAMILY)).toBe(true);
    expect(await page.locator('#fontlist option').evaluateAll((o) => o.map((x) => x.value))).toContain(FONT_FAMILY); // suggested in the family box
  });

  test('a font that is not here offers Reset to Inter, which makes the box and the preview agree again (and can be undone)', async ({ app: { page } }) => {
    await page.fill('#family', 'Font From Another Computer');
    await expect(page.locator('#fontReset')).toBeVisible();
    await page.click('#fontReset');
    expect(await page.evaluate(() => __tt.S.family)).toBe('Inter');
    await expect(page.locator('#family')).toHaveValue('Inter');
    await expect(page.locator('#fontWarn')).toBeHidden();
    await expect(page.locator('#fontWarnMsg')).toBeHidden();
    await chipOk(page, 'Inter');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('opentitlecard.style')).family)).toBe('Inter');
    await page.evaluate(() => __tt.undo());
    expect(await page.evaluate(() => __tt.S.family)).toBe('Font From Another Computer');
  });

  test('Forget them removes the fonts from the browser: after a reload the font is missing and says so', async ({ app: { page } }) => {
    await page.click('#fontForget');
    await confirmDialog(page, true);
    await expect(page.locator('#fontMem')).toBeHidden();
    await chipOk(page, FONT_FAMILY); // still usable on this page
    await reload(page);
    await expect(page.locator('#fontWarn')).toBeVisible();
    await expect(page.locator('#fontWarnMsg')).toContainText(FONT_FAMILY);
    await expect(page.locator('#fontMem')).toBeHidden();
  });

  test('cancelling Forget keeps them', async ({ app: { page } }) => {
    await page.click('#fontForget');
    await confirmDialog(page, false);
    await reload(page);
    await chipOk(page, FONT_FAMILY);
  });
});

test('without IndexedDB (a private window, blocked storage) fonts still load for the page and nothing breaks', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined }); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await page.setInputFiles('#fontFile', require.resolve('@fontsource/inter/files/inter-latin-800-normal.woff2'));
  await chipOk(page, FONT_FAMILY);
  await expect(page.locator('#fontMem')).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await expect(page.locator('#fontWarn')).toBeVisible(); // honest: it isn't here any more
  expect(errors).toEqual([]);
  await context.close();
});
