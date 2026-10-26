const { test, expect, setText, addCard } = require('./helpers');

/* Cards live only in memory, so the browser's leave-page prompt guards them. Chromium only shows it after the user has
   interacted with the page, so every test clicks first: otherwise "no prompt" would pass for the wrong reason.
   The fixture answers the prompt with "Leave"; this only watches whether it was asked. */
async function reloadAsks(page) {
  let asked = false;
  const watch = (d) => { if (d.type() === 'beforeunload') asked = true; };
  page.on('dialog', watch);
  await page.reload();
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  page.off('dialog', watch);
  return asked;
}
async function saveBatch(page) {
  await page.click('#batchMenuBtn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#batchSave')]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  return Buffer.concat(chunks);
}

test.describe('leaving the page', () => {
  test('a fresh page closes without asking', async ({ app: { page } }) => {
    await page.click('#text');
    expect(await reloadAsks(page)).toBe(false);
  });

  test('typed text makes reload ask first', async ({ app: { page } }) => {
    await setText(page, 'Work in progress');
    expect(await reloadAsks(page)).toBe(true);
  });

  test('a second card makes reload ask first', async ({ app: { page } }) => {
    await addCard(page, 'Another');
    expect(await reloadAsks(page)).toBe(true);
  });

  test('after saving the batch it no longer asks, until something changes', async ({ app: { page } }) => {
    await setText(page, 'Saved text');
    await saveBatch(page);
    expect(await page.evaluate(() => __tt.unsavedWork())).toBe(false);
    await setText(page, 'Saved text, edited');
    expect(await page.evaluate(() => __tt.unsavedWork())).toBe(true);
    await saveBatch(page);
    expect(await reloadAsks(page)).toBe(false);
  });

  test('a batch just opened from a file does not ask', async ({ app: { page } }) => {
    await setText(page, 'From a file');
    const file = await saveBatch(page);
    await page.reload();   // asked and left (the fixture answers "Leave")
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await page.setInputFiles('#batchFile', { name: 'set.json', mimeType: 'application/json', buffer: file });
    await expect(page.locator('#text')).toHaveValue('From a file');
    expect(await reloadAsks(page)).toBe(false);
  });
});
