const { test, expect, setText, settle, setRange, readZip, pngSize, downloadZip, exportPng, addCard } = require('./helpers');

async function threeCards(page) {
  await setText(page, 'Hi');
  await addCard(page, 'A much longer second card');
  await addCard(page, 'Mid length');
}
const thumbRatio = (page, i = 0) => page.evaluate((i) => { const c = document.querySelectorAll('#bGrid canvas')[i]; return c.width / c.height; }, i);
async function pickFrame(page, v) { await page.selectOption('#x_frame', v); }

test.describe('export dialog: canvas', () => {
  test('the canvas choice made in the dialog sets the PNG size, updates the thumbnails and the Export panel', async ({ app: { page } }) => {
    await threeCards(page);
    await page.click('#batchOpen');
    expect(await thumbRatio(page)).toBeCloseTo(16 / 9, 1);
    await pickFrame(page, '1080x1920');
    expect(await thumbRatio(page)).toBeCloseTo(9 / 16, 1);
    await expect(page.locator('#bInfo')).toContainText('1080 × 1920');
    await expect(page.locator('#frame')).toHaveValue('1080x1920'); // the main Export panel follows
    const files = readZip((await downloadZip(page)).buffer);
    expect(files.map((f) => pngSize(f.data))).toEqual([[1080, 1920], [1080, 1920], [1080, 1920]]);
  });

  test('a custom size can be typed in the dialog', async ({ app: { page } }) => {
    await threeCards(page);
    await page.click('#batchOpen');
    await expect(page.locator('#x_customRow')).toBeHidden();
    await pickFrame(page, 'custom');
    await expect(page.locator('#x_customRow')).toBeVisible();
    await page.fill('#x_fw', '800');
    await page.fill('#x_fh', '600');
    await expect(page.locator('#bInfo')).toContainText('800 × 600');
    const files = readZip((await downloadZip(page)).buffer);
    expect(files.map((f) => pngSize(f.data))).toEqual([[800, 600], [800, 600], [800, 600]]);
  });

  test('settings from the Export panel show up when the dialog opens', async ({ app: { page } }) => {
    await threeCards(page);
    await page.selectOption('#frame', '1080x1080');
    await page.click('#batchOpen');
    await expect(page.locator('#x_frame')).toHaveValue('1080x1080');
    await expect(page.locator('#bInfo')).toContainText('1080 × 1080');
  });

  test('tight crop and scale: each card gets its own size; scale only shows for tight, offset only for full frame', async ({ app: { page } }) => {
    await threeCards(page);
    await page.click('#batchOpen');
    await expect(page.locator('#x_tightOpts')).toBeHidden();
    await expect(page.locator('#x_frameOpts')).toBeVisible();
    await page.check('#x_tight');
    await expect(page.locator('#x_tightOpts')).toBeVisible();
    await expect(page.locator('#x_frameOpts')).toBeHidden();
    await expect(page.locator('#tight')).toBeChecked();
    const sizes = async () => readZip((await downloadZip(page)).buffer).map((f) => pngSize(f.data));
    const one = await sizes(); // the download closes the dialog
    expect(one[1][0]).toBeGreaterThan(one[0][0]); // a longer text gets a wider card
    await page.click('#batchOpen');
    await page.evaluate(() => { const e = document.querySelector('#x_exportScale'); e.value = '4'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await expect(page.locator('#xv_exportScale')).toHaveText('4×');
    const four = await sizes();
    expect(four[0][0]).toBeGreaterThan(one[0][0] * 1.5);
  });

  test('the card offset typed in the dialog moves the card in the export, like the Export panel', async ({ app: { page } }) => {
    await setText(page, 'Hi');
    await page.click('#batchOpen');
    await page.fill('#x_offX', '120');
    await page.fill('#x_offY', '-80');
    expect(await page.evaluate(() => [__tt.S.offX, __tt.S.offY])).toEqual([120, -80]);
    await expect(page.locator('#offX')).toHaveValue('120');
    const zip = readZip((await downloadZip(page)).buffer);
    await settle(page);
    const single = await exportPng(page);
    expect(zip[0].data.equals(single.buffer)).toBe(true);
  });

  test('a canvas the browser cannot make is flagged up front and the download is disabled', async ({ app: { page } }) => {
    await setText(page, 'Hi');
    await page.click('#batchOpen');
    await pickFrame(page, 'custom');
    await page.fill('#x_fw', '8192');
    await page.fill('#x_fh', '8192');
    await expect(page.locator('#bStatus')).toContainText('too large');
    await expect(page.locator('#bGo')).toBeDisabled();
    await page.fill('#x_fw', '1920');
    await page.fill('#x_fh', '1080');
    await expect(page.locator('#bStatus')).toHaveText('');
    await expect(page.locator('#bGo')).toBeEnabled();
  });

  test('the canvas settings stay after the dialog closes and after a reload', async ({ app: { page } }) => {
    await threeCards(page);
    await page.click('#batchOpen');
    await pickFrame(page, '1080x1350');
    await page.keyboard.press('Escape');
    await expect(page.locator('#frame')).toHaveValue('1080x1350');
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect(await page.evaluate(() => __tt.S.frame)).toBe('1080x1350');
  });
});

test.describe('export dialog: preset', () => {
  async function savePreset(page, name) {
    await page.fill('#presetName', name);
    await page.click('#presetSave');
    await expect(page.locator('#presetSel')).toHaveValue(name);
  }

  test('applying a preset from the dialog restyles every card and refreshes the thumbnails', async ({ app: { page } }) => {
    await threeCards(page);
    await setRange(page, 'size', 140);
    await savePreset(page, 'Client A');
    await setRange(page, 'size', 90);
    await page.click('#cardList [data-card="1"]');
    await page.check('#cardOwn');
    await setRange(page, 'size', 60);
    await page.click('#cardList [data-card="0"]');
    await settle(page);

    await page.click('#batchOpen');
    await expect(page.locator('#dPreset')).toHaveValue('Client A');
    const before = await page.evaluate(() => [...document.querySelectorAll('#bGrid canvas')].map((c) => c.toDataURL()));
    await page.click('#dPresetAll');
    await expect(page.locator('#bGrid canvas')).toHaveCount(3);
    const after = await page.evaluate(() => [...document.querySelectorAll('#bGrid canvas')].map((c) => c.toDataURL()));
    expect(after).not.toEqual(before);
    const st = await page.evaluate(() => ({ own: __tt.cards.map((c) => !!c.style), shared: __tt.sharedStyle.size }));
    expect(st).toEqual({ own: [false, false, false], shared: 140 });

    const files = readZip((await downloadZip(page)).buffer);
    for (let i = 0; i < 3; i++) {
      await page.click(`#cardList [data-card="${i}"]`);
      await settle(page);
      expect(files[i].data.equals((await exportPng(page)).buffer), `card ${i + 1}`).toBe(true);
    }
  });

  test('the dialog starts on the preset chosen in the Export panel', async ({ app: { page } }) => {
    await savePreset(page, 'Client A');
    await savePreset(page, 'Client B');
    await page.selectOption('#presetSel', 'Client A');
    await page.click('#batchOpen');
    await expect(page.locator('#dPreset')).toHaveValue('Client A');
    await page.keyboard.press('Escape');
    await page.selectOption('#presetSel', 'Client B');
    await page.click('#batchOpen');
    await expect(page.locator('#dPreset')).toHaveValue('Client B');
  });

  test('the button needs a preset; the default preset is starred in the list', async ({ app: { page } }) => {
    await page.click('#batchOpen');
    await expect(page.locator('#dPresetAll')).toBeDisabled();
    await page.keyboard.press('Escape');
    await savePreset(page, 'Client A');
    await page.click('#presetDefault');
    await page.click('#batchOpen');
    await expect(page.locator('#dPresetAll')).toBeEnabled();
    await expect(page.locator('#dPreset option', { hasText: '★ Client A' })).toHaveCount(1);
  });
});
