const { test, expect, FONT_FAMILY, setText, settle, setRange, setSelection, readZip, downloadZip, addCard, confirmDialog } = require('./helpers');

async function saveBatch(page) {
  await page.click('#batchMenuBtn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#batchSave')]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  return { text, json: JSON.parse(text), filename: dl.suggestedFilename() };
}
async function openFile(page, content, name = 'batch.json') {
  const buffer = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
  await page.setInputFiles('#batchFile', { name, mimeType: 'application/json', buffer });
}
const snapshot = (page) => page.evaluate(() => {
  __tt.renderNow();
  return {
    active: __tt.active,
    cards: __tt.cards.map((c, i) => {
      const live = i === __tt.active ? __tt.S : c;
      const n = live.nudges[0];
      return { text: live.text, colors: live.colors.filter(Boolean), ital: live.ital.filter(Boolean).length, nudge: n && (n.x || n.y) ? n : null, own: !!c.style };
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

test.describe('save and open a batch file', () => {
  test('Save downloads a readable .json with every card, named from the file name pattern', async ({ app: { page } }) => {
    await buildBatch(page);
    const { json, filename, text } = await saveBatch(page);
    expect(filename).toBe('titlecard-set.json');
    expect(json).toMatchObject({ app: 'opentitlecard', type: 'batch', v: 1, active: 1 });
    expect(json.cards.map((c) => c.t)).toEqual(['Alpha beta', 'Second card', 'Third']);
    expect(json.cards[0].c).toEqual({ 0: '#ff2d2d', 1: '#ff2d2d', 2: '#ff2d2d', 3: '#ff2d2d', 4: '#ff2d2d' });
    expect(json.cards[0].n).toEqual([{ x: 12, y: 0 }]);
    expect(json.cards[1].s.size).toBe(60);
    expect(json.cards[2].s).toBeUndefined();
    expect(text).not.toContain('null,null'); // sparse, not one entry per character
    await expect(page.locator('#fileMsg')).toContainText('Saved 3 cards');
  });

  test('the file name follows the batch naming pattern', async ({ app: { page } }) => {
    await setText(page, 'Hi');
    await page.click('#batchOpen');
    await page.fill('#bPattern', 'ClientA-Vid{n}-TC');
    await page.keyboard.press('Escape');
    expect((await saveBatch(page)).filename).toBe('ClientA-Vid-TC-set.json');
  });

  test('a saved batch opens again with everything intact, and exports the same ZIP', async ({ app: { page } }) => {
    await buildBatch(page);
    const before = await snapshot(page);
    await page.click('#batchOpen');
    const zip1 = readZip((await downloadZip(page)).buffer);
    const { text } = await saveBatch(page);

    await page.click('#cardsNew');
    await confirmDialog(page);
    await settle(page);
    expect((await snapshot(page)).cards).toHaveLength(1);

    await openFile(page, text);
    await expect(page.locator('#fileMsg')).toContainText('Opened 3 cards');
    expect(await snapshot(page)).toEqual(before);
    await expect(page.locator('#text')).toHaveValue('Second card');
    await expect(page.locator('#cardOwn')).toBeChecked();
    await expect(page.locator('#size')).toHaveValue('60');
    await page.click('#batchOpen');
    const zip2 = readZip((await downloadZip(page)).buffer);
    expect(zip2.map((f) => f.name)).toEqual(zip1.map((f) => f.name));
    zip2.forEach((f, i) => expect(f.data.equals(zip1[i].data), `card ${i + 1}`).toBe(true));
  });

  test('the same file can be opened twice in a row', async ({ app: { page } }) => {
    await buildBatch(page);
    const { text } = await saveBatch(page);
    await openFile(page, text);
    await confirmDialog(page); // the page holds a batch that would be replaced
    await expect(page.locator('#fileMsg')).toContainText('Opened 3 cards');
    await page.click('#cardsNew');
    await confirmDialog(page);
    await openFile(page, text);
    await expect(page.locator('#fileMsg')).toContainText('Opened 3 cards');
    expect((await snapshot(page)).cards).toHaveLength(3);
  });

  test('the batch\'s shared style comes with the file; cards with their own style keep it', async ({ app: { page } }) => {
    await buildBatch(page);
    await page.click('#cardList [data-card="0"]');
    await setRange(page, 'size', 140);
    const { text } = await saveBatch(page);
    await page.click('#cardsNew');
    await confirmDialog(page);
    await setRange(page, 'size', 90); // this computer's own look
    await openFile(page, text);
    await settle(page);
    expect(await page.evaluate(() => __tt.sharedStyle.size)).toBe(140);
    await page.click('#cardList [data-card="2"]');
    expect(await page.evaluate(() => __tt.S.size)).toBe(140);
    await page.click('#cardList [data-card="1"]');
    expect(await page.evaluate(() => __tt.S.size)).toBe(60);
  });

  test('Open replaces the current cards', async ({ app: { page } }) => {
    await openFile(page, { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'From file' }] });
    await settle(page);
    expect(await page.evaluate(() => ({ n: __tt.cards.length, text: __tt.S.text }))).toEqual({ n: 1, text: 'From file' });
  });
});

test.describe('confirmations', () => {
  const file = { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'From file' }] };

  test('New batch asks first, naming the card count; Cancel and Esc keep everything', async ({ app: { page } }) => {
    await buildBatch(page);
    const before = await snapshot(page);
    await page.click('#cardsNew');
    await expect(page.locator('#cTitle')).toHaveText('Start a new batch?');
    await expect(page.locator('#cMsg')).toContainText('all 3 cards');
    await expect(page.locator('#cMsg')).toContainText('Save batch to file');
    await confirmDialog(page, false);
    expect(await snapshot(page)).toEqual(before);
    await page.click('#cardsNew');
    await page.keyboard.press('Escape');
    await expect(page.locator('#confirmDlg')).not.toBeVisible();
    expect(await snapshot(page)).toEqual(before);
    await page.click('#cardsNew');
    await confirmDialog(page);
    expect((await snapshot(page)).cards).toHaveLength(1);
  });

  test('the answer is applied the moment the button is clicked, not a task later', async ({ app: { page } }) => {
    // The dialog's close event fires in a later task, so an app that waits for it leaves the old cards in place for a
    // moment after the dialog has gone. Clicking from inside the page and checking after a few microtasks (no task
    // boundary) proves the buttons answer directly.
    await buildBatch(page);
    await page.click('#cardsNew');
    await page.waitForSelector('#confirmDlg[open]');
    const n = await page.evaluate(async () => {
      document.querySelector('#cOk').click();
      for (let i = 0; i < 5; i++) await null;
      return __tt.cards.length;
    });
    expect(n).toBe(1);
  });

  test('Open asks first when the page holds cards; Cancel keeps them and says so', async ({ app: { page } }) => {
    await buildBatch(page);
    const before = await snapshot(page);
    await openFile(page, file, 'mine.json');
    await expect(page.locator('#cTitle')).toHaveText('Open this batch?');
    await expect(page.locator('#cMsg')).toContainText('“mine.json” replaces your 3 current cards');
    await confirmDialog(page, false);
    await expect(page.locator('#fileMsg')).toContainText('Cancelled');
    expect(await snapshot(page)).toEqual(before);
    await openFile(page, file);
    await confirmDialog(page);
    expect(await page.evaluate(() => ({ n: __tt.cards.length, text: __tt.S.text }))).toEqual({ n: 1, text: 'From file' });
  });

  test('a file that is not a batch is refused without asking', async ({ app: { page } }) => {
    await buildBatch(page);
    await openFile(page, 'not json');
    await expect(page.locator('#fileMsg')).toHaveClass(/bad/);
    await expect(page.locator('#confirmDlg')).not.toBeVisible();
  });

  test('nothing is asked when there is nothing to lose: a fresh page, or an emptied card', async ({ app: { page } }) => {
    await page.click('#cardsNew'); // the untouched placeholder card is not work
    await expect(page.locator('#confirmDlg')).not.toBeVisible();
    await openFile(page, file);
    await expect(page.locator('#confirmDlg')).not.toBeVisible();
    await expect(page.locator('#fileMsg')).toContainText('Opened 1 card');
    await setText(page, '');
    await page.click('#cardsNew');
    await expect(page.locator('#confirmDlg')).not.toBeVisible();
  });

  test('a batch whose first card is empty still counts as work when another card has text', async ({ app: { page } }) => {
    await setText(page, '');
    await addCard(page, 'Only the second card has text');
    await page.click('#cardList [data-card="0"]');
    await settle(page);
    await page.click('#cardsNew');
    await expect(page.locator('#cMsg')).toContainText('all 2 cards');
    await confirmDialog(page, false);
  });

  test('coloring the untouched placeholder text counts as work', async ({ app: { page } }) => {
    await setSelection(page, 0, 4);
    await page.click('#swatches .sw:nth-child(3)');
    await page.click('#cardsNew');
    await confirmDialog(page, false);
    await page.click('#swatches .sw:nth-child(1)'); // repainting it is still formatting, so it still asks
    await page.click('#cardsNew');
    await confirmDialog(page, false);
  });

  test('typed text, a color, or an own style each count as work', async ({ app: { page } }) => {
    await setText(page, 'Something');
    await page.click('#cardsNew');
    await confirmDialog(page, false);
    await setText(page, '');
    await page.check('#cardOwn'); // an emptied card that still has its own style
    await page.click('#cardsNew');
    await confirmDialog(page, false);
  });
});

test.describe('nothing about the cards is stored in the browser', () => {
  test('no key holds card text, and a reload starts fresh', async ({ app: { page } }) => {
    await buildBatch(page);
    await page.click('#batchOpen');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(700); // longer than any autosave delay would be
    const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
    for (const [k, v] of Object.entries(stored)) {
      expect(`${k}=${v}`, k).not.toMatch(/Alpha beta|Second card|Third/);
      expect(k).not.toBe('opentitlecard.cards');
    }
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect(await page.evaluate(() => ({ n: __tt.cards.length, text: __tt.S.text }))).toEqual({ n: 1, text: 'Type your Titlecard here! 😳' });
  });

  test('New batch only clears the cards on screen', async ({ app: { page } }) => {
    await buildBatch(page);
    await page.click('#cardsNew');
    await confirmDialog(page);
    await settle(page);
    expect(await page.evaluate(() => ({ n: __tt.cards.length, text: __tt.S.text, own: !!__tt.cards[0].style }))).toEqual({ n: 1, text: '', own: false });
  });
});

test.describe('opening files that are not ours', () => {
  const good = { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'Keep me' }] };

  test('unusable files are refused with a message and change nothing', async ({ app: { page } }) => {
    await setText(page, 'Original');
    const bad = [
      'not json at all', '', 'null', '42', '[]',
      { v: 1, cards: [{ t: 'x' }] },                                              // no app marker
      { ...good, app: 'something-else' },
      { ...good, type: 'preset' },
      { ...good, v: 2 },
      { ...good, cards: [] },
      { ...good, cards: 'nope' },
    ];
    for (const b of bad) {
      await openFile(page, b);
      await expect(page.locator('#fileMsg'), JSON.stringify(b)).toContainText('isn\'t an OpenTitlecard batch');
      await expect(page.locator('#fileMsg')).toHaveClass(/bad/);
      expect(await page.evaluate(() => __tt.S.text), JSON.stringify(b)).toBe('Original');
    }
    await openFile(page, good); // control: a good file does open (after confirming, as 'Original' would be replaced)
    await confirmDialog(page);
    await expect(page.locator('#fileMsg')).toContainText('Opened 1 card from');
    expect(await page.evaluate(() => __tt.S.text)).toBe('Keep me');
  });

  test('a preset file is not mistaken for a batch', async ({ app: { page } }) => {
    await setText(page, 'Original');
    await openFile(page, { size: 123, align: 'left' });
    await expect(page.locator('#fileMsg')).toHaveClass(/bad/);
    expect(await page.evaluate(() => __tt.S.size)).toBe(100);
  });

  test('a file over the size limit is refused', async ({ app: { page } }) => {
    await setText(page, 'Original');
    await openFile(page, JSON.stringify({ ...good, pad: 'x'.repeat(5.1e6) }));
    await expect(page.locator('#fileMsg')).toHaveClass(/bad/);
    expect(await page.evaluate(() => __tt.S.text)).toBe('Original');
  });

  test('damaged fields are dropped; the good ones are kept', async ({ app: { page } }) => {
    const data = {
      ...good, active: 99, style: { size: 'huge', weight: 800, bogus: 1 },
      cards: [
        { t: 'Hello', c: { 0: '#abc', 1: 'red', 2: '#12345g', 99: '#ffffff', '-1': '#000000', x: '#000000', 3: 7 }, i: [0, 1.5, 99, -2, 'a'], n: [{ x: 5, y: 6 }, { x: 'a', y: 1 }, null, { x: 1e99, y: 1 }], s: { size: 'huge', weight: 800, family: 7, textColor: '#ff0000', bogus: 1 } },
        { t: 5 },
        'not a card',
        null,
      ],
    };
    await openFile(page, data);
    await settle(page);
    const r = await page.evaluate(() => {
      const c0 = __tt.cards[0];
      return {
        n: __tt.cards.length, active: __tt.active, shared: { size: __tt.sharedStyle.size, weight: __tt.sharedStyle.weight, bogus: 'bogus' in __tt.sharedStyle },
        colors: c0.colors, ital: c0.ital, nudges: c0.nudges,
        style: { size: c0.style.size, weight: c0.style.weight, family: c0.style.family, textColor: c0.style.textColor, bogus: 'bogus' in c0.style },
        texts: __tt.cards.map((c, i) => (i === __tt.active ? __tt.S.text : c.text)),
      };
    });
    expect(r.n).toBe(4);
    expect(r.active).toBe(3); // out-of-range index is clamped
    expect(r.shared).toEqual({ size: 100, weight: 800, bogus: false });
    expect(r.colors).toEqual(['#abc', null, null, null, null]);
    expect(r.ital).toEqual([1, 0, 0, 0, 0]);
    expect(r.nudges).toEqual([{ x: 5, y: 6 }, null, null, { x: 5000, y: 1 }]);
    expect(r.style).toEqual({ size: 100, weight: 800, family: FONT_FAMILY, textColor: '#ff0000', bogus: false });
    expect(r.texts).toEqual(['Hello', '', '', '']);
  });

  test('very long text and huge batches are capped', async ({ app: { page } }) => {
    const cards = Array.from({ length: 600 }, (_, i) => ({ t: i === 0 ? 'x'.repeat(5000) : 'c' + i }));
    await openFile(page, { ...good, cards });
    await settle(page);
    expect(await page.evaluate(() => __tt.cards.length)).toBe(500);
    expect(await page.evaluate(() => __tt.S.text.length)).toBe(2000);
    await expect(page.locator('#fileMsg')).toContainText('Opened 500 cards');
  });

  test('a font name in a file is shown as text, never run as HTML', async ({ app: { page } }) => {
    const family = '<img src=x onerror="window.__ran=1">';
    await openFile(page, { ...good, style: { family } });
    await expect(page.locator('#fileMsg')).toContainText('Opened 1 card');
    await settle(page);
    await expect(page.locator('#banner')).toBeVisible();
    await expect(page.locator('#banner b')).toHaveText(`“${family}” isn't installed on this computer`);
    expect(await page.locator('#banner img').count()).toBe(0);
    expect(await page.evaluate(() => window.__ran)).toBeUndefined();
  });
});
