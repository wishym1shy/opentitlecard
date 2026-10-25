const { test, expect, APP_URL, loadTestFont, settle, setRange } = require('./helpers');

test.describe('browser storage', () => {
  test('the app works when localStorage is blocked', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
      Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom;
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await loadTestFont(page);
    await page.fill('#text', 'Still works');
    const L = await settle(page);
    expect(L.lines).toHaveLength(1);
    await page.click('#swatches .sw:nth-child(3)'); // must not throw
    await page.fill('#presetName', 'x');
    await page.click('#presetSave'); // must not throw
    expect(errors).toEqual([]);
    await context.close();
  });

  test('style settings persist across reloads', async ({ app: { page } }) => {
    await setRange(page, 'size', 140);
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect(await page.evaluate(() => __tt.S.size)).toBe(140);
    // the text itself is intentionally NOT persisted
    await expect(page.locator('#text')).toHaveValue('Type your Titlecard here! 😳');
  });
});

test.describe('client presets', () => {
  test('save, change, load round-trips style but never the text', async ({ app: { page } }) => {
    await setRange(page, 'size', 140);
    await page.evaluate(() => { const e = document.querySelector('#bgColor'); e.value = '#ffe066'; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.fill('#presetName', 'Client A');
    await page.click('#presetSave');
    await expect(page.locator('#presetSel')).toHaveValue('Client A');

    await setRange(page, 'size', 90);
    await page.evaluate(() => { const e = document.querySelector('#bgColor'); e.value = '#000000'; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.fill('#text', 'Different text');

    await page.selectOption('#presetSel', 'Client A');
    await page.click('#presetLoad');
    const s = await page.evaluate(() => ({ size: __tt.S.size, bg: __tt.S.bgColor, text: __tt.S.text }));
    expect(s.size).toBe(140);
    expect(s.bg).toBe('#ffe066');
    expect(s.text).toBe('Different text');
  });

  test('deleting a preset removes it from the list', async ({ app: { page } }) => {
    await page.fill('#presetName', 'Temp');
    await page.click('#presetSave');
    await expect(page.locator('#presetSel option', { hasText: 'Temp' })).toHaveCount(1);
    await page.selectOption('#presetSel', 'Temp');
    await page.click('#presetDel');
    await expect(page.locator('#presetSel option', { hasText: 'Temp' })).toHaveCount(0);
  });

  test('exporting a preset downloads valid JSON with style keys only', async ({ app: { page } }) => {
    await page.fill('#presetName', 'my-client');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#presetExport')]);
    expect(dl.suggestedFilename()).toBe('my-client.json');
    const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
    const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(json).toHaveProperty('family');
    expect(json).toHaveProperty('topPad');
    expect(json).not.toHaveProperty('text');
  });

  test('importing a preset applies it', async ({ app: { page } }) => {
    const payload = Buffer.from(JSON.stringify({ size: 123, align: 'left', bgOpacity: 55 }));
    await page.setInputFiles('#presetFile', { name: 'p.json', mimeType: 'application/json', buffer: payload });
    await page.waitForFunction(() => __tt.S.size === 123);
    const s = await page.evaluate(() => ({ size: __tt.S.size, align: __tt.S.align, op: __tt.S.bgOpacity }));
    expect(s).toEqual({ size: 123, align: 'left', op: 55 });
  });
});

test.describe('rename migration (opentok.* -> opentitlecard.*)', () => {
  // Seeds localStorage BEFORE the app script runs, like a returning user from before the rename.
  async function openWithSeed(browser, seed) {
    const context = await browser.newContext();
    await context.addInitScript((seed) => {
      if (sessionStorage.getItem('seeded')) return; // seed once, not on reload
      sessionStorage.setItem('seeded', '1');
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
    }, seed);
    const page = await context.newPage();
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    return { context, page };
  }

  test('old style, palette and presets carry over to the new keys', async ({ browser }) => {
    const { context, page } = await openWithSeed(browser, {
      'opentok.style': { size: 133 },
      'opentok.custom': ['#123456'],
      'opentok.presets': { 'Old client': { size: 90 } },
    });
    expect(await page.evaluate(() => __tt.S.size)).toBe(133);
    expect(await page.evaluate(() => __tt.S.custom)).toContain('#123456');
    await expect(page.locator('#presetSel option', { hasText: 'Old client' })).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('opentitlecard.presets'))).toContain('Old client');
    await context.close();
  });

  test('never overwrites settings already saved under the new keys', async ({ browser }) => {
    const { context, page } = await openWithSeed(browser, {
      'opentok.style': { size: 133 },
      'opentitlecard.style': { size: 77 },
    });
    expect(await page.evaluate(() => __tt.S.size)).toBe(77);
    await context.close();
  });

  test('a fresh visitor gets the defaults and no old keys are invented', async ({ browser }) => {
    const { context, page } = await openWithSeed(browser, {});
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('opentok.')))).toEqual([]);
    expect(await page.evaluate(() => __tt.S.size)).toBe(100);
    await context.close();
  });
});
