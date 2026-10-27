const { test, expect, setText, settle, addCard, confirmDialog, readZip, downloadZip } = require('./helpers');

// Card names, like layer names: "Titlecard N" by default, renamable, named by the first column of a pasted list, and
// usable as {name} in the export file name pattern.
const names = (page) => page.evaluate(() => { __tt.renderNow(); return __tt.cards.map((c) => c.name); });
const rowNames = (page) => page.locator('#cardList [data-card] .cn').allTextContents();
async function paste(page, text, mode = 'line') {
  await page.click('#listToggle');
  await page.fill('#listText', text);
  await page.selectOption('#listMode', mode);
  await page.click('#listAdd');
  await settle(page);
}
const TABBED = [
  'ClientA-Set1-Vid-1\tThis Truck Has Buyers Asking The SAME Question 👀',
  'ClientA-Set1-Vid-2\tParts Of This SUV Were NEVER Used 😯',
  'ClientA-Set1-Vid-3\t"Clean" Sedan Has An $800 CATCH 🥴',
].join('\n');

test.describe('card names', () => {
  test('cards are Titlecard 1, 2, 3… from the first one on a fresh page, shown with their text', async ({ app: { page } }) => {
    expect(await names(page)).toEqual(['Titlecard 1']);
    await addCard(page, 'Second'); await addCard(page, 'Third');
    expect(await rowNames(page)).toEqual(['Titlecard 1', 'Titlecard 2', 'Titlecard 3']);
    await expect(page.locator('#cardList [data-card="2"] .nm')).toHaveText('Third');
  });

  test('a card added after renamed or imported ones is numbered by its place: never a number already passed', async ({ app: { page } }) => {
    await page.dblclick('#cardList [data-card="0"]'); await page.fill('#cardRename', 'Opener'); await page.keyboard.press('Enter');
    await addCard(page, 'Two');
    expect(await names(page)).toEqual(['Opener', 'Titlecard 2']);
  });

  test('numbering continues after the highest; New batch starts again at 1; Clear keeps the name', async ({ app: { page } }) => {
    await addCard(page, 'Two'); await addCard(page, 'Three');
    await page.click('#cardList [data-card="1"]'); await page.click('#cardDel');
    await addCard(page, 'Four');
    expect(await names(page)).toEqual(['Titlecard 1', 'Titlecard 3', 'Titlecard 4']);
    await page.click('#cardsNew'); await confirmDialog(page);
    expect(await names(page)).toEqual(['Titlecard 1']);
    await setText(page, 'Something'); await page.click('#cardDel'); // the only card: cleared
    expect(await names(page)).toEqual(['Titlecard 1']);
  });

  test('Duplicate: a default name gets the next number, any other name gets "copy"', async ({ app: { page } }) => {
    await page.click('#cardDup');
    expect(await names(page)).toEqual(['Titlecard 1', 'Titlecard 2']);
    await page.dblclick('#cardList [data-card="1"]');
    await page.fill('#cardRename', 'Intro'); await page.keyboard.press('Enter');
    await page.click('#cardDup');
    expect(await names(page)).toEqual(['Titlecard 1', 'Intro', 'Intro copy']);
  });

  test('rename: double-click or F2, Enter keeps, Esc cancels, empty keeps the old name, Space types; undo takes it back', async ({ app: { page } }) => {
    await page.dblclick('#cardList [data-card="0"]');
    await expect(page.locator('#cardRename')).toBeFocused();
    await page.keyboard.press('Control+A'); await page.keyboard.type('Hook card');  // the space must type, not pan
    await page.keyboard.press('Enter');
    expect(await names(page)).toEqual(['Hook card']);
    await expect(page.locator('#cardList [data-card="0"]')).toBeFocused();
    await page.keyboard.press('F2');
    await page.keyboard.type('Nope'); await page.keyboard.press('Escape');
    expect(await names(page)).toEqual(['Hook card']);
    await page.dblclick('#cardList [data-card="0"]');
    await page.fill('#cardRename', '   '); await page.keyboard.press('Enter');
    expect(await names(page)).toEqual(['Hook card']);
    await page.evaluate(() => __tt.undo());
    expect(await names(page)).toEqual(['Titlecard 1']);
  });
});

test.describe('rename: the click that ends it lands where you clicked', () => {
  test('clicking the text box while renaming focuses the text box', async ({ app: { page } }) => {
    await page.dblclick('#cardList [data-card="0"]');
    await page.fill('#cardRename', 'Renamed');
    await page.click('#text');
    await expect(page.locator('#text')).toBeFocused();
    expect(await names(page)).toEqual(['Renamed']);
  });

  test('clicking another card while renaming selects that card', async ({ app: { page } }) => {
    await addCard(page, 'Two');
    await page.dblclick('#cardList [data-card="0"]');
    await page.fill('#cardRename', 'First');
    await page.click('#cardList [data-card="1"]');
    expect(await page.evaluate(() => __tt.active)).toBe(1);
    expect(await names(page)).toEqual(['First', 'Titlecard 2']);
  });

  test('Enter that confirms an IME conversion does not end the rename', async ({ app: { page } }) => {
    await page.dblclick('#cardList [data-card="0"]');
    await page.evaluate(() => document.querySelector('#cardRename').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
    await expect(page.locator('#cardRename')).toBeVisible();
  });
});

test.describe('Add from list', () => {
  test('the old way: one title per line, named Titlecard 1, 2, 3', async ({ app: { page } }) => {
    await setText(page, ''); // a lone empty card is replaced by the list
    await paste(page, 'First title\nSecond title\nThird title');
    expect(await page.evaluate(() => __tt.cards.map((c, i) => [c.name, i === __tt.active ? __tt.S.text : c.text]))).toEqual([
      ['Titlecard 1', 'First title'], ['Titlecard 2', 'Second title'], ['Titlecard 3', 'Third title']]);
    await expect(page.locator('#fileMsg')).toHaveText('Added 3 cards.');
  });

  test('two columns (name, Tab, text) as pasted from a spreadsheet name each card', async ({ app: { page } }) => {
    await setText(page, '');
    await paste(page, TABBED);
    expect(await page.evaluate(() => __tt.cards.map((c, i) => [c.name, i === __tt.active ? __tt.S.text : c.text]))).toEqual([
      ['ClientA-Set1-Vid-1', 'This Truck Has Buyers Asking The SAME Question 👀'],
      ['ClientA-Set1-Vid-2', 'Parts Of This SUV Were NEVER Used 😯'],
      ['ClientA-Set1-Vid-3', '"Clean" Sedan Has An $800 CATCH 🥴']]);
    expect(await rowNames(page)).toEqual(['ClientA-Set1-Vid-1', 'ClientA-Set1-Vid-2', 'ClientA-Set1-Vid-3']);
    await expect(page.locator('#fileMsg')).toContainText('all named from the first column');
    await expect(page.locator('#fileMsg')).toContainText('{name}');
  });

  test('spreadsheet cells with line breaks (copied in quote marks) stay one card; an empty text cell stays empty', async ({ app: { page } }) => {
    await setText(page, '');
    await paste(page, 'Intro\t"Wait for it\nthe ""end"""\nPlain\t"Clean" Sedan Has A CATCH\nOutro\t');
    expect(await page.evaluate(() => __tt.cards.map((c, i) => [c.name, i === __tt.active ? __tt.S.text : c.text]))).toEqual([
      ['Intro', 'Wait for it\nthe "end"'], ['Plain', '"Clean" Sedan Has A CATCH'], ['Outro', '']]);
  });

  test('mixed: lines without a name get the next Titlecard number; blocks take the name from their first line', async ({ app: { page } }) => {
    await paste(page, 'Named-1\tWith a name\nNo name here');
    expect(await names(page)).toEqual(['Titlecard 1', 'Named-1', 'Titlecard 3']); // the fresh page's card stays (it has text); the third card is Titlecard 3
    await paste(page, 'Block-A\tFirst line\nsecond line\n\nJust a block', 'block');
    const last = await page.evaluate(() => __tt.cards.slice(-2).map((c) => [c.name, c.text]));
    expect(last).toEqual([['Block-A', 'First line\nsecond line'], ['Titlecard 5', 'Just a block']]);
  });
});

test.describe('names elsewhere', () => {
  test('{name} names the PNGs in the ZIP; "Name files after the cards" sets it; repeats stay unique', async ({ app: { page } }) => {
    await setText(page, '');
    await paste(page, TABBED + '\nClientA-Set1-Vid-3\tSame name again');
    await page.click('#batchOpen');
    await page.click('#bUseNames');
    await expect(page.locator('#bPattern')).toHaveValue('{name}');
    await expect(page.locator('#bGrid .fn')).toHaveText(['ClientA-Set1-Vid-1.png', 'ClientA-Set1-Vid-2.png', 'ClientA-Set1-Vid-3.png', 'ClientA-Set1-Vid-3-2.png']);
    const { buffer } = await downloadZip(page);
    expect(readZip(buffer).map((f) => f.name)).toEqual(['ClientA-Set1-Vid-1.png', 'ClientA-Set1-Vid-2.png', 'ClientA-Set1-Vid-3.png', 'ClientA-Set1-Vid-3-2.png']);
  });

  test('batchNames fills {n} and {name} in one pass and makes file-safe names', async ({ app: { page } }) => {
    const out = await page.evaluate(() => __tt.batchNames('{name}-{n}', 1, 2, 3, ['A/B', 'Has {n} inside', '']));
    expect(out).toEqual(['A-B-01.png', 'Has {n} inside-02.png', 'titlecard-03-03.png']);
    expect(await page.evaluate(() => __tt.batchNames('Vid{n}', 1, 1, 2))).toEqual(['Vid1.png', 'Vid2.png']); // the old way is unchanged
  });

  test('names are saved in batch files; files from before names get Titlecard 1, 2…', async ({ app: { page } }) => {
    await page.dblclick('#cardList [data-card="0"]'); await page.fill('#cardRename', 'Opener'); await page.keyboard.press('Enter');
    await addCard(page, 'Two');
    await page.click('#fileMenuBtn');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#batchSave')]);
    const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
    const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(json.cards.map((c) => c.m)).toEqual(['Opener', 'Titlecard 2']);
    const old = { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'a' }, { t: 'b', m: '  Kept\u0007 name ' }, { t: 'c' }] };
    await page.setInputFiles('#batchFile', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
    await confirmDialog(page);
    expect(await names(page)).toEqual(['Titlecard 1', 'Kept name', 'Titlecard 3']);
  });
});
