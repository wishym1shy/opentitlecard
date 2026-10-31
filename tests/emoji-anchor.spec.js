const { test, expect, confirmDialog, setText, setSelection, exportPng, inspectPng, addCard, makePng: png } = require('./helpers');

// Where a picture sits in its slot: X, Y and Size per slot, the quick starting points, copying a placement, and the
// preview's alignment guides. Images are made here (no artwork anywhere).
const RED = [220, 30, 30], BLUE = [30, 120, 220];
const square = (rgb, n = 40) => png(n, n, () => [...rgb, 255]);
const file = (name, buffer) => ({ name, mimeType: 'image/png', buffer });
const near = (px, rgb, tol = 6) => rgb.every((v, i) => Math.abs(px[i] - v) <= tol) && px[3] === 255;

async function addImages(page, files) {
  await page.setInputFiles('#emFile', files);
  await page.evaluate(() => __tt.emoji.idle);
  await page.evaluate(() => __tt.emoji.images());
}
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
/** First and last y of the red picture in a column of the exported PNG. */
async function redRun(page, x, y0, y1) {
  const { buffer } = await exportPng(page);
  return page.evaluate(async ({ b64, x, y0, y1 }) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
    const cx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d'); cx.drawImage(bmp, 0, 0);
    let a = -1, z = -1;
    for (let y = Math.max(0, y0); y <= Math.min(bmp.height - 1, y1); y++) { const [r, g, b] = cx.getImageData(x, y, 1, 1).data; if (r > 180 && g < 80 && b < 80) { if (a < 0) a = y; z = y; } }
    return [a, z];
  }, { b64: buffer.toString('base64'), x, y0, y1 });
}
const assign = async (page, name) => page.locator('#emGrid .emitem', { hasText: name }).locator('.emthumb').click();
async function selectSlot(page, i = 0) { const b = (await slots(page))[i]; await setSelection(page, b.s, b.e); return b; }
const emo = (page, s) => page.evaluate((s) => __tt.S.emo[s], s);
const typeField = async (page, id, v) => { await page.fill('#n_' + id, String(v)); await page.press('#n_' + id, 'Enter'); };
const openSet = (page, content) => page.setInputFiles('#batchFile', { name: 'set.opntcd', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) });

test.describe('emoji placement in the slot', () => {
  test('the controls show only for a selected slot that shows a picture', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂 there');
    await expect(page.locator('#emAnchor')).toBeHidden();                       // nothing selected
    const b = await selectSlot(page);
    await expect(page.locator('#emAnchor')).toBeHidden();                       // a slot with no picture: nothing to place
    await assign(page, 'red');
    await expect(page.locator('#emAnchor')).toBeVisible();
    await setSelection(page, 0, 2);                                              // some other text
    await expect(page.locator('#emAnchor')).toBeHidden();
    await setSelection(page, b.s, b.e);
    await expect(page.locator('#emAnchor')).toBeVisible();
    // a picture that is missing from the library has no placement either
    await page.evaluate((s) => { __tt.S.emo[s] = { n: 'gone', x: 0, y: 0, s: 100 }; __tt.renderNow(); }, b.s);
    await expect(page.locator('#emAnchor')).toBeHidden();
  });

  test('typed values move and resize the picture in the preview and the PNG, in slot widths; the fields clamp', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const b = await selectSlot(page); await assign(page, 'red');
    await expect(page.locator('#n_anX')).toHaveValue('0'); await expect(page.locator('#n_anScale')).toHaveValue('100');
    await typeField(page, 'anX', 25); await typeField(page, 'anScale', 50);
    expect(await emo(page, b.s)).toEqual({ n: 'red', x: 25, y: 0, s: 50 });
    const rel = async (dx, dy) => pixelAt(page, [Math.round(b.x + b.w * dx), Math.round(b.y + b.w * dy)]);
    expect(near(await rel(0.8, 0.5), RED)).toBe(true);     // half size, a quarter of the slot to the right
    expect(near(await rel(0.3, 0.5), RED)).toBe(false);
    await typeField(page, 'anY', -30);
    expect((await emo(page, b.s)).y).toBe(-30);
    expect(near(await rel(0.8, 0.2), RED)).toBe(true);     // up by 30% of the slot's width
    expect(near(await rel(0.8, 0.8), RED)).toBe(false);
    // limits: nothing outside what a file may carry, and a bad entry puts the old value back
    await typeField(page, 'anX', 9999); expect((await emo(page, b.s)).x).toBe(300);
    await typeField(page, 'anScale', 1); expect((await emo(page, b.s)).s).toBe(10);
    await page.fill('#n_anX', ''); await page.press('#n_anX', 'Enter');
    await expect(page.locator('#n_anX')).toHaveValue('300');
    // arrow keys step by 1, Shift by 10
    await page.focus('#n_anY'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Shift+ArrowUp');
    expect((await emo(page, b.s)).y).toBe(-30 + 11);
  });

  test('a redraw while a number is being typed does not put the old number back', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const b = await selectSlot(page); await assign(page, 'red');
    await page.fill('#n_anX', '35');                                  // typed, not yet applied
    await page.evaluate(() => __tt.renderNow());                      // the preview redraws meanwhile (any other change does this)
    await expect(page.locator('#n_anX')).toHaveValue('35');
    await page.press('#n_anX', 'Enter');
    expect((await emo(page, b.s)).x).toBe(35);
    await page.fill('#n_anX', '500'); await page.evaluate(() => __tt.renderNow()); await page.press('#n_anX', 'Enter');
    await expect(page.locator('#n_anX')).toHaveValue('300');          // once applied, the field shows what the value became
  });

  test('the slider, the scrub label (double-click), and the ↺ buttons reset each value; ↺ is dimmed at the default', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const b = await selectSlot(page); await assign(page, 'red');
    await expect(page.locator('[data-an-reset="scale"]')).toBeDisabled();
    await page.evaluate(() => { const r = document.querySelector('#anX'); r.value = '40'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    expect((await emo(page, b.s)).x).toBe(40);
    await page.locator('[data-view-scrub="anX"]').dblclick();                  // double-click the label: back to 0
    expect(await emo(page, b.s)).toEqual({ n: 'red', x: 0, y: 0, s: 100 });   // placement back to the default; the picture stays
    await typeField(page, 'anScale', 150); await typeField(page, 'anY', 12);
    await expect(page.locator('[data-an-reset="scale"]')).toBeEnabled();
    await page.click('[data-an-reset="scale"]');
    expect((await emo(page, b.s)).s).toBe(100);
    await page.click('[data-an-reset="y"]');
    expect(await emo(page, b.s)).toEqual({ n: 'red', x: 0, y: 0, s: 100 });
    // the picture is still on the slot (only its placement was reset)
    await expect(page.locator('#emSlot')).toContainText('image red');
  });

  test('a scrub drag is one step in undo, and undo and redo move the picture back and forth', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const b = await selectSlot(page); await assign(page, 'red');
    const steps = () => page.evaluate(() => __tt.history.length);
    const before = await steps();
    const h = await page.locator('[data-view-scrub="anX"]').boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(h.x + h.width / 2 + i * 3, h.y + h.height / 2);
    await page.mouse.up();
    const x = (await emo(page, b.s)).x;
    expect(x).toBeGreaterThan(10);
    expect(await steps()).toBe(before + 1);
    await page.click('#undo');
    expect(await emo(page, b.s)).toEqual({ n: 'red', x: 0, y: 0, s: 100 });
    await page.click('#redo');
    expect((await emo(page, b.s)).x).toBe(x);
  });

  test('each slot has its own placement, and keeps it through typing before it and a line break', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'A 🙂 B 🙂');
    let [a, c] = await slots(page);
    await setSelection(page, a.s, a.e); await assign(page, 'red'); await typeField(page, 'anX', 40);
    [a, c] = await slots(page);
    await setSelection(page, c.s, c.e); await assign(page, 'red'); await typeField(page, 'anX', -40); await typeField(page, 'anScale', 50);
    expect(await emo(page, a.s)).toEqual({ n: 'red', x: 40, y: 0, s: 100 });
    expect(await emo(page, c.s)).toEqual({ n: 'red', x: -40, y: 0, s: 50 });
    await page.focus('#text'); await page.keyboard.press('Control+Home'); await page.keyboard.type('Well, ');
    await page.evaluate(() => { const t = document.querySelector('#text'); t.setSelectionRange(t.value.indexOf('B') - 1, t.value.indexOf('B')); });
    await page.keyboard.type('\n');
    [a, c] = await slots(page);
    expect(await emo(page, a.s)).toEqual({ n: 'red', x: 40, y: 0, s: 100 });
    expect(await emo(page, c.s)).toEqual({ n: 'red', x: -40, y: 0, s: 50 });
    // and the second slot's picture really is the small one, left of its slot's centre
    const r = (await inspectPng(page, (await exportPng(page)).buffer, [
      { type: 'px', x: Math.round(c.x + c.w * 0.3), y: Math.round(c.y + c.w / 2) },   // half size, 40% left: the picture spans -0.15 to 0.35 of the slot's width
      { type: 'px', x: Math.round(c.x + c.w * 0.9), y: Math.round(c.y + c.w / 2) },
    ])).results;
    expect(near(r[0], RED)).toBe(true);
    expect(near(r[1], RED)).toBe(false);
  });

  test('"Match cap height" makes the picture as tall as the capitals, centred on them', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const b = await selectSlot(page); await assign(page, 'red'); await typeField(page, 'anY', 30);
    await page.click('#anCap');
    const m = await page.evaluate(() => { __tt.renderNow(); const g = __tt.exportGeometry(), l = __tt.L.lines[0]; return { cap: __tt.L.capH * g.u, capTop: g.cy + (l.base + l.ny - __tt.L.capH) * g.u }; });
    const [top, bottom] = await redRun(page, Math.round(b.x + b.w / 2), 0, 4000);
    expect(Math.abs(bottom - top + 1 - m.cap)).toBeLessThan(m.cap * 0.04 + 2);           // as tall as the capitals
    expect(Math.abs(top - m.capTop)).toBeLessThan(m.cap * 0.04 + 2);                      // and starts at the cap line
    expect((await emo(page, b.s)).y).toBe(0);
  });

  test('"Sit on baseline" puts the picture\'s bottom edge on the baseline, whatever its size', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const b = await selectSlot(page); await assign(page, 'red'); await typeField(page, 'anScale', 60);
    await page.click('#anBase');
    const base = await page.evaluate(() => { __tt.renderNow(); const g = __tt.exportGeometry(), l = __tt.L.lines[0]; return g.cy + (l.base + l.ny) * g.u; });
    const [, bottom] = await redRun(page, Math.round(b.x + b.w / 2), 0, 4000);
    expect(Math.abs(bottom + 1 - base)).toBeLessThan(b.w * 0.012 + 2);
    expect((await emo(page, b.s)).s).toBe(60);                                            // only the position moved
    await typeField(page, 'anScale', 100); await page.click('#anBase');                   // and it works at another size
    const [, bottom2] = await redRun(page, Math.round(b.x + b.w / 2), 0, 4000);
    expect(Math.abs(bottom2 + 1 - base)).toBeLessThan(b.w * 0.012 + 2);
  });

  test('"Use for every slot with this image" copies the placement to all of them, on every card, and not to other images; it is one undo step', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED)), file('blue', square(BLUE))]);
    await setText(page, '🙂 🙂 🙃');
    let [a, c, d] = await slots(page);
    await setSelection(page, a.s, a.e); await assign(page, 'red');
    await page.click('#emSlot button:has-text("Use it for every")');           // red is now the default for 🙂
    await setSelection(page, d.s, d.e); await assign(page, 'blue');            // the 🙃 has its own picture
    await addCard(page, 'Two 🙂');
    await page.click('#cardList button >> nth=0');
    [a, c, d] = await slots(page);
    await setSelection(page, a.s, a.e);
    await typeField(page, 'anX', 25); await typeField(page, 'anY', -10); await typeField(page, 'anScale', 80);
    const steps = await page.evaluate(() => __tt.history.length);
    await page.click('#anCopy');
    await expect(page.locator('#emMsg')).toHaveText('Placement copied to 3 slots showing red.');   // two here, one on the other card
    expect(await page.evaluate(() => __tt.history.length)).toBe(steps + 1);
    const want = { n: null, x: 25, y: -10, s: 80 };
    expect(await emo(page, c.s)).toEqual(want);                                                    // a slot that only uses the default
    expect(await emo(page, d.s)).toEqual({ n: 'blue', x: 0, y: 0, s: 100 });                      // another image: untouched
    expect(await page.evaluate(() => __tt.cards[1].emo.filter(Boolean))).toEqual([want]);
    await page.click('#undo');
    expect(await emo(page, c.s)).toBeNull();
    expect(await page.evaluate(() => __tt.cards[1].emo.filter(Boolean))).toEqual([]);
  });

  test('the preview shows guides for the slot centre, the capital height and the baseline while a slot is selected, and the PNG never has them', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const b = await selectSlot(page); await assign(page, 'red');
    await page.uncheck('#showGuides');                                        // the slot outline off: the rulers belong to the selection, not to that switch
    const spot = (y) => page.evaluate(([bx, by]) => {
      __tt.renderNow(); const c = document.querySelector('#cv'), g = __tt.exportGeometry(), k = c.width / g.W;
      return [...c.getContext('2d').getImageData(Math.round(bx * k), Math.round(by * k), 1, 1).data];
    }, y);
    const m = await page.evaluate(() => { const g = __tt.exportGeometry(), l = __tt.L.lines[0]; return { base: g.cy + (l.base + l.ny) * g.u, cap: g.cy + (l.base + l.ny - __tt.L.capH) * g.u, mid: g.cy + (l.cy + l.ny) * g.u }; });
    const pink = (px) => px[0] > 200 && px[1] < 190 && px[2] > 120;
    const left = b.x - 3;                                                    // in the gap just left of the slot, where the guides extend
    // sample a few pixels around each line: a 1-2 px line can straddle two rows at the preview's scale
    const onLine = async (y) => { for (const dy of [-2, -1, 0, 1, 2]) if (pink(await spot([left, y + dy]))) return true; return false; };
    expect(await onLine(m.base)).toBe(true);
    expect(await onLine(m.cap)).toBe(true);
    // not in the export
    expect(near(await pixelAt(page, [Math.round(left), Math.round(m.base)]), [255, 255, 255])).toBe(true);
    // gone when the slot isn't selected
    await setSelection(page, 0, 0);
    expect(await onLine(m.base)).toBe(false);
    expect(await onLine(m.cap)).toBe(false);
  });

  test('a slot that uses the default picture keeps its placement in a set file, with no name in it', async ({ app: { page } }) => {
    await addImages(page, [file('red', square(RED))]);
    await setText(page, 'Hi 🙂');
    const b = await selectSlot(page); await assign(page, 'red');
    await page.click('#emSlot button:has-text("Use it for every")');
    await page.click('#emSlot button:has-text("Remove image")');                     // now it follows the default
    await expect(page.locator('#emSlot')).toContainText('default image red');
    await typeField(page, 'anX', 30);
    expect(await emo(page, b.s)).toEqual({ n: null, x: 30, y: 0, s: 100 });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.querySelector('#batchSave').click())]);
    const chunks = []; for await (const ch of await dl.createReadStream()) chunks.push(ch);
    const json = JSON.parse(Buffer.concat(chunks).toString());
    expect(json.cards[0].e).toEqual({ [b.s]: { x: 30 } });                            // only what differs from the default
    await page.fill('#text', 'other'); await page.evaluate(() => __tt.renderNow());
    await openSet(page, json); await confirmDialog(page, true);
    await page.waitForFunction(() => __tt.S.text === 'Hi 🙂');
    expect(await emo(page, b.s)).toEqual({ n: null, x: 30, y: 0, s: 100 });
    const [nb] = await slots(page);
    expect(near(await pixelAt(page, [Math.round(nb.x + nb.w * 0.8), Math.round(nb.y + nb.w * 0.5)]), RED)).toBe(true);   // drawn by the default, shifted
  });
});
