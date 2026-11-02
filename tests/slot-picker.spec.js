const { test, expect, setText, setSelection, makePng: png } = require('./helpers');

// The emoji picker that opens beside a slot when it is clicked in the preview: a big grid of the user's images, over the
// canvas without hiding the card. Every image is made here (no emoji artwork anywhere).
const colour = (i) => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256];
const imgFile = (name, i = 1) => ({ name: name + '.png', mimeType: 'image/png', buffer: png(24, 24, () => [...colour(i), 255]) });
async function addImages(page, names) {
  await page.setInputFiles('#emFile', names.map((n, i) => imgFile(n, i + 1)));
  await page.evaluate(() => __tt.emoji.idle);
  await page.evaluate(() => __tt.emoji.images());
}
/** The slots' rectangles on screen (CSS px), computed from the layout the way the app places things. */
const screenSlots = (page) => page.evaluate(() => {
  __tt.renderNow();
  const r = document.querySelector('#cv').getBoundingClientRect(), g = __tt.exportGeometry(), k = r.width / g.W, out = [];
  __tt.L.lines.forEach((l, li) => l.items.forEach((it) => { if (it.k === 'slot') out.push({ s: it.s, e: it.e, li, left: r.left + (g.cx + (l.tx + l.nx + it.x) * g.u) * k, top: r.top + (g.cy + (l.cy + l.ny - it.h / 2) * g.u) * k, w: it.w * g.u * k, h: it.h * g.u * k }); }));
  return out;
});
const click = async (page, b, mods) => { await page.mouse.move(b.left + b.w / 2, b.top + b.h / 2); if (mods) await page.keyboard.down(mods); await page.mouse.down(); await page.mouse.up(); if (mods) await page.keyboard.up(mods); };
const open = (page) => page.evaluate(() => document.querySelector('#slotPicker').matches(':popover-open'));
const box = (page) => page.locator('#slotPicker').boundingBox();
const own = (page, s) => page.evaluate((s) => __tt.S.emo[s] && __tt.S.emo[s].n, s);

test.describe('emoji slot picker', () => {
  test('clicking a slot opens a picker with every image; nothing opens before that', async ({ app: { page } }) => {
    await addImages(page, ['one', 'two', 'three']);
    await setText(page, 'Hi 🙂');
    expect(await open(page)).toBe(false);
    const [b] = await screenSlots(page);
    await click(page, b);
    expect(await open(page)).toBe(true);
    await expect(page.locator('#spGrid .sptile')).toHaveCount(3);
    expect(await page.evaluate(() => [document.querySelector('#text').selectionStart, document.querySelector('#text').selectionEnd])).toEqual([b.s, b.e]);
  });

  test('on a one-line card it opens above the slot, beside it and inside the window', async ({ app: { page } }) => {
    await addImages(page, ['one', 'two']);
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b);
    const p = await box(page), vp = page.viewportSize();
    expect(p.y + p.height).toBeLessThanOrEqual(b.top);                                      // clear of the slot, above it
    expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x + p.width).toBeLessThanOrEqual(vp.width);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(Math.abs(p.x + p.width / 2 - (b.left + b.w / 2))).toBeLessThan(vp.width);       // anchored to the slot, not somewhere else
  });

  test('a slot on the last of several lines opens it below, so the card stays visible', async ({ app: { page } }) => {
    await addImages(page, ['one', 'two']);
    await setText(page, 'First line\nSecond line\nLast 🙂');
    const slots = await screenSlots(page); const b = slots[0];
    expect(b.li).toBe(2);
    await click(page, b);
    const p = await box(page);
    expect(p.y).toBeGreaterThanOrEqual(b.top + b.h);                                        // under the slot
  });

  test('a slot on the first of several lines opens it above', async ({ app: { page } }) => {
    await addImages(page, ['one']);
    await setText(page, 'Top 🙂\nSecond line');
    const [b] = await screenSlots(page);
    await click(page, b);
    const p = await box(page);
    expect(p.y + p.height).toBeLessThanOrEqual(b.top);
  });

  test('it shows far more than a few images at once', async ({ app: { page } }) => {
    await addImages(page, Array.from({ length: 24 }, (_, i) => 'img' + i));
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b);
    const grid = await page.locator('#spGrid').boundingBox();
    const visible = await page.locator('#spGrid .sptile').evaluateAll((els, g) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.top >= g.y - 1 && r.bottom <= g.y + g.height + 1; }).length, grid);
    expect(visible).toBeGreaterThanOrEqual(10);
  });

  test('a tall or wide image stays inside its own square and never covers its neighbours', async ({ app: { page } }) => {
    const mk = (name, w, h) => ({ name: name + '.png', mimeType: 'image/png', buffer: png(w, h, () => [200, 60, 30, 255]) });
    await page.setInputFiles('#emFile', [mk('tall', 124, 160), mk('slim', 98, 159), mk('wide', 160, 60), mk('sq', 24, 24)]);
    await page.evaluate(() => __tt.emoji.idle); await page.evaluate(() => __tt.emoji.images());
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b);
    const r = await page.locator('#spGrid .sptile').evaluateAll((tiles) => tiles.map((t) => { const sq = t.querySelector('.sptb').getBoundingClientRect(), im = t.querySelector('img').getBoundingClientRect(), tr = t.getBoundingClientRect(); return { sqW: sq.width, sqH: sq.height, inside: im.left >= sq.left - 0.5 && im.right <= sq.right + 0.5 && im.top >= sq.top - 0.5 && im.bottom <= sq.bottom + 0.5, tileH: tr.height }; }));
    for (const t of r) { expect(t.inside).toBe(true); expect(Math.abs(t.sqW - t.sqH)).toBeLessThan(1); }   // a square, whatever the picture
    expect(Math.abs(r[0].tileH - r[3].tileH)).toBeLessThan(1);                                            // so every row is as tall as the others
  });

  test('picking an image puts it on the slot, keeps the picker open and marks the tile', async ({ app: { page } }) => {
    await addImages(page, ['one', 'two']);
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b);
    await page.locator('#spGrid .sptile').nth(1).click();
    expect(await own(page, b.s)).toBe('two');
    expect(await open(page)).toBe(true);
    await expect(page.locator('#spGrid .sptile').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#spGrid .sptile').nth(0)).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#spGrid .sptile').nth(0).click();                                    // and it can be changed straight away
    expect(await own(page, b.s)).toBe('one');
    await page.click('#spRemove');
    expect(await own(page, b.s)).toBeFalsy();
    await expect(page.locator('#spRemove')).toBeDisabled();
  });

  test('clicking anywhere else closes it; clicking the emoji again opens it again; Esc closes it', async ({ app: { page } }) => {
    await addImages(page, ['one']);
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b); expect(await open(page)).toBe(true);
    await page.mouse.click(5, 300);                                                          // off the picker, off the card
    expect(await open(page)).toBe(false);
    await click(page, b); expect(await open(page)).toBe(true);
    await click(page, b); expect(await open(page)).toBe(true);                               // a second click on the slot keeps it
    await page.keyboard.press('Escape'); expect(await open(page)).toBe(false);
    await click(page, b); expect(await open(page)).toBe(true);
    // a click on a word, not the slot, closes it
    const w = await page.evaluate(() => { const r = document.querySelector('#cv').getBoundingClientRect(), g = __tt.exportGeometry(), l = __tt.L.lines[0], k = r.width / g.W, ww = l.words[0]; return { x: r.left + (g.cx + (l.tx + l.nx + (ww.x0 + ww.x1) / 2) * g.u) * k, y: r.top + (g.cy + l.cy * g.u) * k }; });
    await page.mouse.click(w.x, w.y);
    expect(await open(page)).toBe(false);
  });

  test('Alt-click on a slot only selects it (Alt is for placing the line)', async ({ app: { page } }) => {
    await addImages(page, ['one']);
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b, 'Alt');
    expect(await open(page)).toBe(false);
    expect(await page.evaluate(() => document.querySelector('#text').selectionStart)).toBe(b.s);
  });

  test('typing in the search box filters, and Enter picks the first match', async ({ app: { page } }) => {
    await addImages(page, ['apple', 'banana', 'avocado']);
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b);
    await page.fill('#spSearch', 'ban');
    await expect(page.locator('#spGrid .sptile')).toHaveCount(1);
    await page.press('#spSearch', 'Enter');
    expect(await own(page, b.s)).toBe('banana');
    await page.fill('#spSearch', 'zzz');
    await expect(page.locator('#spGrid')).toContainText('No emoji match');
  });

  test('with no images it says where to add them', async ({ app: { page } }) => {
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b);
    await expect(page.locator('#spGrid')).toContainText('No emoji images yet');
  });

  test('it closes when its slot goes away, and follows the slot when the text changes around it', async ({ app: { page } }) => {
    await addImages(page, ['one']);
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b);
    const centre = (r) => r.x + r.width / 2;
    expect(Math.abs(centre(await box(page)) - (b.left + b.w / 2))).toBeLessThan(2);          // centred on the slot
    await page.evaluate(() => { __tt.S.nudges[0] = { x: 120, y: 0 }; __tt.renderNow(); });    // the line moves, and the slot with it
    const [b2] = await screenSlots(page);
    expect(b2.left).toBeGreaterThan(b.left + 20);
    expect(Math.abs(centre(await box(page)) - (b2.left + b2.w / 2))).toBeLessThan(2);        // and the picker went along
    await setText(page, 'Hi');                                                                // the emoji is gone
    expect(await open(page)).toBe(false);
  });

  test('it shows the images added to the library while it is open', async ({ app: { page } }) => {
    await setText(page, 'Hi 🙂');
    const [b] = await screenSlots(page);
    await click(page, b);
    await expect(page.locator('#spGrid')).toContainText('No emoji images yet');
    await addImages(page, ['late']);
    await expect(page.locator('#spGrid .sptile')).toHaveCount(1);
  });
});
