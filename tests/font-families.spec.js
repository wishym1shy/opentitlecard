const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const { test, expect, expandUi, APP_URL, setText, settle } = require('./helpers');

// Fonts loaded from files become real families: the file is read for its own family, weight and italic (so a Regular, a
// Bold and an Italic file of one typeface pair up), the Weight menu lists what the family has, and the names older
// versions used for a loaded file keep working. These tests never use the shared fixture's font: each opens a plain page.

const DIR = path.dirname(require.resolve('@fontsource/inter/files/inter-latin-400-normal.woff'));
const file = (w, style, ext = 'woff') => path.join(DIR, `inter-latin-${w}-${style}.${ext}`);
const FAMILY = 'Inter (file)'; // the files say "Inter", which is the bundled default, so the loaded family gets "(file)"

async function openPlain(browser, init) {
  const context = await browser.newContext();
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await expandUi(page);
  return { context, page, errors };
}
const settled = async (page) => { await page.waitForTimeout(150); return page.evaluate(() => __tt.fonts.faces); };
const weights = (page) => page.locator('#weight option').evaluateAll((o) => o.map((x) => +x.value));
const width = (page, font) => page.evaluate((f) => { const c = document.createElement('canvas').getContext('2d'); c.font = f; return c.measureText('Titlecard affiliate').width; }, font);

// WOFF (zlib per table) back to a plain sfnt, to exercise the TTF/OTF path with real font data.
function woffToSfnt(buf) {
  const n = buf.readUInt16BE(12), tabs = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + 20 * i, off = buf.readUInt32BE(o + 4), comp = buf.readUInt32BE(o + 8), orig = buf.readUInt32BE(o + 12);
    const raw = buf.subarray(off, off + comp);
    tabs.push({ tag: buf.subarray(o, o + 4), sum: buf.readUInt32BE(o + 16), data: comp < orig ? zlib.inflateSync(raw) : raw });
  }
  return sfnt(buf.readUInt32BE(4), tabs);
}
function sfnt(flavor, tabs) {
  const n = tabs.length, head = Buffer.alloc(12 + 16 * n);
  head.writeUInt32BE(flavor, 0); head.writeUInt16BE(n, 4);
  let off = head.length; const parts = [head];
  tabs.forEach((t, i) => {
    const o = 12 + 16 * i, pad = (4 - (t.data.length % 4)) % 4;
    t.tag.copy(head, o); head.writeUInt32BE(t.sum || 0, o + 4); head.writeUInt32BE(off, o + 8); head.writeUInt32BE(t.data.length, o + 12);
    parts.push(t.data, Buffer.alloc(pad)); off += t.data.length + pad;
  });
  return Buffer.concat(parts);
}
// A font with no outlines, only the tables the reader looks at: enough to test reading, not drawing.
function fakeFont({ names, weight = 400, fsSelection = 0, angle = 0, fvar = null, flavor = 0x00010000 }) {
  const strs = Object.entries(names), enc = (s) => Buffer.from(s, 'utf16le').swap16();
  const storage = Buffer.concat(strs.map(([, s]) => enc(s)));
  const name = Buffer.alloc(6 + 12 * strs.length); name.writeUInt16BE(strs.length, 2); name.writeUInt16BE(name.length, 4);
  let so = 0;
  strs.forEach(([id, s], i) => { const o = 6 + 12 * i; name.writeUInt16BE(3, o); name.writeUInt16BE(1, o + 2); name.writeUInt16BE(0x409, o + 4); name.writeUInt16BE(+id, o + 6); name.writeUInt16BE(enc(s).length, o + 8); name.writeUInt16BE(so, o + 10); so += enc(s).length; });
  const os2 = Buffer.alloc(78); os2.writeUInt16BE(weight, 4); os2.writeUInt16BE(fsSelection, 62);
  const post = Buffer.alloc(32); post.writeInt32BE(Math.round(angle * 65536), 4);
  const tabs = [{ tag: Buffer.from('OS/2'), data: os2 }, { tag: Buffer.from('name'), data: Buffer.concat([name, storage]) }, { tag: Buffer.from('post'), data: post }];
  if (fvar) {
    const f = Buffer.alloc(16 + 20); f.writeUInt16BE(1, 0); f.writeUInt16BE(16, 4); f.writeUInt16BE(1, 8); f.writeUInt16BE(20, 10);
    f.write('wght', 16); f.writeInt32BE(fvar[0] * 65536, 20); f.writeInt32BE(fvar[1] * 65536, 24); f.writeInt32BE(fvar[1] * 65536, 28);
    tabs.push({ tag: Buffer.from('fvar'), data: f });
  }
  return sfnt(flavor, tabs.sort((a, b) => Buffer.compare(a.tag, b.tag)));
}
const asFile = (name, buffer) => ({ name, mimeType: 'font/ttf', buffer });
const read = (page, buf) => page.evaluate(async (b) => __tt.fonts.read(new Uint8Array(b).buffer), [...buf]);

test.describe('reading a font file', () => {
  test('a real WOFF and the same font as a plain TTF say the same thing', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    for (const [w, st, italic] of [[400, 'normal', false], [700, 'normal', false], [400, 'italic', true], [700, 'italic', true]]) {
      const woff = fs.readFileSync(file(w, st));
      const a = await read(page, woff), b = await read(page, woffToSfnt(woff));
      expect(a, `inter ${w} ${st}`).toMatchObject({ family: 'Inter', weight: w, italic });
      expect(b).toEqual(a); // TrueType path and WOFF path agree
    }
    await context.close();
  });

  test('typographic names win, a style word in the plain name is dropped when the file agrees, and the italic bit, angle or style name each mark italic', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    expect(await read(page, fakeFont({ names: { 1: 'Gotham Bold', 2: 'Regular', 16: 'Gotham', 17: 'Bold' }, weight: 700 }))).toMatchObject({ family: 'Gotham', style: 'Bold', weight: 700, italic: false });
    expect(await read(page, fakeFont({ names: { 1: 'Gotham ExtraBold', 2: 'Regular' }, weight: 800 }))).toMatchObject({ family: 'Gotham', weight: 800 }); // no ID 16: strip the style word
    expect(await read(page, fakeFont({ names: { 1: 'Gotham Light', 2: 'Regular' }, weight: 500 }))).toMatchObject({ family: 'Gotham Light' }); // weight disagrees with the name: keep it as it is
    expect(await read(page, fakeFont({ names: { 1: 'OpenSans', 2: 'Regular' } }))).toMatchObject({ family: 'OpenSans' }); // nothing to strip: not renamed
    expect(await read(page, fakeFont({ names: { 1: 'A', 2: 'Regular' }, fsSelection: 1 }))).toMatchObject({ italic: true });   // fsSelection italic
    expect(await read(page, fakeFont({ names: { 1: 'A', 2: 'Regular' }, fsSelection: 512 }))).toMatchObject({ italic: true });   // oblique bit
    expect(await read(page, fakeFont({ names: { 1: 'A', 2: 'Regular' }, angle: -11.5 }))).toMatchObject({ italic: true });   // post.italicAngle
    expect(await read(page, fakeFont({ names: { 1: 'A', 2: 'Regular' }, angle: 0 }))).toMatchObject({ italic: false });
    expect(await read(page, fakeFont({ names: { 1: 'A', 2: 'Bold Italic' }, weight: 700 }))).toMatchObject({ italic: true });   // the style name
    await context.close();
  });

  test('a variable font reports its weight range; OTF is read too', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    expect(await read(page, fakeFont({ names: { 1: 'Var', 2: 'Regular' }, fvar: [200, 900] }))).toMatchObject({ family: 'Var', range: [200, 900] });
    expect(await read(page, fakeFont({ names: { 1: 'Cff', 2: 'Regular' }, flavor: 0x4f54544f }))).toMatchObject({ family: 'Cff' }); // 'OTTO'
    await context.close();
  });

  test('anything that is not a readable font gives null, never an error', async ({ browser }) => {
    const { context, page, errors } = await openPlain(browser);
    expect(await read(page, Buffer.from('this is not a font at all'))).toBeNull();
    expect(await read(page, Buffer.alloc(0))).toBeNull();
    expect(await read(page, fs.readFileSync(file(400, 'normal', 'woff2')))).toBeNull(); // WOFF2: needs Brotli
    const good = fakeFont({ names: { 1: 'Cut', 2: 'Regular' } });
    expect(await read(page, good.subarray(0, 40))).toBeNull(); // truncated
    const bad = Buffer.from(good); bad.writeUInt32BE(0x7fffffff, 12 + 8); // a table pointing far outside the file
    expect(await read(page, bad)).toBeNull();
    expect(await read(page, fakeFont({ names: {} }))).toBeNull(); // no family name
    expect(errors).toEqual([]);
    await context.close();
  });

  test('file names are read for family, weight and italic when the inside cannot be', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    const g = (n) => page.evaluate((x) => { const r = __tt.fonts.guess(x); return { family: r.family, weight: r.weight, italic: r.italic }; }, n);
    expect(await g('Gotham-BoldItalic.otf')).toEqual({ family: 'Gotham', weight: 700, italic: true });
    expect(await g('GothamSemiBold.ttf')).toEqual({ family: 'Gotham', weight: 600, italic: false });
    expect(await g('Montserrat-ExtraLight.ttf')).toEqual({ family: 'Montserrat', weight: 200, italic: false });
    expect(await g('OpenSans-Regular.ttf')).toEqual({ family: 'Open Sans', weight: 400, italic: false });
    expect(await g('Foo_It.ttf')).toEqual({ family: 'Foo', weight: 400, italic: true });
    expect(await g('inter-latin-800-normal.woff2')).toEqual({ family: 'inter latin', weight: 800, italic: false });
    expect(await g('Flight.woff2')).toEqual({ family: 'Flight', weight: 400, italic: false }); // "light" inside a word is not a weight
    expect(await g('Summit.woff2')).toEqual({ family: 'Summit', weight: 400, italic: false }); // nor "it"
    expect(await g('Bold.woff2')).toEqual({ family: 'Bold', weight: 400, italic: false });   // nothing left: the name stays
    await context.close();
  });
});

test.describe('loading font files', () => {
  test('four files of one typeface become one family with all four faces, and the Weight menu lists its weights', async ({ browser }) => {
    const { context, page, errors } = await openPlain(browser);
    await page.setInputFiles('#fontFile', [file(400, 'normal'), file(700, 'normal'), file(400, 'italic'), file(700, 'italic')]);
    await page.waitForFunction(() => __tt.fonts.faces.length && __tt.fonts.faces[0].faces.length === 4);
    const faces = await settled(page);
    expect(faces.map((f) => f.family)).toEqual([FAMILY]);
    expect(faces[0].faces.map((f) => `${f.w[0]}${f.italic ? 'i' : 'n'}`).sort()).toEqual(['400i', '400n', '700i', '700n']);
    expect(await page.evaluate(() => __tt.S.family)).toBe(FAMILY);
    await expect(page.locator('#family')).toHaveValue(FAMILY);
    expect(await weights(page)).toEqual([400, 700]);
    await expect(page.locator('#weight')).toBeEnabled();
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    await expect(page.locator('#fontWarn')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
  });

  test('the Weight menu really changes the weight, and italic picks the italic file of that weight', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await page.setInputFiles('#fontFile', [file(400, 'normal'), file(700, 'normal'), file(400, 'italic'), file(700, 'italic')]);
    await page.waitForFunction(() => __tt.fonts.faces.length && __tt.fonts.faces[0].faces.length === 4);
    await settled(page);
    const f = (st, w) => `${st} ${w} 100px "${FAMILY}"`;
    const [n4, n7, i4, i7] = [await width(page, f('normal', 400)), await width(page, f('normal', 700)), await width(page, f('italic', 400)), await width(page, f('italic', 700))];
    expect(n7).toBeGreaterThan(n4);
    expect(Math.abs(i4 - n4), 'a real italic: different advance widths').toBeGreaterThan(0.5);
    expect(Math.abs(i7 - n7)).toBeGreaterThan(0.5);
    expect(Math.abs(i7 - i4), 'the two italics are different files').toBeGreaterThan(0.5);
    // through the app: the line is wider at 700 than at 400
    await setText(page, 'Titlecard affiliate');
    await page.selectOption('#weight', '400');
    const w400 = (await settle(page)).lines[0].w;
    await page.selectOption('#weight', '700');
    const w700 = (await settle(page)).lines[0].w;
    expect(w700).toBeGreaterThan(w400);
    expect(await page.evaluate(() => __tt.S.weight)).toBe(700);
    await context.close();
  });

  test('italic words in a family with a real italic are not shifted; with only the upright they are', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await page.check('#align input[value="left"]');
    await setText(page, 'Hello world');
    const firstX = async () => (await settle(page)).lines[0].items[0].x;
    await page.setInputFiles('#fontFile', [file(700, 'normal')]); // upright only: the browser fakes the slant
    await page.waitForFunction(() => __tt.fonts.faces.length === 1);
    const before = await firstX();
    await page.evaluate(() => { const t = document.querySelector('#text'); t.focus(); t.setSelectionRange(0, 5); });
    await page.click('#ital');
    expect(await firstX(), 'faked italic keeps the correction').toBeLessThan(before - 0.5);
    await page.setInputFiles('#fontFile', [file(700, 'italic')]); // the real italic joins the family
    await page.waitForFunction(() => __tt.fonts.faces[0].faces.length === 2);
    expect(await firstX(), 'real italic needs none').toBeCloseTo(before, 3);
    await context.close();
  });

  test('a plain TTF is loaded like any other file', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await page.setInputFiles('#fontFile', asFile('whatever.ttf', woffToSfnt(fs.readFileSync(file(700, 'normal')))));
    await page.waitForFunction(() => __tt.fonts.faces.length === 1);
    expect((await settled(page))[0]).toMatchObject({ family: FAMILY, faces: [{ w: [700, 700], italic: false }] });
    await context.close();
  });

  test('loading a font whose weight the current Weight setting lacks moves to the nearest weight it has', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    expect(await page.evaluate(() => __tt.S.weight)).toBe(700);
    await page.setInputFiles('#fontFile', [file(400, 'normal')]);
    await page.waitForFunction(() => __tt.fonts.faces.length === 1);
    expect(await page.evaluate(() => __tt.S.weight)).toBe(400);
    expect(await weights(page)).toEqual([400]);
    await page.keyboard.press('Control+z'); // one undo step puts the family back, and the Weight menu with it
    await expect(page.locator('#family')).toHaveValue('Inter');
    expect(await weights(page)).toEqual([400, 500, 600, 700, 800, 900]);
    await context.close();
  });

  test('a family the app does not know shows the usual Regular to Black menu, and a weight a loaded family lacks is labelled', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    expect(await weights(page)).toEqual([400, 500, 600, 700, 800, 900]);
    await page.setInputFiles('#fontFile', [file(400, 'normal'), file(700, 'normal')]);
    await page.waitForFunction(() => __tt.fonts.faces.length && __tt.fonts.faces[0].faces.length === 2);
    await page.fill('#family', 'Courier New');
    await page.keyboard.press('Escape');
    expect(await weights(page)).toEqual([400, 500, 600, 700, 800, 900]);
    await page.selectOption('#weight', '900');
    await page.fill('#family', FAMILY);
    await page.keyboard.press('Escape');
    expect(await weights(page)).toEqual([400, 700, 900]);
    await expect(page.locator('#weight option[value="900"]')).toHaveText('900 (not in this font)');
    await context.close();
  });

  test('loading the same file twice does not add a second face', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await page.setInputFiles('#fontFile', [file(700, 'normal')]);
    await page.waitForFunction(() => __tt.fonts.faces.length === 1);
    await page.setInputFiles('#fontFile', [file(700, 'normal')]);
    await page.waitForTimeout(300);
    expect((await settled(page))[0].faces).toHaveLength(1);
    expect(await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Inter (file)').length)).toBe(1);
    await context.close();
  });
});

test.describe('names from older versions', () => {
  test('the old file-based name still works: same font, its weight fixed, its menu locked', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await page.setInputFiles('#fontFile', [file(400, 'normal'), file(700, 'normal')]);
    await page.waitForFunction(() => __tt.fonts.faces.length && __tt.fonts.faces[0].faces.length === 2);
    expect(await page.evaluate(() => __tt.fonts.aliases.map((a) => a.name).sort())).toEqual(['inter-latin-400-normal', 'inter-latin-700-normal']);
    // an older preset or set names the 400 file and (as the menu did nothing then) has the default weight 700
    await page.fill('#family', 'inter-latin-400-normal');
    await page.keyboard.press('Escape');
    await expect(page.locator('#fontWarn')).toBeHidden();
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    await expect(page.locator('#fontChip')).toContainText('inter-latin-400-normal 400'); // drawn with that file's weight
    await expect(page.locator('#weight')).toBeDisabled();
    expect(await page.evaluate(() => __tt.S.weight)).toBe(700);
    await setText(page, 'Titlecard affiliate');
    const old400 = (await settle(page)).lines[0].w;
    await page.fill('#family', FAMILY);
    await page.keyboard.press('Escape');
    await page.selectOption('#weight', '400');
    expect((await settle(page)).lines[0].w).toBeCloseTo(old400, 3); // the same look as the family at 400
    await context.close();
  });

  test('a saved style that names the old file-based name does not warn on the next visit', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await page.setInputFiles('#fontFile', [file(700, 'normal')]);
    await page.waitForFunction(() => __tt.fonts.faces.length === 1);
    await page.fill('#family', 'inter-latin-700-normal');
    await page.keyboard.press('Escape');
    await page.addInitScript(() => {
      window.__warnSeen = false;
      const t = () => { const b = document.querySelector('#fontWarn'); if (b && !b.hidden) window.__warnSeen = true; if (performance.now() < 2500) requestAnimationFrame(t); };
      requestAnimationFrame(t);
    });
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expect(page.locator('#fontChip')).toContainText('inter-latin-700-normal');
    await page.waitForTimeout(2600);
    expect(await page.evaluate(() => window.__warnSeen)).toBe(false);
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    await context.close();
  });

  test('fonts remembered by the previous version are filed under their real family and keep their old names', async ({ browser }) => {
    const { context, page, errors } = await openPlain(browser);
    const legacy = (name, f) => ({ family: name, file: path.basename(f), added: Date.now(), data: [...fs.readFileSync(f)] });
    const records = [legacy('inter-latin-400-normal', file(400, 'normal')), legacy('inter-latin-700-italic', file(700, 'italic')), legacy('Old Face', file(800, 'normal', 'woff2'))];
    // rebuild the database as version 1 had it: one store `fonts`, one record per file
    await page.evaluate(async (recs) => {
      await new Promise((res, rej) => { const d = indexedDB.deleteDatabase('opentitlecard'); d.onsuccess = res; d.onerror = rej; d.onblocked = res; });
      await new Promise((res, rej) => {
        const o = indexedDB.open('opentitlecard', 1);
        o.onupgradeneeded = () => o.result.createObjectStore('fonts', { keyPath: 'family' });
        o.onsuccess = () => {
          const tx = o.result.transaction('fonts', 'readwrite'), st = tx.objectStore('fonts');
          for (const r of recs) st.put({ ...r, data: new Uint8Array(r.data).buffer });
          tx.oncomplete = () => { o.result.close(); res(); }; tx.onerror = () => rej(tx.error);
        };
      });
      localStorage.setItem('opentitlecard.style', JSON.stringify({ family: 'inter-latin-700-italic', weight: 700 }));
      localStorage.setItem('opentitlecard.rememberedFonts', JSON.stringify(['inter-latin-400-normal', 'inter-latin-700-italic', 'Old Face']));
    }, records);
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await page.waitForFunction(() => __tt.fonts.faces.length === 2);
    await expandUi(page);
    const faces = await page.evaluate(() => __tt.fonts.faces);
    // the two Inter files joined one family (readable); the unreadable WOFF2 stays what it was: one face for every weight
    expect(faces.find((f) => f.family === FAMILY).faces.map((f) => `${f.w[0]}${f.italic ? 'i' : 'n'}`).sort()).toEqual(['400n', '700i']);
    expect(faces.find((f) => f.family === 'Old Face').faces).toEqual([{ w: [1, 1000], italic: false }]);
    expect(await page.evaluate(() => __tt.fonts.aliases.map((a) => a.name).sort())).toEqual(['inter-latin-400-normal', 'inter-latin-700-italic']);
    // the saved style used an old name: it resolves, with no warning
    expect(await page.evaluate(() => __tt.S.family)).toBe('inter-latin-700-italic');
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    await expect(page.locator('#fontWarn')).toBeHidden();
    await expect(page.locator('#fontMemText')).toHaveText('3 loaded fonts remembered on this computer');
    // the old store is empty and the records live on in the new one: a second load changes nothing
    const stores = await page.evaluate(() => new Promise((res) => { const o = indexedDB.open('opentitlecard'); o.onsuccess = () => { const db = o.result, tx = db.transaction(['fonts', 'faces']); const a = tx.objectStore('fonts').count(), b = tx.objectStore('faces').count(); tx.oncomplete = () => { db.close(); res({ old: a.result, now: b.result, version: db.version }); }; }; }));
    expect(stores).toEqual({ old: 0, now: 3, version: 2 });
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L && __tt.fonts.faces.length === 2);
    await expect(page.locator('#fontMemText')).toHaveText('3 loaded fonts remembered on this computer');
    expect(errors).toEqual([]);
    await context.close();
  });
});

test.describe('remembering faces', () => {
  test('every face of a family is back after a reload, so italic and weights still work', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await page.setInputFiles('#fontFile', [file(400, 'normal'), file(700, 'normal'), file(700, 'italic')]);
    await page.waitForFunction(() => __tt.fonts.faces.length && __tt.fonts.faces[0].faces.length === 3);
    await expect(page.locator('#fontMemText')).toHaveText('3 loaded fonts remembered on this computer');
    await page.waitForTimeout(300); // the writes finish
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L && __tt.fonts.faces.length && __tt.fonts.faces[0].faces.length === 3);
    await expandUi(page);
    expect(await page.evaluate(() => __tt.S.family)).toBe(FAMILY);
    expect(await weights(page)).toEqual([400, 700]);
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    await expect(page.locator('#fontMemText')).toHaveText('3 loaded fonts remembered on this computer');
    await context.close();
  });
});

test.describe('files that cannot be read', () => {
  test('a WOFF2 is used at once, with a row that says its details are guessed and lets the user correct them', async ({ browser }) => {
    const { context, page, errors } = await openPlain(browser);
    await expect(page.locator('#fontGuess .guess')).toHaveCount(0); // nothing is shown for a readable file
    await page.setInputFiles('#fontFile', file(700, 'italic', 'woff2'));
    await expect(page.locator('#fontGuess .guess')).toHaveCount(1);
    await expect(page.locator('#fontGuess .guess')).toContainText('inter-latin-700-italic.woff2');
    await expect(page.locator('#fontGuess .guess')).toContainText('guessed from the file name');
    // used straight away, as a guess
    expect(await page.evaluate(() => __tt.S.family)).toBe('inter latin');
    expect((await settled(page))[0]).toMatchObject({ family: 'inter latin', faces: [{ w: [700, 700], italic: true }] });
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    // the row holds the guess, and correcting it re-files the face
    const row = page.locator('#fontGuess .guess');
    await expect(row.locator('.gfam')).toHaveValue('inter latin');
    await expect(row.locator('select')).toHaveValue('700');
    await expect(row.locator('input[type=checkbox]')).toBeChecked();
    await row.locator('.gfam').fill('Fixed Name');
    await row.locator('select').selectOption('300');
    await row.locator('input[type=checkbox]').uncheck();
    await row.getByRole('button', { name: 'Update' }).click();
    await page.waitForFunction(() => __tt.fonts.faces.length === 1 && __tt.fonts.faces[0].family === 'Fixed Name');
    expect((await settled(page))[0].faces).toEqual([{ w: [300, 300], italic: false }]);
    expect(await page.evaluate(() => __tt.S.family)).toBe('Fixed Name'); // the card follows its font
    await expect(page.locator('#family')).toHaveValue('Fixed Name');
    expect(await weights(page)).toEqual([300]);
    // the corrected details are what gets remembered
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L && __tt.fonts.faces.length === 1);
    expect((await page.evaluate(() => __tt.fonts.faces))[0]).toMatchObject({ family: 'Fixed Name', faces: [{ w: [300, 300], italic: false }] });
    await expandUi(page);
    await expect(page.locator('#fontGuess .guess')).toHaveCount(0); // it is not asked again
    expect(errors).toEqual([]);
    await context.close();
  });

  test('"Looks right" closes the row, and each unreadable file gets its own row', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await page.setInputFiles('#fontFile', [file(400, 'normal', 'woff2'), file(700, 'normal', 'woff2')]);
    await expect(page.locator('#fontGuess .guess')).toHaveCount(2);
    await page.locator('#fontGuess .guess').first().getByRole('button', { name: 'Looks right' }).click();
    await expect(page.locator('#fontGuess .guess')).toHaveCount(1);
    await expect(page.locator('#fontGuess .guess')).toContainText('inter-latin-700-normal.woff2');
    await context.close();
  });

  test('a file name is shown as text, never as markup', async ({ browser }) => {
    const { context, page, errors } = await openPlain(browser);
    await page.setInputFiles('#fontFile', { name: '<img src=x onerror=alert(1)>.woff2', mimeType: 'font/woff2', buffer: fs.readFileSync(file(400, 'normal', 'woff2')) });
    await expect(page.locator('#fontGuess .guess')).toHaveCount(1);
    expect(await page.locator('#fontGuess img').count()).toBe(0);
    await expect(page.locator('#fontGuess .guess b')).toContainText('<img src=x');
    expect(errors).toEqual([]);
    await context.close();
  });
});
