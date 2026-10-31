const { test, expect, APP_URL, expandUi, confirmDialog, makePng: png } = require('./helpers');

// The emoji library: the user's own images, kept in the browser. The app bundles none, so every image here is made by
// the test: a tiny PNG encoder (no binary fixtures in the repo).
// a red disc-ish square in the middle of a transparent field: 40×40 canvas, art from (10,10) to (29,29)
const padded = () => png(40, 40, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? [220, 30, 30, 255] : [0, 0, 0, 0]));
const solid = (w = 16, h = 16) => png(w, h, () => [30, 120, 220, 255]);
const file = (name, buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32"><rect width="64" height="32" fill="#2a2"/></svg>');

async function add(page, files) {
  await page.setInputFiles('#emFile', files);
  await page.evaluate(() => __tt.emoji.idle);   // the adds run one after another; wait for the last
}
const lib = (page) => page.evaluate(() => __tt.emoji.library);
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await page.evaluate(() => __tt.emoji.ready);
  await expandUi(page);
}

test.describe('emoji library', () => {
  test('the panel is minimized on a first visit, starts empty, and ships no emoji', async ({ app: { page } }) => {
    expect(await lib(page)).toEqual([]);
    await expect(page.locator('#emUsage')).toHaveText('No emoji yet');
    await expect(page.locator('#emClear')).toBeDisabled();
    await expect(page.locator('#fp_emoji')).toContainText('Use only images you have the right to use');
    expect(await page.locator('#emGrid img').count()).toBe(0);
  });

  test('Choose files adds PNG, WebP-by-extension and SVG images, downscaled and with their names', async ({ app: { page } }) => {
    await add(page, [file('Grin.png', solid(1024, 512)), file('flag.svg', SVG, 'image/svg+xml')]);
    const l = await lib(page);
    expect(l.map((e) => e.name)).toEqual(['Grin', 'flag']);
    expect(l[0]).toMatchObject({ w: 512, h: 256 });          // long side capped, shape kept
    expect(l[1]).toMatchObject({ w: 512, h: 256 });          // an SVG is drawn at the cap
    await expect(page.locator('#emGrid .emitem')).toHaveCount(2);
    await expect(page.locator('#emMsg')).toHaveText('Added 2 emoji.');
    await expect(page.locator('#emUsage')).toContainText('2 emoji');
    // small images are never enlarged
    await add(page, [file('tiny.png', solid(8, 8))]);
    expect((await lib(page)).find((e) => e.name === 'tiny')).toMatchObject({ w: 8, h: 8 });
  });

  test('transparent edges are trimmed by default, and kept when the box is unticked', async ({ app: { page } }) => {
    await add(page, [file('padded.png', padded())]);
    expect((await lib(page))[0]).toMatchObject({ w: 20, h: 20 });
    await page.uncheck('#emTrim');
    await add(page, [file('padded.png', padded())]);
    const l = await lib(page);
    expect(l[1]).toMatchObject({ name: 'padded 2', w: 40, h: 40 });   // the same name gets a number: a card refers to an emoji by name
  });

  test('wrong types, unreadable files, empty images and oversized files are refused with a reason; the rest still go in', async ({ app: { page } }) => {
    const empty = png(10, 10, () => [0, 0, 0, 0]);
    await add(page, [
      file('notes.txt', Buffer.from('hello'), 'text/plain'),
      file('anim.gif', Buffer.from('GIF89a'), 'image/gif'),
      file('broken.png', Buffer.from('not really a png')),
      file('ghost.png', empty),
      file('huge.png', Buffer.alloc(5e6 + 10, 1)),
      file('ok.png', solid()),
    ]);
    expect((await lib(page)).map((e) => e.name)).toEqual(['ok']);
    const msg = await page.locator('#emMsg').textContent();
    expect(msg).toContain('Added 1 emoji.');
    expect(msg).toContain('notes.txt is not a PNG, WebP or SVG image');
    expect(msg).toContain('And 2 more');
    await add(page, [file('ghost.png', empty)]);
    await expect(page.locator('#emMsg')).toHaveText('Nothing added. ghost.png is fully transparent.');
    await expect(page.locator('#emMsg')).toHaveClass(/bad/);
    await add(page, [file('huge.png', Buffer.alloc(5e6 + 10, 1))]);
    await expect(page.locator('#emMsg')).toContainText('huge.png is over 5 MB');
  });

  test('dropping files on the panel adds them, even while it is minimized; a drop elsewhere still only opens sets', async ({ app: { page } }) => {
    await page.click('#fph_emoji');                       // minimize it again
    await expect(page.locator('#fp_emoji')).toHaveClass(/min/);
    await page.evaluate(async (b) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(b)], 'dropped.png', { type: 'image/png' }));
      document.querySelector('#fp_emoji').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, [...solid()]);
    await page.waitForFunction(() => __tt.emoji.library.length === 1);
    await expect(page.locator('#fp_emoji')).not.toHaveClass(/min/);   // it opens to show what arrived
    expect((await lib(page))[0].name).toBe('dropped');
    // elsewhere on the page an image is still not a set
    await page.evaluate((b) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(b)], 'other.png', { type: 'image/png' }));
      document.querySelector('#text').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, [...solid()]);
    await expect(page.locator('#fileMsg')).toContainText('emoji images go on the Emoji panel');
    expect((await lib(page)).length).toBe(1);
  });

  test('an image pasted from the clipboard is added', async ({ app: { page } }) => {
    await page.evaluate((b) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(b)], 'image.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, [...solid()]);
    await page.waitForFunction(() => __tt.emoji.library.length === 1);
    expect((await lib(page))[0].name).toBe('image');
  });

  test('the library is still there after a reload, with its names and sizes', async ({ app: { page } }) => {
    await add(page, [file('one.png', solid(30, 20)), file('two.png', solid(10, 10))]);
    const before = await lib(page);
    await reload(page);
    expect(await lib(page)).toEqual(before.map((e) => ({ ...e })));
    await expect(page.locator('#emGrid .emitem')).toHaveCount(2);
    expect(await page.locator('#emGrid img').evaluateAll((im) => im.every((i) => i.complete && i.naturalWidth > 0))).toBe(true);
  });

  test('search filters by name; rename (double-click or F2) keeps names unique; delete removes one', async ({ app: { page } }) => {
    await add(page, [file('smile.png', solid()), file('heart.png', solid()), file('heart-eyes.png', solid())]);
    await page.fill('#emSearch', 'HEART');
    await expect(page.locator('#emGrid .emitem')).toHaveCount(2);
    await page.fill('#emSearch', 'zzz');
    await expect(page.locator('#emGrid')).toContainText('No emoji match.');
    await page.fill('#emSearch', '');
    // rename by double-click
    await page.locator('.emitem', { hasText: 'smile' }).dblclick();
    await page.keyboard.press('Control+A'); await page.keyboard.type('Grin'); await page.keyboard.press('Enter');
    await expect.poll(async () => (await lib(page)).map((e) => e.name)).toEqual(['Grin', 'heart', 'heart-eyes']);
    // a taken name (any case) is numbered, not duplicated; Esc cancels
    await page.locator('.emitem', { hasText: 'Grin' }).locator('.emthumb').focus();
    await page.keyboard.press('F2'); await page.keyboard.press('Control+A'); await page.keyboard.type('HEART'); await page.keyboard.press('Enter');
    await expect.poll(async () => (await lib(page)).map((e) => e.name)).toEqual(['HEART 2', 'heart', 'heart-eyes']);
    await page.locator('.emitem', { hasText: 'heart-eyes' }).locator('.emthumb').focus();
    await page.keyboard.press('F2'); await page.keyboard.type('nope'); await page.keyboard.press('Escape');
    await expect(page.locator('#emGrid .emitem input')).toHaveCount(0);
    expect((await lib(page))[2].name).toBe('heart-eyes');
    // the new names are kept
    await reload(page);
    expect((await lib(page)).map((e) => e.name)).toEqual(['HEART 2', 'heart', 'heart-eyes']);
    // delete with the × and with the Delete key
    await page.locator('.emitem', { hasText: 'heart-eyes' }).hover();
    await page.locator('.emitem', { hasText: 'heart-eyes' }).locator('.emdel').click();
    await confirmDialog(page, true);
    await expect.poll(async () => (await lib(page)).map((e) => e.name)).toEqual(['HEART 2', 'heart']);
    await page.locator('.emitem', { hasText: 'HEART 2' }).locator('.emthumb').focus();
    await page.keyboard.press('Delete');
    await confirmDialog(page, true);
    await expect.poll(async () => (await lib(page)).map((e) => e.name)).toEqual(['heart']);
    await reload(page);
    expect((await lib(page)).map((e) => e.name)).toEqual(['heart']);
  });

  test('deleting one image asks first (the × and the Delete key alike), and Cancel or Esc keep it', async ({ app: { page } }) => {
    await add(page, [file('keep.png', solid()), file('other.png', solid())]);
    const item = page.locator('.emitem', { hasText: 'keep' });
    await item.hover(); await item.locator('.emdel').click();
    await expect(page.locator('#cTitle')).toHaveText('Delete “keep”?');
    await expect(page.locator('#cMsg')).toContainText('add the file again');
    await confirmDialog(page, false);
    expect((await lib(page)).map((e) => e.name)).toEqual(['keep', 'other']);          // Cancel: still there
    await item.locator('.emthumb').focus(); await page.keyboard.press('Delete');
    await expect(page.locator('#confirmDlg')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#confirmDlg')).toBeHidden();
    expect((await lib(page)).map((e) => e.name)).toEqual(['keep', 'other']);          // Esc: still there
    await item.hover(); await item.locator('.emdel').click(); await confirmDialog(page, true);
    await expect.poll(async () => (await lib(page)).map((e) => e.name)).toEqual(['other']);
  });

  test('Clear library asks first, and Cancel keeps everything', async ({ app: { page } }) => {
    await add(page, [file('a.png', solid()), file('b.png', solid())]);
    await page.click('#emClear'); await confirmDialog(page, false);
    expect((await lib(page)).length).toBe(2);
    await page.click('#emClear'); await confirmDialog(page, true);
    await expect(page.locator('#emUsage')).toHaveText('No emoji yet');
    expect(await lib(page)).toEqual([]);
    await reload(page);
    expect(await lib(page)).toEqual([]);
  });

  test('the library has a cap on items and on total size, and says so', async ({ app: { page } }) => {
    // fill it with fake records straight in the store (200 items), then try one more
    await page.evaluate(async () => {
      const blob = new Blob([new Uint8Array(10)], { type: 'image/png' });
      await new Promise((res, rej) => {
        const o = indexedDB.open('opentitlecard-emoji', 1);
        o.onupgradeneeded = () => o.result.createObjectStore('emoji', { keyPath: 'id' });
        o.onsuccess = () => { const tx = o.result.transaction('emoji', 'readwrite'); for (let i = 0; i < 200; i++) tx.objectStore('emoji').put({ id: 'f' + i, name: 'fill ' + i, w: 1, h: 1, bytes: 10, added: i, blob }); tx.oncomplete = () => { o.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
      });
    });
    await reload(page);
    expect((await lib(page)).length).toBe(200);
    await add(page, [file('one more.png', solid())]);
    await expect(page.locator('#emMsg')).toContainText('The library is full (200 emoji)');
    expect((await lib(page)).length).toBe(200);
  });

  test('the total size is capped too: a library at 50 MB takes nothing more', async ({ app: { page } }) => {
    await page.evaluate(async () => {
      await new Promise((res, rej) => {
        const o = indexedDB.open('opentitlecard-emoji', 1);
        o.onupgradeneeded = () => o.result.createObjectStore('emoji', { keyPath: 'id' });
        o.onsuccess = () => {
          const tx = o.result.transaction('emoji', 'readwrite');
          for (let i = 0; i < 10; i++) tx.objectStore('emoji').put({ id: 'big' + i, name: 'big ' + i, w: 1, h: 1, added: i, blob: new Blob([new Uint8Array(5e6)], { type: 'image/png' }) });
          tx.oncomplete = () => { o.result.close(); res(); }; tx.onerror = () => rej(tx.error);
        };
      });
    });
    await reload(page);
    await expect(page.locator('#emUsage')).toHaveText('10 emoji · 50.0 MB of 50.0 MB');
    await add(page, [file('one more.png', solid())]);
    await expect(page.locator('#emMsg')).toContainText('The library is full (50.0 MB)');
    expect((await lib(page)).length).toBe(10);
  });

  test('a damaged stored entry is skipped, not fatal', async ({ app: { page } }) => {
    await add(page, [file('good.png', solid())]);
    await page.evaluate(() => new Promise((res, rej) => {
      const o = indexedDB.open('opentitlecard-emoji', 1);
      o.onsuccess = () => { const tx = o.result.transaction('emoji', 'readwrite'); tx.objectStore('emoji').put({ id: 'bad1', name: 'no blob', w: 5, h: 5 }); tx.objectStore('emoji').put({ id: 'bad2', name: 'bad size', w: -1, h: 5, blob: new Blob(['x']) }); tx.oncomplete = () => { o.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
    }));
    await reload(page);
    expect((await lib(page)).map((e) => e.name)).toEqual(['good']);
  });

  test('Reset all clears the library; Soft reset keeps it', async ({ app: { page } }) => {
    await add(page, [file('keep.png', solid())]);
    await page.click('#fileMenuBtn'); await page.click('#softReset'); await confirmDialog(page, true);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await page.evaluate(() => __tt.emoji.ready);
    expect((await lib(page)).length).toBe(1);
    await expandUi(page);
    await page.click('#fileMenuBtn'); await page.click('#resetAll'); await confirmDialog(page, true);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await page.evaluate(() => __tt.emoji.ready);
    expect(await lib(page)).toEqual([]);
  });

  test('without IndexedDB the app still works and says the emoji could not be kept', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } }); });
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expandUi(page);
    await add(page, [file('x.png', solid())]);
    await expect(page.locator('#emMsg')).toContainText("x.png wasn't saved");
    expect(await lib(page)).toEqual([]);
    await context.close();
  });
});
