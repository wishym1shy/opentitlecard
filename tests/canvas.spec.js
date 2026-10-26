const { test, expect, setText, settle, setRange, exportPng, pngSize, inspectPng, expandUi } = require('./helpers');

const dims = (page) => page.evaluate(() => { const g = __tt.exportGeometry(); return [g.W, g.H]; });
const pressed = (page, o) => page.locator(`#orient [data-orient="${o}"]`);

test.describe('canvas orientation', () => {
  test('Vertical and Landscape swap the canvas, keeping presets as presets', async ({ app: { page } }) => {
    await expect(pressed(page, 'h')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#orient [data-orient="v"]');
    await settle(page);
    expect(await page.evaluate(() => __tt.S.frame)).toBe('1080x1920');
    await expect(page.locator('#frame')).toHaveValue('1080x1920');
    await expect(pressed(page, 'v')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dims')).toHaveText('1080 × 1920 px');
    await page.click('#orient [data-orient="v"]'); // already vertical: nothing changes
    expect(await dims(page)).toEqual([1080, 1920]);
    await page.click('#orient [data-orient="h"]');
    expect(await dims(page)).toEqual([1920, 1080]);
    await page.selectOption('#frame', '3840x2160');
    await page.click('#orient [data-orient="v"]');
    expect(await page.evaluate(() => __tt.S.frame)).toBe('2160x3840');
  });

  test('a size without a swapped preset becomes a custom size', async ({ app: { page } }) => {
    await page.selectOption('#frame', '1080x1350');
    await page.click('#orient [data-orient="h"]');
    await settle(page);
    expect(await page.evaluate(() => [__tt.S.frame, __tt.S.fw, __tt.S.fh])).toEqual(['custom', 1350, 1080]);
    await expect(page.locator('#fw')).toHaveValue('1350');
  });

  test('a square canvas has no orientation to switch', async ({ app: { page } }) => {
    await page.selectOption('#frame', '1080x1080');
    await expect(pressed(page, 'h')).toBeDisabled();
    await expect(pressed(page, 'v')).toBeDisabled();
  });

  test('the vertical export is a 1080 × 1920 PNG with the card centred', async ({ app: { page } }) => {
    await page.click('#orient [data-orient="v"]');
    await setText(page, 'Hi');
    const { buffer } = await exportPng(page);
    expect(pngSize(buffer)).toEqual([1080, 1920]);
    const { results: [bb] } = await inspectPng(page, buffer, [{ type: 'bbox' }]);
    expect((bb.x0 + bb.x1) / 2).toBeCloseTo(540, -1);
    expect((bb.y0 + bb.y1) / 2).toBeCloseTo(960, -1);
  });

  test('orientation changes can be undone', async ({ app: { page } }) => {
    await page.click('#orient [data-orient="v"]');
    await page.keyboard.press('Control+Z');
    expect(await dims(page)).toEqual([1920, 1080]);
  });
});

test.describe('4K limit', () => {
  test('custom sizes are kept within 3840 px on each side', async ({ app: { page } }) => {
    await page.selectOption('#frame', 'custom');
    await page.fill('#fw', '8192');
    await page.locator('#fw').blur();
    await page.fill('#fh', '5000');
    await page.locator('#fh').blur();
    await settle(page);
    expect(await dims(page)).toEqual([3840, 3840]);
    await expect(page.locator('#fw')).toHaveValue('3840');
    await expect(page.locator('#fh')).toHaveValue('3840');
    await expect(page.locator('#export')).toBeEnabled(); // exactly 4K is allowed
  });

  test('a hand-edited preset cannot go past the limit either', async ({ app: { page } }) => {
    const payload = Buffer.from(JSON.stringify({ frame: 'custom', fw: 10000, fh: 9000 }));
    await page.setInputFiles('#presetFile', { name: 'p.json', mimeType: 'application/json', buffer: payload });
    await page.waitForFunction(() => __tt.S.frame === 'custom');
    expect(await dims(page)).toEqual([3840, 3840]);
  });

  test('4K vertical is a preset and exports', async ({ app: { page } }) => {
    await page.selectOption('#frame', '2160x3840');
    await setText(page, 'Hi');
    const { buffer } = await exportPng(page);
    expect(pngSize(buffer)).toEqual([2160, 3840]);
  });

  test('a tight crop over 4K disables Download PNG and says why', async ({ app: { page } }) => {
    await setText(page, 'A fairly long titlecard line');
    await page.check('#tight');
    await setRange(page, 'exportScale', 4);
    await expect(page.locator('#export')).toBeDisabled();
    await expect(page.locator('#export')).toContainText('3840');
    await setRange(page, 'exportScale', 1);
    await expect(page.locator('#export')).toBeEnabled();
    await expect(page.locator('#export')).toHaveText('Download PNG');
  });
});

test.describe('iPhone 16 Pro canvas', () => {
  test('the preset is 1206 × 2622 and exports at that size', async ({ app: { page } }) => {
    await page.selectOption('#frame', '1206x2622');
    await setText(page, 'Hi');
    await expect(page.locator('#dims')).toHaveText('1206 × 2622 px');
    await expect(pressed(page, 'v')).toHaveAttribute('aria-pressed', 'true');
    const { buffer } = await exportPng(page);
    expect(pngSize(buffer)).toEqual([1206, 2622]);
    await expect(page.locator('#x_frame option[value="1206x2622"]')).toHaveText('1206 × 2622 (iPhone 16 Pro)'); // the export dialog offers it too
  });

  test('Landscape turns it into a custom 2622 × 1206, and it survives a reload', async ({ app: { page } }) => {
    await page.selectOption('#frame', '1206x2622');
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect(await page.evaluate(() => __tt.S.frame)).toBe('1206x2622');   // a valid saved choice, not reset to the default
    await expandUi(page);
    await page.click('#orient [data-orient="h"]');
    await settle(page);
    expect(await page.evaluate(() => [__tt.S.frame, __tt.S.fw, __tt.S.fh])).toEqual(['custom', 2622, 1206]);
  });
});
