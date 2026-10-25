const { test, expect, APP_URL, setText, settle, setRange, setSelection, addCard, confirmDialog } = require('./helpers');

const undo = (page) => page.keyboard.press('Control+Z');
const redo = (page) => page.keyboard.press('Control+Shift+Z');
const text = (page) => page.evaluate(() => __tt.S.text);
const size = (page) => page.evaluate(() => __tt.S.size);
const pause = (page) => page.waitForTimeout(1100); // longer than the 1 s in which changes of one kind merge
async function typeAtEnd(page, s) {
  await page.focus('#text');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(s);
}

test.describe('undo and redo', () => {
  test('Ctrl+Z undoes typing; Ctrl+Shift+Z and Ctrl+Y redo it', async ({ app: { page } }) => {
    await setText(page, 'Big news');
    await pause(page);
    await typeAtEnd(page, ' today');
    expect(await text(page)).toBe('Big news today');
    await undo(page);
    expect(await text(page)).toBe('Big news');
    await expect(page.locator('#text')).toHaveValue('Big news');
    await redo(page);
    expect(await text(page)).toBe('Big news today');
    await undo(page);
    await page.keyboard.press('Control+Y');
    expect(await text(page)).toBe('Big news today');
  });

  test('Cmd+Z and Cmd+Shift+Z work too (Mac)', async ({ app: { page } }) => {
    await setText(page, 'One');
    await pause(page);
    await typeAtEnd(page, ' two');
    await page.keyboard.press('Meta+Z');
    expect(await text(page)).toBe('One');
    await page.keyboard.press('Meta+Shift+Z');
    expect(await text(page)).toBe('One two');
  });

  test('a burst of typing is one step; a pause starts a new one', async ({ app: { page } }) => {
    await setText(page, 'Go');
    await pause(page);
    await typeAtEnd(page, ' abc');
    await pause(page);
    await typeAtEnd(page, ' def');
    await undo(page);
    expect(await text(page)).toBe('Go abc');
    await undo(page);
    expect(await text(page)).toBe('Go');
  });

  test('colour and italic are undone step by step, and stay on the right letters', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS');
    await setSelection(page, 4, 8);
    await page.click('#swatches .sw:nth-child(3)'); // Red
    await page.click('#ital');
    await pause(page);
    await typeAtEnd(page, '!');
    const fmt = () => page.evaluate(() => ({ c: __tt.S.colors.slice(0, 8).filter(Boolean).length, i: __tt.S.ital.slice(0, 8).filter(Boolean).length, t: __tt.S.text }));
    await undo(page);
    expect(await fmt(page)).toEqual({ c: 4, i: 4, t: 'Big NEWS' });
    await undo(page);
    expect(await fmt(page)).toEqual({ c: 4, i: 0, t: 'Big NEWS' });
    await undo(page);
    expect(await fmt(page)).toEqual({ c: 0, i: 0, t: 'Big NEWS' });
    await redo(page); await redo(page);
    expect(await fmt(page)).toEqual({ c: 4, i: 4, t: 'Big NEWS' });
  });

  test('one slider drag is one step, and the undone value is what gets saved', async ({ app: { page } }) => {
    for (const v of [110, 120, 130, 140]) await setRange(page, 'size', v); // many input events, like a drag
    await undo(page);
    expect(await size(page)).toBe(100);
    await expect(page.locator('#size')).toHaveValue('100');
    await expect(page.locator('#v_size')).toHaveText('100 px');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('opentitlecard.style')).size)).toBe(100);
    await redo(page);
    expect(await size(page)).toBe(140);
  });

  test('a reset button is its own step, even right after a drag', async ({ app: { page } }) => {
    await setRange(page, 'size', 140);
    await page.click('button[data-reset-key="size"]');
    expect(await size(page)).toBe(100);
    await undo(page);
    expect(await size(page)).toBe(140);
  });

  test('checkboxes, colours and canvas settings are undone', async ({ app: { page } }) => {
    await page.check('#boxShadow');
    await page.selectOption('#frame', '1080x1920');
    await undo(page);
    expect(await page.evaluate(() => [__tt.S.frame, __tt.S.fw, __tt.S.fh])).toEqual(['1920x1080', 1920, 1080]);
    await expect(page.locator('#frame')).toHaveValue('1920x1080');
    await undo(page);
    await expect(page.locator('#boxShadow')).not.toBeChecked();
  });

  test('a nudge drag is one step', async ({ app: { page } }) => {
    await setText(page, 'Line');
    const field = page.locator('#nudges input[data-i="0"][data-a="x"]');
    for (const v of ['5', '15', '25']) await field.fill(v);
    await undo(page);
    expect(await page.evaluate(() => __tt.S.nudges[0].x)).toBe(0);
    await redo(page);
    expect(await page.evaluate(() => __tt.S.nudges[0].x)).toBe(25);
  });

  test('deleting, moving and adding cards are undone, text and all', async ({ app: { page } }) => {
    await setText(page, 'One');
    await addCard(page, 'Two');
    await addCard(page, 'Three');
    const texts = () => page.evaluate(() => __tt.cards.map((c, i) => (i === __tt.active ? __tt.S.text : c.text)));
    await page.click('#cardList [data-card="1"]');
    await page.click('#cardDel');
    expect(await texts()).toEqual(['One', 'Three']);
    await undo(page);
    expect(await texts()).toEqual(['One', 'Two', 'Three']);
    expect(await page.evaluate(() => __tt.active)).toBe(1); // back on the card that was deleted
    await page.click('#cardUp');
    expect(await texts()).toEqual(['Two', 'One', 'Three']);
    await undo(page);
    expect(await texts()).toEqual(['One', 'Two', 'Three']);
  });

  test('New batch and Open batch file can be undone', async ({ app: { page } }) => {
    await setText(page, 'Keep me');
    await addCard(page, 'And me');
    await page.click('#cardsNew');
    await confirmDialog(page);
    expect(await page.evaluate(() => __tt.cards.length)).toBe(1);
    await page.focus('#text');
    await undo(page);
    expect(await page.evaluate(() => __tt.cards.length)).toBe(2);
    const file = { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'From file' }] };
    await page.setInputFiles('#batchFile', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await confirmDialog(page);
    expect(await text(page)).toBe('From file');
    await page.focus('#text');
    await undo(page);
    expect(await page.evaluate(() => __tt.cards.length)).toBe(2);
  });

  test('undo shows the card the change was made on', async ({ app: { page } }) => {
    await setText(page, 'One');
    await addCard(page, 'Two');
    await pause(page);
    await typeAtEnd(page, ' more');                       // a change on card 2
    await page.click('#cardList [data-card="0"]');         // look at card 1 (selecting is not a step)
    await settle(page);
    await page.focus('#text');
    await undo(page);
    expect(await page.evaluate(() => __tt.active)).toBe(1);
    expect(await text(page)).toBe('Two');
    expect(await page.evaluate(() => __tt.cards[0].text)).toBe('One');
  });

  test('a change after an undo drops the steps that could have been redone', async ({ app: { page } }) => {
    await setRange(page, 'size', 140);
    await setRange(page, 'lh', 1.5);
    await undo(page);
    await setRange(page, 'track', 5);
    await expect(page.locator('#redo')).toBeDisabled();
    await redo(page);
    expect(await page.evaluate(() => [__tt.S.lh, __tt.S.track])).toEqual([1.25, 5]);
  });

  test('changes that change nothing add no step', async ({ app: { page } }) => {
    const before = await page.evaluate(() => __tt.history.length);
    await setRange(page, 'size', 100); // already 100
    await setSelection(page, 0);
    await page.click('#cardList [data-card="0"]');
    expect(await page.evaluate(() => __tt.history.length)).toBe(before);
  });

  test('history keeps the last 100 steps', async ({ app: { page } }) => {
    await page.evaluate(() => {
      for (let i = 0; i < 130; i++) { // alternate two sliders so no two changes merge
        const el = document.querySelector(i % 2 ? '#lh' : '#size');
        el.value = i % 2 ? String(1 + (i % 50) / 100) : String(60 + (i % 100));
        el.dispatchEvent(new Event('input'));
      }
    });
    expect(await page.evaluate(() => __tt.history)).toEqual({ length: 100, at: 99 });
    await page.evaluate(() => { for (let i = 0; i < 150; i++) __tt.undo(); });
    expect(await page.evaluate(() => __tt.history.at)).toBe(0);
  });

  test('fields that are not part of the design keep the browser\'s own undo', async ({ app: { page } }) => {
    await setRange(page, 'size', 140);
    await page.focus('#presetName');
    await page.keyboard.type('Client');
    await undo(page);
    expect(await size(page)).toBe(140); // the design was not touched
  });

  test('nothing is undone while a dialog is open', async ({ app: { page } }) => {
    await setRange(page, 'size', 140);
    await page.click('#batchOpen');
    await undo(page);
    expect(await size(page)).toBe(140);
    await page.click('#bClose');
    await undo(page);
    expect(await size(page)).toBe(100);
  });
});

test('the Undo and Redo buttons follow the history', async ({ browser }) => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await expect(page.locator('#undo')).toBeDisabled(); // a fresh page has nothing to undo
  await expect(page.locator('#redo')).toBeDisabled();
  await setRange(page, 'size', 150);
  await expect(page.locator('#undo')).toBeEnabled();
  await page.click('#undo');
  expect(await size(page)).toBe(100);
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#redo')).toBeEnabled();
  await page.click('#redo');
  expect(await size(page)).toBe(150);
  await expect(page.locator('#redo')).toBeDisabled();
  expect(errors).toEqual([]);
  await page.close();
});
