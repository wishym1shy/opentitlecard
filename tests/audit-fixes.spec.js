const zlib = require('zlib');
const { test, expect, setText, settle, fileMenu } = require('./helpers');

// Regressions from a code audit of index.html: a corrupt WOFF font, an oversized emoji image, back-to-back confirmation
// dialogs, and a handful of small slips (dialogs, escaping, file names, a split surrogate pair).

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
/** A WOFF holding one 'name' table whose compressed bytes are `data` and whose declared size is `orig`. */
function woffWith(data, orig) {
  const head = Buffer.alloc(44); head.write('wOFF', 0); head.writeUInt16BE(1, 12);
  const entry = Buffer.concat([Buffer.from('name'), u32(64), u32(data.length), u32(orig), u32(0)]);
  return Buffer.concat([head, entry, data]);
}

test.describe('corrupt and oversized input', () => {
  test('a WOFF with corrupt table data is refused quietly (no unhandled rejection)', async ({ app: { page } }) => {
    const buf = woffWith(Buffer.from('this is not deflate data'), 500);
    const r = await page.evaluate(async (b) => __tt.fonts.read(new Uint8Array(b).buffer), [...buf]);
    expect(r).toBeNull();
    await page.waitForTimeout(200);   // an unhandled rejection is reported a moment later; the fixture fails on it
  });

  test('inflating stops at the declared size', async ({ app: { page } }) => {
    const bomb = zlib.deflateSync(Buffer.alloc(1e6));
    const r = await page.evaluate(async (b) => {
      try { return { n: (await inflate(new Uint8Array(b), 100)).length }; } catch (e) { return { err: e.message }; }
    }, [...bomb]);
    expect(r.err).toMatch(/declared size/);
    const ok = await page.evaluate(async (b) => (await inflate(new Uint8Array(b), 1e6)).length, [...bomb]);
    expect(ok).toBe(1e6);
  });

  test('an emoji image that is huge in pixels is refused from its header, before decoding', async ({ app: { page } }) => {
    // just a PNG signature and IHDR claiming 20000 × 20000: nothing could decode it, so only the header check can say "pixels"
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(20000, 0); ihdr.writeUInt32BE(20000, 4);
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), u32(13), Buffer.from('IHDR'), ihdr]);
    await page.setInputFiles('#emFile', { name: 'big.png', mimeType: 'image/png', buffer: png });
    await page.evaluate(() => __tt.emoji.idle);
    await expect(page.locator('#emMsg')).toContainText('big.png is too large in pixels');
  });

  test('image sizes are read from PNG and WebP headers', async ({ app: { page } }) => {
    const webp = (kind, body) => { const h = Buffer.alloc(20); h.write('RIFF', 0); h.write('WEBP', 8); h.write(kind, 12); return Buffer.concat([h, body, Buffer.alloc(16)]); };
    const x = Buffer.alloc(10); x.writeUIntLE(4999, 4, 3); x.writeUIntLE(2999, 7, 3);                       // VP8X: 5000 × 3000
    const l = Buffer.alloc(8); l[0] = 0x2f; l.writeUInt32LE((799) | (599 << 14), 1);                         // VP8L: 800 × 600
    const v = Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00]);                            // VP8: 320 × 240
    const sizes = await page.evaluate((bs) => bs.map((b) => imageHeaderSize(new Uint8Array(b).buffer)), [webp('VP8X', x), webp('VP8L', l), webp('VP8 ', v), Buffer.from('not an image at all, just text')].map((b) => [...b]));
    expect(sizes).toEqual([{ w: 5000, h: 3000 }, { w: 800, h: 600 }, { w: 320, h: 240 }, null]);
  });
});

test.describe('confirmation dialogs', () => {
  test('a second question opened right after answering the first is not answered by the first one\'s close event', async ({ app: { page } }) => {
    const r = await page.evaluate(async () => {
      const a = confirmAction({ title: 'A', message: 'a' });
      answerConfirm(true);
      const b = confirmAction({ title: 'B', message: 'b' });
      await new Promise((res) => setTimeout(res, 100));   // the first dialog's close event fires in here
      const stillOpen = document.querySelector('#confirmDlg').open;
      answerConfirm(true);
      return [await a, await b, stillOpen];
    });
    expect(r).toEqual([true, true, true]);
  });

  test('asking while a question is open answers the old one no and shows the new one', async ({ app: { page } }) => {
    const r = await page.evaluate(async () => {
      const a = confirmAction({ title: 'A', message: 'a' });
      const b = confirmAction({ title: 'B', message: 'b' });
      const first = await a;
      await new Promise((res) => setTimeout(res, 100));
      const title = document.querySelector('#cTitle').textContent, open = document.querySelector('#confirmDlg').open;
      answerConfirm(true);
      return [first, await b, title, open];
    });
    expect(r).toEqual([false, true, 'B', true]);
  });

  test('Escape still answers no', async ({ app: { page } }) => {
    const p = page.evaluate(() => confirmAction({ title: 'A', message: 'a' }));
    await page.waitForSelector('#confirmDlg[open]');
    await page.keyboard.press('Escape');
    expect(await p).toBe(false);
  });
});

test.describe('small audit fixes', () => {
  test('no browser dialog when the installed-font list is unavailable: a toast says so', async ({ app: { page } }) => {
    await page.evaluate(() => { window.queryLocalFonts = undefined; document.querySelector('#loadInstalled').click(); });
    await expect(page.locator('#toast')).toContainText('cannot list installed fonts');   // the fixture fails on any alert()
  });

  test('a line name is escaped for text and attribute: "&lt;" shows as typed', async ({ app: { page } }) => {
    await setText(page, '&lt; <b>x</b> "q"');
    await settle(page);
    const nm = page.locator('#nudges .nm').first();
    await expect(nm).toContainText('&lt; <b>x</b> "q"');
    expect(await nm.getAttribute('title')).toBe('&lt; <b>x</b> "q"');
  });

  test('safeName avoids the names Windows reserves', async ({ app: { page } }) => {
    const r = await page.evaluate(() => ['CON', 'nul.txt', 'com1', 'LPT9.png', 'Console', 'conf', 'a/b'].map(safeName));
    expect(r).toEqual(['_CON', '_nul.txt', '_com1', '_LPT9.png', 'Console', 'conf', 'a-b']);
  });

  test('the PNG file name keeps letters from any script', async ({ app: { page } }) => {
    // read the name the app gives the download link: headless Chromium reports any non-ASCII name as plain "download"
    await page.evaluate(() => { const o = HTMLAnchorElement.prototype.click; window.__names = []; HTMLAnchorElement.prototype.click = function () { window.__names.push(this.download); return o.call(this); }; });
    await setText(page, 'Привет мир');
    await settle(page);
    await Promise.all([page.waitForEvent('download'), page.click('#export')]);
    expect(await page.evaluate(() => window.__names)).toEqual(['titlecard_Привет-мир.png']);
  });

  test('a preset exported under a name with slashes gets a safe file name', async ({ app: { page } }) => {
    await page.fill('#presetName', 'a/b:c');
    const [dl] = await Promise.all([page.waitForEvent('download'), fileMenu(page, 'presetExport')]);
    expect(dl.suggestedFilename()).toBe('a-b-c.json');
  });

  test('opening a set never leaves half a surrogate pair at the text cap', async ({ app: { page } }) => {
    const text = await page.evaluate(() => {
      const t = 'a'.repeat(1999) + '😀';   // 2001 units: the cap lands between the two halves
      const b = decodeBatch({ app: 'opentitlecard', type: 'batch', v: 1, cards: [{ t }] });
      return b.cards[0].text;
    });
    expect(text).toBe('a'.repeat(1999));
  });
});
