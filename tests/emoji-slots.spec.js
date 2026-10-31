const { test, expect, expandUi, confirmDialog, setText, setSelection, exportPng, inspectPng, readZip, downloadZip, addCard, makePng: png } = require('./helpers');

// Putting the user's own emoji images on slots: assignment, drawing in preview and PNG, the layout staying put, the
// default per emoji, undo, set files and the missing-image case. Every image is made here (no emoji artwork anywhere).
const RED = [220, 30, 30], BLUE = [30, 120, 220];
const square = (rgb, n = 40) => png(n, n, () => [...rgb, 255]);
const file = (name, buffer) => ({ name, mimeType: 'image/png', buffer });
const lib = (page) => page.evaluate(() => __tt.emoji.library.map((e) => e.name));

async function addImages(page, files) {
  await page.setInputFiles('#emFile', files);
  await page.evaluate(() => __tt.emoji.idle);
  await page.evaluate(() => __tt.emoji.images());
}
/** Where each slot is in export pixels: {s, e, x, y, w} (top-left corner and width). */
const slots = (page) => page.evaluate(() => {
  __tt.renderNow();
  const g = __tt.exportGeometry(), out = [];
  for (const l of __tt.L.lines) for (const it of l.items) if (it.k === 'slot') out.push({ s: it.s, e: it.e, x: g.cx + (l.tx + l.nx + it.x) * g.u, y: g.cy + (l.cy + l.ny - it.w / 2) * g.u, w: it.w * g.u });
  return out;
});
const centre = (b) => [Math.round(b.x + b.w / 2), Math.round(b.y + b.w / 2)];
async function pixelAt(page, [x, y]) {
  const { buffer } = await exportPng(page);
  return (await inspectPng(page, buffer, [{ type: 'px', x, y }])).results[0];
}
const near = (px, rgb, tol = 6) => rgb.every((v, i) => Math.abs(px[i] - v) <= tol) && px[3] === 255;
const layoutKey = (page) => page.evaluate(() => { __tt.renderNow(); const L = __tt.L; return JSON.stringify({ w: L.cardW, h: L.cardH, lines: L.lines.map((l) => ({ x0: l.x0, x1: l.x1, y0: l.y0, y1: l.y1, items: l.items.map((i) => ({ k: i.k, x: i.x, w: i.w })) })) }); });
async function clickSlotInPreview(page, i = 0) {
  const [b] = (await slots(page)).slice(i, i + 1), g = await page.evaluate(() => __tt.exportGeometry());
  const r = await page.locator('#cv').boundingBox();
  await page.mouse.click(r.x + (b.x + b.w / 2) * (r.width / g.W), r.y + (b.y + b.w / 2) * (r.height / g.H));
}
const openSet = (page, content) => page.setInputFiles('#batchFile', { name: 'set.opntcd', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) });
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await page.evaluate(() => __tt.emoji.ready);
  await expandUi(page);
}

test.describe('emoji images on slots', () => {
  test('clicking a slot in the preview selects it, and clicking an image puts it there: in the preview, with the layout unchanged', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED)), file('blue', square(BLUE))]);
    await setText(page, 'Hello 🙂');
    await expect(page.locator('#emSlot')).toContainText('Click an emoji slot');
    const before = await layoutKey(page);
    await clickSlotInPreview(page);
    await expect(page.locator('#emSlot')).toContainText('Slot 1 🙂: no image yet');
    await page.locator('#emGrid .emitem', { hasText: 'red' }).locator('.emthumb').click();
    await expect(page.locator('#emSlot')).toContainText('image red');
    expect(await page.evaluate(() => __tt.S.emo.filter(Boolean))).toEqual([{ n: 'red', x: 0, y: 0, s: 100 }]);
    expect(await layoutKey(page)).toBe(before);   // the slot was already that size: an image changes nothing about the card
    // the preview canvas shows it (not just the export)
    const [b] = await slots(page);
    const px = await page.evaluate(([x, y]) => { __tt.renderNow(); const c = document.querySelector('#cv'), g = __tt.exportGeometry(), k = c.width / g.W; return [...c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data]; }, centre(b));
    expect(near(px, RED)).toBe(true);
  });

  test('with no slot selected, picking an image says what to do and changes nothing', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hello 🙂');
    await page.locator('#emGrid .emthumb').click();
    await expect(page.locator('#emMsg')).toContainText('Select an emoji slot first');
    expect(await page.evaluate(() => __tt.S.emo.filter(Boolean))).toEqual([]);
  });

  test('the PNG has the image in the slot, at the slot size, with the transparency around the artwork kept', async ({ app: { page } }) => {
    // a picture whose top half is transparent. Trimmed on the way in (the default) it is a wide 40x20 band, so it fits the
    // slot's width and covers the middle half of its height: the rest stays see-through (the card behind shows)
    const half = png(40, 40, (x, y) => (y >= 20 ? [...RED, 255] : [0, 0, 0, 0]));
    await addImages(page, [file('half', half)]);
    await setText(page, 'Hi 🙂');
    const [b] = await slots(page);
    const white = await pixelAt(page, centre(b));
    expect(near(white, [255, 255, 255])).toBe(true);    // empty slot: the card's own white
    await setSelection(page, b.s, b.e);
    await page.locator('#emGrid .emthumb').click();
    const { buffer } = await exportPng(page);
    const r = (await inspectPng(page, buffer, [
      { type: 'px', x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.w * 0.6) },    // inside the band: red
      { type: 'px', x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.w * 0.1) },    // above it: no picture, the white card behind
      { type: 'px', x: Math.round(b.x + 2), y: Math.round(b.y + b.w * 0.6) },          // near the left edge of the slot: the band reaches it
      { type: 'px', x: Math.round(b.x - 8), y: Math.round(b.y + b.w * 0.6) },          // just outside the slot: not red
    ])).results;
    expect(near(r[0], RED)).toBe(true);
    expect(near(r[1], [255, 255, 255])).toBe(true);
    expect(near(r[2], RED)).toBe(true);
    expect(near(r[3], RED)).toBe(false);
  });

  test('a picture is drawn inside its slot, fitted by its longer side, and never outside it', async ({ app: { page } }) => {
    await addImages(page, [file('wide', png(40, 10, () => [...RED, 255]))]);
    await setText(page, 'Hi 🙂');
    const [b] = await slots(page);
    await setSelection(page, b.s, b.e); await page.locator('#emGrid .emthumb').click();
    const { buffer } = await exportPng(page);
    const r = (await inspectPng(page, buffer, [
      { type: 'px', x: Math.round(b.x + b.w * 0.1), y: Math.round(b.y + b.w / 2) },      // the band across the middle
      { type: 'px', x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.w * 0.15) },     // above the band: not picture
      { type: 'px', x: Math.round(b.x + b.w + 6), y: Math.round(b.y + b.w / 2) },        // beyond the slot: not picture
    ])).results;
    expect(near(r[0], RED)).toBe(true);
    expect(near(r[1], RED)).toBe(false);
    expect(near(r[2], RED)).toBe(false);
  });

  test('"Leave emoji slots empty" keeps the images out of the PNG (and the ZIP), but not out of the preview', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const [b] = await slots(page);
    await setSelection(page, b.s, b.e); await page.locator('#emGrid .emthumb').click();
    expect(near(await pixelAt(page, centre(b)), RED)).toBe(true);
    await page.check('#emptySlots');
    expect(near(await pixelAt(page, centre(b)), [255, 255, 255])).toBe(true);
    const px = await page.evaluate(([x, y]) => { __tt.renderNow(); const c = document.querySelector('#cv'), g = __tt.exportGeometry(), k = c.width / g.W; return [...c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data]; }, centre(b));
    expect(near(px, RED)).toBe(true);   // the preview still shows it
    await page.click('#batchOpen');
    expect(await page.locator('#x_emptySlots').isChecked()).toBe(true);   // the dialog shows the same choice
    const zip = readZip((await downloadZip(page)).buffer);
    const png0 = zip.find((f) => f.name.endsWith('.png'));
    const zr = (await inspectPng(page, png0.data, [{ type: 'px', x: centre(b)[0], y: centre(b)[1] }])).results[0];
    expect(near(zr, [255, 255, 255])).toBe(true);
  });

  test('every card in the ZIP gets its own images', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED)), file('blue', square(BLUE))]);
    await setText(page, 'One 🙂');
    const [b1] = await slots(page); await setSelection(page, b1.s, b1.e);
    await page.locator('#emGrid .emitem', { hasText: 'red' }).locator('.emthumb').click();
    await addCard(page, 'Second card 🙂');
    const [b2] = await slots(page); await setSelection(page, b2.s, b2.e);
    await page.locator('#emGrid .emitem', { hasText: 'blue' }).locator('.emthumb').click();
    await page.click('#batchOpen');
    const files = readZip((await downloadZip(page)).buffer).filter((f) => f.name.endsWith('.png'));
    expect(files.length).toBe(2);
    const at = async (f, b) => (await inspectPng(page, f.data, [{ type: 'px', x: centre(b)[0], y: centre(b)[1] }])).results[0];
    expect(near(await at(files[0], b1), RED)).toBe(true);
    expect(near(await at(files[1], b2), BLUE)).toBe(true);
  });

  test('the default image for an emoji fills every slot of that emoji; a slot\'s own image wins; it is kept after a reload', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED)), file('blue', square(BLUE))]);
    await setText(page, '🙂 and 🙂 and 🙂');
    let b = await slots(page);
    await setSelection(page, b[0].s, b[0].e);
    await page.locator('#emGrid .emitem', { hasText: 'red' }).locator('.emthumb').click();
    await page.click('#emSlot button:has-text("Use it for every")');
    await expect(page.locator('#emGrid .emitem', { hasText: 'red' }).locator('.emchars')).toHaveText('🙂');
    b = await slots(page);
    expect(near(await pixelAt(page, centre(b[1])), RED)).toBe(true);     // the second slot has no image of its own: it uses the default
    expect(near(await pixelAt(page, centre(b[2])), RED)).toBe(true);
    await setSelection(page, b[2].s, b[2].e);
    await page.locator('#emGrid .emitem', { hasText: 'blue' }).locator('.emthumb').click();
    expect(near(await pixelAt(page, centre(b[2])), BLUE)).toBe(true);    // its own image wins
    expect(near(await pixelAt(page, centre(b[1])), RED)).toBe(true);
    // the default belongs to the library: still there next visit, for a brand new card
    await reload(page);
    await setText(page, 'again 🙂');
    const [n] = await slots(page);
    expect(near(await pixelAt(page, centre(n)), RED)).toBe(true);
    // and it can be turned off again; one emoji has one default
    await setSelection(page, n.s, n.e);
    await page.click('#emSlot button:has-text("Stop using it")');
    expect(near(await pixelAt(page, centre(n)), [255, 255, 255])).toBe(true);
  });

  test('anchors: the offset is in slot widths and the size a percentage of the fitted picture, so a slot keeps its look when the text or Scale changes', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    let [b] = await slots(page);
    await setSelection(page, b.s, b.e); await page.locator('#emGrid .emthumb').click();
    await page.evaluate((i) => { __tt.S.emo[i] = { n: 'red', x: 25, y: 0, s: 50 }; __tt.renderNow(); }, b.s);
    const rel = async (dx, dy) => { const [c] = await slots(page); return pixelAt(page, [Math.round(c.x + c.w * dx), Math.round(c.y + c.w * dy)]); };
    const look = async () => [near(await rel(0.8, 0.5), RED), near(await rel(0.3, 0.5), RED), near(await rel(0.5, 0.05), RED)];
    expect(await look()).toEqual([true, false, false]);   // half-size picture, a quarter of the slot to the right: the middle of the slot's left half is empty
    await page.focus('#text'); await page.keyboard.press('Control+Home'); await page.keyboard.type('A much longer start ');
    await page.evaluate(() => { __tt.S.size = 130; __tt.renderNow(); });
    expect(await look()).toEqual([true, false, false]);   // nothing to re-adjust
  });

  test('an emoji slot keeps its image through edits before it, line breaks and wrapping', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'One 🙂 two');
    let [b] = await slots(page);
    await setSelection(page, b.s, b.e); await page.locator('#emGrid .emthumb').click();
    // type at the start (the text box's own edits go through the diff that keeps per-character data aligned)
    await page.focus('#text'); await page.keyboard.press('Control+Home'); await page.keyboard.type('Well, ');
    [b] = await slots(page);
    expect(await page.evaluate((s) => __tt.S.emo[s] && __tt.S.emo[s].n, b.s)).toBe('red');
    expect(near(await pixelAt(page, centre(b)), RED)).toBe(true);
    // break the line in front of it
    await page.evaluate((s) => { const t = document.querySelector('#text'); t.focus(); t.setSelectionRange(s - 1, s); }, b.s);
    await page.keyboard.type('\n');
    [b] = await slots(page);
    expect(await page.evaluate((s) => __tt.S.emo[s] && __tt.S.emo[s].n, b.s)).toBe('red');
    expect(near(await pixelAt(page, centre(b)), RED)).toBe(true);
    // wrap the card narrow: the slot moves to another line, the picture goes with it
    await page.evaluate(() => { __tt.S.wrap = 420; __tt.renderNow(); });
    [b] = await slots(page);
    expect(near(await pixelAt(page, centre(b)), RED)).toBe(true);
    // deleting the emoji takes its data with it; no stray data is left behind
    await page.evaluate((s) => { const t = document.querySelector('#text'); t.focus(); t.setSelectionRange(s, s + 2); }, b.s);
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => __tt.S.emo.filter(Boolean))).toEqual([]);
    expect(await page.evaluate(() => __tt.S.emo.length === __tt.S.text.length)).toBe(true);
  });

  test('assigning and removing an image are steps in undo and redo', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const [b] = await slots(page); await setSelection(page, b.s, b.e);
    await page.locator('#emGrid .emthumb').click();
    expect(near(await pixelAt(page, centre(b)), RED)).toBe(true);
    await page.click('#emSlot button:has-text("Remove image")');
    expect(near(await pixelAt(page, centre(b)), [255, 255, 255])).toBe(true);
    await page.click('#undo');
    expect(near(await pixelAt(page, centre(b)), RED)).toBe(true);
    await page.click('#undo');
    expect(near(await pixelAt(page, centre(b)), [255, 255, 255])).toBe(true);
    await page.click('#redo');
    expect(near(await pixelAt(page, centre(b)), RED)).toBe(true);
  });

  test('images are saved in the set file by name (never embedded) and come back when it is opened', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const [b] = await slots(page); await setSelection(page, b.s, b.e); await page.locator('#emGrid .emthumb').click();
    await page.evaluate((s) => { __tt.S.emo[s] = { n: 'red', x: 10, y: -5, s: 80 }; __tt.renderNow(); }, b.s);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.querySelector('#batchSave').click())]);
    const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
    const json = JSON.parse(Buffer.concat(chunks).toString());
    expect(json.cards[0].e).toEqual({ [b.s]: { n: 'red', x: 10, y: -5, s: 80 } });
    expect(JSON.stringify(json)).not.toContain('data:');   // a name, not the picture
    await page.fill('#text', 'something else'); await page.evaluate(() => __tt.renderNow());
    await openSet(page, json); await confirmDialog(page, true);   // the page holds work, so opening a set asks first
    await page.waitForFunction(() => __tt.S.text === 'Hi 🙂');
    expect(await page.evaluate((s) => __tt.S.emo[s], b.s)).toEqual({ n: 'red', x: 10, y: -5, s: 80 });
  });

  test('a set that names an image this library lacks warns, marks the slot, and does not crash or draw anything', async ({ app: { page } }) => {
    await openSet(page, { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'Hi 🙂 🙃', e: { 3: { n: 'grin' }, 5: { n: 'wink' } } }] });
    await page.waitForFunction(() => __tt.S.text === 'Hi 🙂 🙃');
    await expect(page.locator('#fileMsg')).toContainText('2 emoji images are not in your Emoji library (grin, wink)');
    await expect(page.locator('#fileMsg')).toHaveClass(/bad/);
    await expect(page.locator('#slotInfo')).toContainText('the image “grin” is not in your Emoji library');
    const b = await slots(page);
    expect(near(await pixelAt(page, centre(b[0])), [255, 255, 255])).toBe(true);   // the slot stays empty in the PNG
    await expect(page.locator('#toast')).toContainText('2 emoji images are not in your Emoji library');
    await setSelection(page, b[0].s, b[0].e);
    await expect(page.locator('#emSlot')).toContainText('the image grin is not in your library');
    // adding the image under that name fixes it: no edit of the card needed
    await addImages(page, [file('grin', square(RED))]);
    expect(near(await pixelAt(page, centre(b[0])), RED)).toBe(true);
    await expect(page.locator('#slotInfo')).not.toContainText('is not in your Emoji library');
  });

  test('renaming an image keeps the slots that use it, in the card, in a saved set and through undo; deleting it makes them missing', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const [b] = await slots(page); await setSelection(page, b.s, b.e); await page.locator('#emGrid .emthumb').click();
    await page.locator('.emitem', { hasText: 'red' }).dblclick();
    await page.keyboard.press('Control+A'); await page.keyboard.type('crimson'); await page.keyboard.press('Enter');
    await expect.poll(() => lib(page)).toEqual(['crimson']);
    expect(await page.evaluate((s) => __tt.S.emo[s].n, b.s)).toBe('crimson');   // the card follows the rename: a saved set names it right
    expect(near(await pixelAt(page, centre(b)), RED)).toBe(true);
    await page.click('#undo');   // the rename is a step: the card says "red" again, and still finds its picture
    expect(await page.evaluate((s) => __tt.S.emo[s].n, b.s)).toBe('red');
    expect(near(await pixelAt(page, centre(b)), RED)).toBe(true);
    await page.click('#redo');
    await page.locator('.emitem', { hasText: 'crimson' }).hover();
    await page.locator('.emitem', { hasText: 'crimson' }).locator('.emdel').click();
    await expect(page.locator('#slotInfo')).toContainText('is not in your Emoji library');
    expect(near(await pixelAt(page, centre(b)), [255, 255, 255])).toBe(true);
  });

  test('a set file is untrusted: bad slot entries are dropped or clamped, never trusted', async ({ app: { page } }) => {
    const evil = { 0: { n: '<img src=x onerror=alert(1)>', x: 1e9, y: 'no', s: -5 }, 2: 'string', 3: null, 99: { n: 'a' }, '-1': { n: 'b' }, 1.5: { n: 'c' }, x: { n: 'd' }, 4: { n: 'ok', x: 5 } };
    await openSet(page, { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: '🙂 🙂 🙂 🙂 🙂', e: evil }, { t: 'b', e: [1, 2] }, { t: 'c', e: 'str' }] });
    await page.waitForFunction(() => __tt.cards.length === 3);
    const emo = await page.evaluate(() => __tt.cards.map((c) => c.emo.map((d, i) => d && [i, d.n, d.x, d.y, d.s]).filter(Boolean)));
    expect(emo[0]).toEqual([[0, '<img src=x onerror=alert(1)>', 300, 0, 10], [4, 'ok', 5, 0, 100]]);
    expect(emo[1]).toEqual([]); expect(emo[2]).toEqual([]);
    expect(await page.evaluate(() => document.querySelector('#slotInfo img, #fileMsg img, #emSlot img'))).toBeNull();   // a name is only ever text
  });

  test('an older set file (no images in it) opens as before', async ({ app: { page } }) => {
    await openSet(page, { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'old 🙂', i: [0] }] });
    await page.waitForFunction(() => __tt.S.text === 'old 🙂');
    expect(await page.evaluate(() => __tt.S.emo.length === __tt.S.text.length && __tt.S.emo.every((d) => d === null))).toBe(true);
    await expect(page.locator('#fileMsg')).not.toContainText('Emoji library');
  });
});
