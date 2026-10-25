const { test, expect, setText, settle, setRange, exportPng, readZip, pngSize, downloadZip, addCard, confirmDialog } = require('./helpers');

const size = (page) => page.evaluate(() => __tt.S.size);
const own = (page) => page.locator('#cardOwn');
async function select(page, i) {
  await page.click(`#cardList [data-card="${i}"]`);
  await settle(page);
}
async function threeCards(page) {
  await setText(page, 'One');
  await addCard(page, 'Two');
  await addCard(page, 'Three');
  await select(page, 0);
}

test.describe('per-card styles', () => {
  test('a card follows the shared style until it is given its own', async ({ app: { page } }) => {
    await threeCards(page);
    await expect(own(page)).not.toBeChecked();
    await expect(page.locator('#scope')).toHaveText('Style edits: all cards');
    await setRange(page, 'size', 120);
    await select(page, 1);
    expect(await size(page)).toBe(120); // every card without its own style got the change
    await select(page, 2);
    expect(await size(page)).toBe(120);
  });

  test('an own style is edited and kept per card, and the others are unaffected', async ({ app: { page } }) => {
    await threeCards(page);
    await select(page, 1);
    await own(page).check();
    await expect(page.locator('#scope')).toHaveText('Style edits: this card only');
    await expect(page.locator('#cardList [data-card="1"]')).toHaveAttribute('data-own', '1');
    await setRange(page, 'size', 60);
    await page.evaluate(() => { const e = document.querySelector('#bgColor'); e.value = '#ffe066'; e.dispatchEvent(new Event('change', { bubbles: true })); });

    await select(page, 0);
    expect(await page.evaluate(() => ({ size: __tt.S.size, bg: __tt.S.bgColor }))).toEqual({ size: 100, bg: '#ffffff' });
    await expect(page.locator('#size')).toHaveValue('100');
    await expect(page.locator('#scope')).toHaveText('Style edits: all cards without their own style');
    await setRange(page, 'size', 130); // shared change: card 3 follows, card 2 keeps its own
    await select(page, 2);
    expect(await size(page)).toBe(130);
    await select(page, 1);
    expect(await page.evaluate(() => ({ size: __tt.S.size, bg: __tt.S.bgColor }))).toEqual({ size: 60, bg: '#ffe066' });
    await expect(page.locator('#size')).toHaveValue('60');
    await expect(own(page)).toBeChecked();
  });

  test('unticking own style asks first; Cancel keeps the card\'s style, and the box stays ticked', async ({ app: { page } }) => {
    await threeCards(page);
    await select(page, 1);
    await own(page).check();
    await setRange(page, 'size', 60);
    await own(page).click();
    await expect(page.locator('#confirmDlg')).toBeVisible();
    await expect(page.locator('#cTitle')).toHaveText('Use the shared style for this card?');
    await expect(page.locator('#cCancel')).toBeFocused();
    await confirmDialog(page, false);
    await expect(own(page)).toBeChecked();
    expect(await size(page)).toBe(60);
    await expect(page.locator('#cardList [data-card="1"]')).toHaveAttribute('data-own', '1');
    await own(page).click();
    await confirmDialog(page, true);
    await expect(own(page)).not.toBeChecked();
    expect(await size(page)).toBe(100);
  });

  test('turning the own style off sends the card back to the shared style', async ({ app: { page } }) => {
    await threeCards(page);
    await select(page, 1);
    await own(page).check();
    await setRange(page, 'size', 60);
    await own(page).click();
    await confirmDialog(page);
    expect(await size(page)).toBe(100);
    await expect(page.locator('#cardList [data-own]')).toHaveCount(0);
    await expect(page.locator('#scope')).toHaveText('Style edits: all cards');
  });

  test('duplicate copies the own style; a new card starts on the shared style; clearing keeps the style', async ({ app: { page } }) => {
    await setText(page, 'One');
    await own(page).check();
    await setRange(page, 'size', 70);
    await page.click('#cardDup');
    await settle(page);
    expect(await page.evaluate(() => ({ size: __tt.S.size, own: !!__tt.cards[__tt.active].style }))).toEqual({ size: 70, own: true });
    await page.click('#cardAdd');
    await settle(page);
    expect(await page.evaluate(() => ({ size: __tt.S.size, own: !!__tt.cards[__tt.active].style }))).toEqual({ size: 100, own: false });
    await select(page, 0);
    await page.click('#cardDel'); await page.click('#cardDel'); await settle(page); // 3 cards -> 1 -> cleared
    expect(await page.evaluate(() => ({ n: __tt.cards.length, text: __tt.S.text, size: __tt.S.size }))).toEqual({ n: 1, text: '', size: 100 });
  });

  test('clearing the only card keeps its own style', async ({ app: { page } }) => {
    await setText(page, 'One');
    await own(page).check();
    await setRange(page, 'size', 70);
    await page.click('#cardDel'); // the only card: cleared, not removed
    await settle(page);
    expect(await page.evaluate(() => ({ n: __tt.cards.length, text: __tt.S.text, size: __tt.S.size, own: !!__tt.cards[0].style }))).toEqual({ n: 1, text: '', size: 70, own: true });
  });

  test('the saved last-used style is the shared one, never a card\'s own style', async ({ app: { page } }) => {
    await setRange(page, 'size', 120);
    await addCard(page, 'Two');
    await page.check('#cardOwn');
    await setRange(page, 'size', 50); // edits the own style while it is active
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('opentitlecard.style')).size)).toBe(120);
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect(await size(page)).toBe(120); // the app opens with the shared style
  });

  test('the ZIP renders every card with its own style, identical to a single export of that card', async ({ app: { page } }) => {
    await threeCards(page);
    await select(page, 1);
    await own(page).check();
    await setRange(page, 'size', 160);
    await page.uncheck('#bgOn');
    await select(page, 0);
    await page.click('#batchOpen');
    const { buffer } = await downloadZip(page);
    const files = readZip(buffer);
    expect(files).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      await select(page, i);
      const single = await exportPng(page);
      expect(files[i].data.equals(single.buffer), `card ${i + 1} matches its single export`).toBe(true);
    }
    expect(files[0].data.equals(files[1].data)).toBe(false);
    expect(files.map((f) => pngSize(f.data))).toEqual([[1920, 1080], [1920, 1080], [1920, 1080]]);
    // exporting did not disturb the card in front of you
    expect(await page.evaluate(() => ({ active: __tt.active, size: __tt.S.size }))).toEqual({ active: 2, size: 100 });
  });

  test('the export dialog warns about a font that only one card uses', async ({ app: { page } }) => {
    await threeCards(page);
    await select(page, 1);
    await own(page).check();
    await page.fill('#family', 'Definitely Not A Real Font');
    await select(page, 0); // the card in front is fine
    await page.click('#batchOpen');
    await expect(page.locator('#bFont')).toBeVisible();
    await expect(page.locator('#bFont')).toContainText('Definitely Not A Real Font');
  });

  test('an empty card with a missing font does not trigger the font warning', async ({ app: { page } }) => {
    await setText(page, 'Fine');
    await page.click('#cardAdd'); // empty
    await own(page).check();
    await page.fill('#family', 'Definitely Not A Real Font');
    await page.click('#cardList [data-card="0"]');
    await page.click('#batchOpen');
    await expect(page.locator('#bFont')).toBeHidden();
  });
});

test.describe('apply preset to all cards', () => {
  async function savePreset(page, name) {
    await page.fill('#presetName', name);
    await page.click('#presetSave');
    await expect(page.locator('#presetSel')).toHaveValue(name);
  }

  test('every card gets the preset, replacing any card\'s own style', async ({ app: { page } }) => {
    await threeCards(page);
    await setRange(page, 'size', 140);
    await page.evaluate(() => { const e = document.querySelector('#bgColor'); e.value = '#ffe066'; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await savePreset(page, 'Client A');

    await setRange(page, 'size', 90);
    await select(page, 1);
    await own(page).check();
    await setRange(page, 'size', 60);

    await page.click('#presetAll');
    await confirmDialog(page);
    await settle(page);
    const st = await page.evaluate(() => ({ own: __tt.cards.map((c) => !!c.style), size: __tt.S.size, bg: __tt.S.bgColor, shared: __tt.sharedStyle.size, active: __tt.active }));
    expect(st).toEqual({ own: [false, false, false], size: 140, bg: '#ffe066', shared: 140, active: 1 });
    for (const i of [0, 2]) {
      await select(page, i);
      expect(await page.evaluate(() => ({ size: __tt.S.size, bg: __tt.S.bgColor }))).toEqual({ size: 140, bg: '#ffe066' });
    }
    await expect(page.locator('#cardList [data-own]')).toHaveCount(0);
  });

  test('Load only changes the card in front of you when it has its own style', async ({ app: { page } }) => {
    await threeCards(page);
    await setRange(page, 'size', 140);
    await savePreset(page, 'Client A');
    await setRange(page, 'size', 90);
    await select(page, 1);
    await own(page).check();
    await page.click('#presetLoad');
    await settle(page);
    expect(await size(page)).toBe(140);
    await select(page, 0);
    expect(await size(page)).toBe(90);
  });

  test('asks first, saying how many cards lose their own style; Cancel changes nothing', async ({ app: { page } }) => {
    await threeCards(page);
    await setRange(page, 'size', 140);
    await savePreset(page, 'Client A');
    await setRange(page, 'size', 90);
    for (const i of [1, 2]) { await select(page, i); await own(page).check(); await setRange(page, 'size', 50 + i); }
    await page.click('#presetAll');
    await expect(page.locator('#confirmDlg')).toBeVisible();
    await expect(page.locator('#cTitle')).toHaveText('Apply “Client A” to all cards?');
    await expect(page.locator('#cMsg')).toHaveText('All 3 cards will use this preset. 2 cards have their own style and lose it.');
    await expect(page.locator('#cCancel')).toBeFocused(); // the safe choice is the default
    await confirmDialog(page, false);
    expect(await page.evaluate(() => ({ own: __tt.cards.map((c, i) => (i === __tt.active ? !!__tt.cards[i].style : !!c.style)), shared: __tt.sharedStyle.size, size: __tt.S.size }))).toEqual({ own: [false, true, true], shared: 90, size: 52 });
    await page.click('#presetAll');
    await page.keyboard.press('Escape'); // Esc also means no
    await expect(page.locator('#confirmDlg')).not.toBeVisible();
    expect(await page.evaluate(() => __tt.sharedStyle.size)).toBe(90);
    await page.click('#presetAll');
    await confirmDialog(page);
    expect(await page.evaluate(() => ({ shared: __tt.sharedStyle.size, own: __tt.cards.map((c) => !!c.style) }))).toEqual({ shared: 140, own: [false, false, false] });
  });

  test('with no own styles the message says so and does not mention losing any', async ({ app: { page } }) => {
    await setText(page, 'One');
    await savePreset(page, 'Client A');
    await page.click('#presetAll');
    await expect(page.locator('#cMsg')).toHaveText('This card will use this preset.');
    await confirmDialog(page, false);
  });

  test('the button needs a selected preset', async ({ app: { page } }) => {
    await expect(page.locator('#presetAll')).toBeDisabled();
    await savePreset(page, 'Client A');
    await expect(page.locator('#presetAll')).toBeEnabled();
  });
});
