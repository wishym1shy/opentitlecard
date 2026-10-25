const { test, expect, setText, settle, setSelection, exportPng, readZip, crc32, pngSize, downloadZip, addCard } = require('./helpers');

test.describe('cards', () => {
  test('each card keeps its own text, word colors, italic and line nudges', async ({ app: { page } }) => {
    await setText(page, 'Alpha beta');
    await setSelection(page, 0, 5);
    await page.click('#swatches .sw:nth-child(3)'); // Red
    await page.click('#ital');
    await page.fill('[data-i="0"][data-a="x"]', '12');
    await settle(page);
    await addCard(page, 'Second');
    const second = await page.evaluate(() => ({ text: __tt.S.text, color: __tt.S.colors[0], ital: __tt.S.ital[0], nudge: __tt.S.nudges[0] }));
    expect(second).toEqual({ text: 'Second', color: null, ital: 0, nudge: { x: 0, y: 0 } });

    await page.click('#cardList [data-card="0"]');
    await settle(page);
    const first = await page.evaluate(() => ({ text: __tt.S.text, color: __tt.S.colors[0], ital: __tt.S.ital[0], nudge: __tt.S.nudges[0].x, active: __tt.active }));
    expect(first).toEqual({ text: 'Alpha beta', color: '#ff2d2d', ital: 1, nudge: 12, active: 0 });
    await expect(page.locator('#text')).toHaveValue('Alpha beta');
    await expect(page.locator('[data-i="0"][data-a="x"]')).toHaveValue('12');

    // and the card we left behind (never stashed by an add) is still there when we come back
    await page.fill('#text', 'Alpha beta edited');
    await page.click('#cardList [data-card="1"]');
    await expect(page.locator('#text')).toHaveValue('Second');
    await page.click('#cardList [data-card="0"]');
    await expect(page.locator('#text')).toHaveValue('Alpha beta edited');
    expect(await page.evaluate(() => __tt.S.colors[0])).toBe('#ff2d2d');
  });

  test('the list shows each card and follows what you type', async ({ app: { page } }) => {
    await setText(page, 'First card');
    await addCard(page, 'Second card');
    const items = page.locator('#cardList [data-card]');
    await expect(items).toHaveCount(2);
    await expect(items.nth(1)).toContainText('Second card');
    await expect(items.nth(1)).toHaveAttribute('aria-current', 'true');
    await page.fill('#text', 'Renamed');
    await settle(page);
    await expect(items.nth(1)).toContainText('Renamed');
    await expect(items.nth(0)).not.toHaveAttribute('aria-current', 'true');
  });

  test('duplicate copies colors; move reorders; delete removes; the last card is cleared instead', async ({ app: { page } }) => {
    await setText(page, 'Alpha beta');
    await setSelection(page, 0, 5);
    await page.click('#swatches .sw:nth-child(3)');
    await page.click('#cardDup');
    await settle(page);
    let st = await page.evaluate(() => ({ n: __tt.cards.length, active: __tt.active, text: __tt.S.text, color: __tt.S.colors[0] }));
    expect(st).toEqual({ n: 2, active: 1, text: 'Alpha beta', color: '#ff2d2d' });

    await page.fill('#text', 'Copy');
    await page.click('#cardUp');
    await settle(page);
    st = await page.evaluate(() => ({ active: __tt.active, order: __tt.cards.map((c, i) => (i === __tt.active ? __tt.S.text : c.text)) }));
    expect(st).toEqual({ active: 0, order: ['Copy', 'Alpha beta'] });
    await expect(page.locator('#cardUp')).toBeDisabled();

    await page.click('#cardDel');
    await settle(page);
    st = await page.evaluate(() => ({ n: __tt.cards.length, text: __tt.S.text }));
    expect(st).toEqual({ n: 1, text: 'Alpha beta' });

    await expect(page.locator('#cardDel')).toHaveAttribute('aria-label', 'Clear card');
    await page.click('#cardDel');
    await settle(page);
    st = await page.evaluate(() => ({ n: __tt.cards.length, text: __tt.S.text, lines: __tt.L.lines.length }));
    expect(st).toEqual({ n: 1, text: '', lines: 0 });
  });

  test('"Add from list" makes one card per line, or per blank-line block, and replaces a lone empty card', async ({ app: { page } }) => {
    await setText(page, '');
    await page.click('#listToggle');
    await page.fill('#listText', 'One\nTwo words\n\nThree');
    await page.click('#listAdd');
    await settle(page);
    let st = await page.evaluate(() => __tt.cards.map((c, i) => (i === __tt.active ? __tt.S.text : c.text)));
    expect(st).toEqual(['One', 'Two words', 'Three']);
    await expect(page.locator('#listBox')).toBeHidden(); // the paste box tidies itself away after use

    await page.click('#listToggle'); // reopen it
    await page.selectOption('#listMode', 'block');
    await page.fill('#listText', 'Line a\nLine b\n\nLine c');
    await page.click('#listAdd');
    await settle(page);
    st = await page.evaluate(() => ({ texts: __tt.cards.map((c, i) => (i === __tt.active ? __tt.S.text : c.text)), active: __tt.active }));
    expect(st.texts).toEqual(['One', 'Two words', 'Three', 'Line a\nLine b', 'Line c']);
    expect(st.active).toBe(3);
  });
});

test.describe('batch file names', () => {
  test('{n} is replaced; start number and digits are applied', async ({ app: { page } }) => {
    const r = await page.evaluate(() => ({
      a: __tt.batchNames('ClientA-Vid{n}-TC', 1, 1, 3),
      b: __tt.batchNames('ClientA-Vid{n}_titlecard', 4, 1, 2),
      c: __tt.batchNames('tc-{n}', 8, 3, 3),
    }));
    expect(r.a).toEqual(['ClientA-Vid1-TC.png', 'ClientA-Vid2-TC.png', 'ClientA-Vid3-TC.png']);
    expect(r.b).toEqual(['ClientA-Vid4_titlecard.png', 'ClientA-Vid5_titlecard.png']);
    expect(r.c).toEqual(['tc-008.png', 'tc-009.png', 'tc-010.png']);
  });

  test('a pattern without {n} still gives unique names; unsafe characters and blanks are cleaned up', async ({ app: { page } }) => {
    const r = await page.evaluate(() => ({
      noToken: __tt.batchNames('Intro', 1, 1, 2),
      unsafe: __tt.batchNames('a/b:c*{n}?', 1, 1, 1),
      blank: __tt.batchNames('   ', 1, 1, 1),
      bad: __tt.batchNames('x{n}', -5, 99, 1),
      stem: [__tt.zipStem('ClientA-Vid{n}-TC'), __tt.zipStem('ClientA-Vid{n}_titlecard'), __tt.zipStem('{n}'), __tt.zipStem('tc {n}')],
    }));
    expect(r.noToken).toEqual(['Intro-1.png', 'Intro-2.png']);
    expect(r.unsafe).toEqual(['a-b-c-1-.png']);
    expect(r.blank).toEqual(['titlecard-1.png']);
    expect(r.bad).toEqual(['x000000.png']);
    expect(r.stem).toEqual(['ClientA-Vid-TC', 'ClientA-Vid_titlecard', 'titlecards', 'tc']);
  });

  test('names never collide, even when a very long pattern gets cut short and loses its number', async ({ app: { page } }) => {
    const names = await page.evaluate(() => __tt.batchNames('x'.repeat(130) + '{n}', 1, 1, 12));
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(12);
    expect(names[1]).toBe('x'.repeat(120) + '-2.png');
  });
});

test.describe('ZIP writer', () => {
  test('CRC-32 matches the standard check value', async ({ app: { page } }) => {
    const crc = await page.evaluate(() => __tt.crc32(new TextEncoder().encode('123456789')));
    expect(crc).toBe(0xCBF43926);
  });

  test('builds a valid archive: names (UTF-8), sizes and checksums', async ({ app: { page } }) => {
    const b64 = await page.evaluate(async () => {
      const enc = new TextEncoder();
      const blob = __tt.buildZip([
        { name: 'one.png', data: enc.encode('hello') },
        { name: 'ünï-2.png', data: new Uint8Array([0, 1, 2, 3, 255]) },
        { name: 'empty.png', data: new Uint8Array(0) },
      ]);
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (const b of u8) s += String.fromCharCode(b);
      return btoa(s);
    });
    const files = readZip(Buffer.from(b64, 'base64'));
    expect(files.map((f) => f.name)).toEqual(['one.png', 'ünï-2.png', 'empty.png']);
    for (const f of files) {
      expect(f.method).toBe(0);
      expect(f.size).toBe(f.usize);
      expect(f.crc).toBe(crc32(f.data));
    }
    expect(files[0].data.toString()).toBe('hello');
    expect([...files[1].data]).toEqual([0, 1, 2, 3, 255]);
  });
});

test.describe('batch export dialog', () => {
  async function threeCards(page) {
    await setText(page, 'Hi');
    await addCard(page, 'A much longer second card');
    await setSelection(page, 0, 1);
    await page.click('#swatches .sw:nth-child(3)'); // Red "A": must survive into the ZIP
    await addCard(page, 'Mid length');
  }

  test('opens as a dialog with a thumbnail and a live file name for every card', async ({ app: { page } }) => {
    await threeCards(page);
    await page.click('#batchOpen');
    await expect(page.locator('#batchDlg')).toBeVisible();
    await expect(page.locator('#bGrid .bitem')).toHaveCount(3);
    await expect(page.locator('#bGrid canvas')).toHaveCount(3);
    await expect(page.locator('#bGrid .fn')).toHaveText(['titlecard-1.png', 'titlecard-2.png', 'titlecard-3.png']);
    await page.fill('#bPattern', 'ClientA-Vid{n}-TC');
    await page.fill('#bStart', '4');
    await expect(page.locator('#bGrid .fn')).toHaveText(['ClientA-Vid4-TC.png', 'ClientA-Vid5-TC.png', 'ClientA-Vid6-TC.png']);
    await expect(page.locator('#bGo')).toHaveText('Download ZIP (3 PNGs)');
    await page.keyboard.press('Escape');
    await expect(page.locator('#batchDlg')).not.toBeVisible();
  });

  test('the ZIP holds one correctly named, full-size PNG per card, identical to a single-card export', async ({ app: { page } }) => {
    await threeCards(page);
    await page.click('#batchOpenExport');
    await page.fill('#bPattern', 'ClientA-Vid{n}_titlecard');
    const { buffer, filename } = await downloadZip(page);
    expect(filename).toBe('ClientA-Vid_titlecard.zip');
    await expect(page.locator('#batchDlg')).not.toBeVisible();

    const files = readZip(buffer);
    expect(files.map((f) => f.name)).toEqual(['ClientA-Vid1_titlecard.png', 'ClientA-Vid2_titlecard.png', 'ClientA-Vid3_titlecard.png']);
    for (const f of files) {
      expect(f.crc).toBe(crc32(f.data));
      expect(f.data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(pngSize(f.data)).toEqual([1920, 1080]);
    }
    // each PNG is exactly what "Download PNG" gives for that card: text, per-word color and size all carry over
    for (let i = 0; i < 3; i++) {
      await page.click(`#cardList [data-card="${i}"]`);
      await settle(page);
      const single = await exportPng(page);
      expect(files[i].data.equals(single.buffer), `card ${i + 1} matches its single export`).toBe(true);
    }
    expect(files[0].data.equals(files[1].data)).toBe(false);
  });

  test('exporting leaves the card you were editing untouched', async ({ app: { page } }) => {
    await threeCards(page);
    await page.click('#cardList [data-card="1"]');
    await settle(page);
    const before = await page.evaluate(() => ({ text: __tt.S.text, colors: __tt.S.colors.slice(), active: __tt.active, n: __tt.cards.length }));
    await page.click('#batchOpen');
    await downloadZip(page);
    const after = await page.evaluate(() => ({ text: __tt.S.text, colors: __tt.S.colors.slice(), active: __tt.active, n: __tt.cards.length }));
    expect(after).toEqual(before);
    await expect(page.locator('#text')).toHaveValue('A much longer second card');
    expect((await settle(page)).lines).toHaveLength(1);
  });

  test('empty cards are skipped and do not use up a number', async ({ app: { page } }) => {
    await setText(page, 'Only real one');
    await page.click('#cardAdd'); // left empty
    await addCard(page, 'Another');
    await page.click('#batchOpen');
    await expect(page.locator('#bGrid .bitem.skip')).toHaveCount(1);
    await expect(page.locator('#bGrid .fn')).toHaveText(['titlecard-1.png', 'Empty, skipped', 'titlecard-2.png']);
    const { buffer } = await downloadZip(page);
    expect(readZip(buffer).map((f) => f.name)).toEqual(['titlecard-1.png', 'titlecard-2.png']);
  });

  test('with only empty cards there is nothing to download', async ({ app: { page } }) => {
    await setText(page, '');
    await page.click('#batchOpen');
    await expect(page.locator('#bGo')).toBeDisabled();
    await expect(page.locator('#bGo')).toHaveText('Nothing to export');
  });

  test('tight crop gives every card its own size', async ({ app: { page } }) => {
    await threeCards(page);
    await page.check('#tight');
    await settle(page);
    await page.click('#batchOpen');
    const { buffer } = await downloadZip(page);
    const sizes = readZip(buffer).map((f) => pngSize(f.data));
    expect(sizes[1][0]).toBeGreaterThan(sizes[0][0]);
    expect(sizes[0][0]).toBeLessThan(1920);
  });

  test('warns when the font is not available', async ({ app: { page } }) => {
    await page.fill('#family', 'Definitely Not A Real Font');
    await page.click('#batchOpen');
    await expect(page.locator('#bFont')).toBeVisible();
    await expect(page.locator('#bFont')).toContainText('Definitely Not A Real Font');
  });

  test('the naming settings are remembered across reloads', async ({ app: { page } }) => {
    await page.click('#batchOpen');
    await page.fill('#bPattern', 'ClientA-Vid{n}-TC');
    await page.fill('#bStart', '7');
    await page.fill('#bDigits', '2');
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await page.click('#batchOpen');
    await expect(page.locator('#bPattern')).toHaveValue('ClientA-Vid{n}-TC');
    await expect(page.locator('#bStart')).toHaveValue('7');
    await expect(page.locator('#bDigits')).toHaveValue('2');
  });
});
