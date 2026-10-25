const { test, expect, APP_URL, loadTestFont, setText, settle, setRange, setSelection, readZip, downloadZip, addCard } = require('./helpers');

const KEY = 'opentitlecard.cards';
const saved = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => window.__tt && window.__tt.L);
}
const snapshot = (page) => page.evaluate(() => {
  __tt.renderNow();
  return {
    active: __tt.active,
    cards: __tt.cards.map((c, i) => {
      const live = i === __tt.active ? __tt.S : c;
      return { text: live.text, colors: live.colors.filter(Boolean), ital: live.ital.reduce((n, v) => n + (v ? 1 : 0), 0), nudge: live.nudges[0] && (live.nudges[0].x || live.nudges[0].y) ? live.nudges[0] : null, own: !!c.style };
    }),
  };
});

async function buildBatch(page) {
  await setText(page, 'Alpha beta');
  await setSelection(page, 0, 5);
  await page.click('#swatches .sw:nth-child(3)'); // Red
  await page.click('#ital');
  await page.fill('[data-i="0"][data-a="x"]', '12');
  await addCard(page, 'Second card');
  await page.check('#cardOwn');
  await setRange(page, 'size', 60);
  await addCard(page, 'Third');
  await page.click('#cardList [data-card="1"]');
  await settle(page);
}

test.describe('saved cards', () => {
  test('a reload brings back every card: text, colors, italics, nudges, own styles and the active card', async ({ app: { page } }) => {
    await buildBatch(page);
    const before = await snapshot(page);
    await reload(page); // saved by pagehide: no waiting for the debounce
    const after = await snapshot(page);
    expect(after).toEqual(before);
    expect(after.active).toBe(1);
    await expect(page.locator('#text')).toHaveValue('Second card');
    await expect(page.locator('#cardList [data-card]')).toHaveCount(3);
    await expect(page.locator('#cardList [data-own]')).toHaveCount(1);
    await expect(page.locator('#size')).toHaveValue('60');
    await expect(page.locator('#cardOwn')).toBeChecked();
    expect(await page.evaluate(() => ({ c: __tt.cards[0].colors[0], i: __tt.cards[0].ital[0], n: __tt.cards[0].nudges[0] }))).toEqual({ c: '#ff2d2d', i: 1, n: { x: 12, y: 0 } });
  });

  test('a restored batch exports like the original', async ({ app: { page } }) => {
    await buildBatch(page);
    await page.click('#batchOpen');
    const first = readZip((await downloadZip(page)).buffer);
    await reload(page);
    await loadTestFont(page); // a loaded font file does not survive a reload; the saved family name does
    await page.click('#batchOpen');
    const second = readZip((await downloadZip(page)).buffer);
    expect(second.map((f) => f.name)).toEqual(first.map((f) => f.name));
    second.forEach((f, i) => expect(f.data.equals(first[i].data), `card ${i + 1}`).toBe(true));
  });

  test('autosaves shortly after an edit, without leaving the page', async ({ app: { page } }) => {
    await setText(page, 'Typed once');
    await page.waitForFunction((k) => (localStorage.getItem(k) || '').includes('Typed once'), KEY);
  });

  test('is stored compactly: only the characters that have a color or italic', async ({ app: { page } }) => {
    await setText(page, 'A'.repeat(300));
    await setSelection(page, 0, 2);
    await page.click('#swatches .sw:nth-child(3)');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const json = await saved(page);
    expect(json).not.toContain('null');
    expect(json.length).toBeLessThan(450);
    expect(JSON.parse(json).cards[0].c).toEqual({ 0: '#ff2d2d', 1: '#ff2d2d' });
  });

  test('a first visit or an untouched batch saves nothing', async ({ app: { page } }) => {
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await saved(page)).toBeNull();
    await setText(page, 'Changed');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await saved(page)).not.toBeNull();
  });

  test('New batch removes every card and the saved copy', async ({ app: { page } }) => {
    await buildBatch(page);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await saved(page)).not.toBeNull();
    await page.click('#cardsNew');
    await settle(page);
    expect(await page.evaluate(() => ({ n: __tt.cards.length, text: __tt.S.text, own: !!__tt.cards[0].style }))).toEqual({ n: 1, text: '', own: false });
    expect(await saved(page)).toBeNull();
    await reload(page);
    expect(await page.evaluate(() => __tt.cards.length)).toBe(1);
    expect(await page.evaluate(() => __tt.S.text)).toBe('Type your Titlecard here! 😳');
  });
});

// Seeds localStorage BEFORE the app script runs (like data left by an earlier visit). Seeding after load would not do:
// the page saves its own state when it unloads and would overwrite whatever the test just wrote.
async function openSeeded(browser, raw) {
  const context = await browser.newContext();
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, raw]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  return { context, page, errors };
}

test.describe('saved cards: untrusted storage', () => {
  test('unusable saved data is ignored and the app starts normally', async ({ browser }) => {
    for (const bad of ['not json at all', '{"v":2,"cards":[{"t":"x"}]}', '{"v":1,"cards":[]}', '{"v":1,"cards":"nope"}', 'null', '42']) {
      const { context, page, errors } = await openSeeded(browser, bad);
      expect(await page.evaluate(() => __tt.S.text), bad).toBe('Type your Titlecard here! 😳');
      expect(errors, bad).toEqual([]);
      await context.close();
    }
  });

  test('valid saved data is used (so the tests above prove something)', async ({ browser }) => {
    const { context, page } = await openSeeded(browser, JSON.stringify({ v: 1, active: 1, cards: [{ t: 'One' }, { t: 'Two' }] }));
    expect(await page.evaluate(() => ({ n: __tt.cards.length, active: __tt.active, text: __tt.S.text }))).toEqual({ n: 2, active: 1, text: 'Two' });
    await context.close();
  });

  test('damaged fields are dropped; the good ones are kept', async ({ browser }) => {
    const data = {
      v: 1, active: 99,
      cards: [
        { t: 'Hello', c: { 0: '#abc', 1: 'red', 2: '#12345g', 99: '#ffffff', '-1': '#000000', x: '#000000' }, i: [0, 1.5, 99, -2, 'a'], n: [{ x: 5, y: 6 }, { x: 'a', y: 1 }, null, { x: 1e99, y: 1 }], s: { size: 'huge', weight: 800, family: 7, textColor: '#ff0000', bogus: 1 } },
        { t: 5 },
        'not a card',
      ],
    };
    const { context, page, errors } = await openSeeded(browser, JSON.stringify(data));
    const r = await page.evaluate(() => {
      const c0 = __tt.cards[0];
      return {
        n: __tt.cards.length, active: __tt.active,
        colors: c0.colors, ital: c0.ital, nudges: c0.nudges,
        style: { size: c0.style.size, weight: c0.style.weight, family: c0.style.family, textColor: c0.style.textColor, bogus: 'bogus' in c0.style },
        texts: __tt.cards.map((c, i) => (i === __tt.active ? __tt.S.text : c.text)),
      };
    });
    expect(r.n).toBe(3);
    expect(r.active).toBe(2); // out-of-range index is clamped
    expect(r.colors).toEqual(['#abc', null, null, null, null]);
    expect(r.ital).toEqual([1, 0, 0, 0, 0]);
    expect(r.nudges).toEqual([{ x: 5, y: 6 }, null, null, { x: 5000, y: 1 }]);
    expect(r.style).toEqual({ size: 100, weight: 800, family: 'Linik Sans', textColor: '#ff0000', bogus: false }); // bad size/family fall back to the shared style
    expect(r.texts).toEqual(['Hello', '', '']);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('very long text and huge batches are capped, not trusted', async ({ browser }) => {
    const cards = Array.from({ length: 600 }, (_, i) => ({ t: i === 0 ? 'x'.repeat(5000) : 'c' + i }));
    const { context, page } = await openSeeded(browser, JSON.stringify({ v: 1, active: 0, cards }));
    expect(await page.evaluate(() => __tt.cards.length)).toBe(500);
    expect(await page.evaluate(() => __tt.S.text.length)).toBe(2000);
    await context.close();
  });
});
