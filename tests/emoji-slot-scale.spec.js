const { test, expect, confirmDialog, setText, setSelection, exportPng, inspectPng, makePng: png } = require('./helpers');

// Scale X / Scale Y for each emoji slot: the space the slot takes, in the layout. The slot size used to be one setting for
// every slot; it is now a pair of percentages per slot (of the standard slot), which follows the slot through edits.
const RED = [220, 30, 30];
const square = (n = 40) => png(n, n, () => [...RED, 255]);
const near = (px, rgb, tol = 6) => rgb.every((v, i) => Math.abs(px[i] - v) <= tol) && px[3] === 255;

/** Layout facts for the slots (layout units) and the card. */
const facts = (page) => page.evaluate(() => {
  __tt.renderNow();
  const L = __tt.L, g = __tt.exportGeometry(), out = { size: L.size, capH: L.capH, cardW: L.cardW, cardH: L.cardH, u: g.u, slots: [], lines: L.lines.map((l) => ({ y0: l.y0, y1: l.y1, base: l.base, cy: l.cy })) };
  for (const l of L.lines) for (const it of l.items) if (it.k === 'slot') out.slots.push({ s: it.s, e: it.e, w: it.w, h: it.h, x: g.cx + (l.tx + l.nx + it.x) * g.u, y: g.cy + (l.cy + l.ny - it.h / 2) * g.u, pw: it.w * g.u, ph: it.h * g.u });
  return out;
});
const layoutKey = (page) => page.evaluate(() => { __tt.renderNow(); return JSON.stringify(__tt.L.lines.map((l) => ({ y0: l.y0, y1: l.y1, x0: l.x0, x1: l.x1, items: l.items.map((i) => [i.k, i.x, i.w, i.h]) }))); });
const field = (page, k, i = 0) => page.locator(`#slotRows input[data-sk="${k}"]`).nth(i);
async function setScale(page, k, v, i = 0) { const f = field(page, k, i); await f.fill(String(v)); await f.press('Enter'); }
const emo = (page, s) => page.evaluate((s) => __tt.S.emo[s], s);
const openSet = (page, content) => page.setInputFiles('#batchFile', { name: 'set.opntcd', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) });
async function addImage(page, name = 'red') {
  await page.setInputFiles('#emFile', { name: name + '.png', mimeType: 'image/png', buffer: square() });
  await page.evaluate(() => __tt.emoji.idle); await page.evaluate(() => __tt.emoji.images());
}
async function pixelAt(page, [x, y]) {
  const { buffer } = await exportPng(page);
  return (await inspectPng(page, buffer, [{ type: 'px', x, y }])).results[0];
}

test.describe('emoji slot Scale X / Scale Y', () => {
  test('the global slot size is gone; each emoji slot has a Scale X / Scale Y row, at 100% to begin with', async ({ app: { page } }) => {
    await setText(page, 'A 🙂 B 🙃');
    await expect(page.locator('#slot, #n_slot')).toHaveCount(0);
    await expect(page.locator('#slotRows .slotrow')).toHaveCount(2);
    await expect(page.locator('#slotRows .slotrow').nth(0)).toContainText('🙂');
    await expect(page.locator('#slotRows .slotrow').nth(1)).toContainText('🙃');
    for (let i = 0; i < 2; i++) for (const k of ['sx', 'sy']) await expect(field(page, k, i)).toHaveValue('100');
    await expect(page.locator('[data-slot-reset]').first()).toBeDisabled();
    const f = await facts(page);
    for (const s of f.slots) { expect(s.w).toBeCloseTo(1.25 * f.size, 6); expect(s.h).toBeCloseTo(s.w, 6); }   // the standard slot, square, as always
  });

  test('Scale X changes the width a slot takes and nothing else; the card widens by exactly that', async ({ app: { page } }) => {
    await setText(page, 'Hi 🙂');
    const a = await facts(page);
    await setScale(page, 'sx', 150);
    const b = await facts(page);
    expect(b.slots[0].w).toBeCloseTo(1.5 * a.slots[0].w, 6);
    expect(b.slots[0].h).toBeCloseTo(a.slots[0].h, 6);
    expect(b.cardW - a.cardW).toBeCloseTo(0.5 * a.slots[0].w, 4);
    expect(b.cardH).toBeCloseTo(a.cardH, 6);
    await setScale(page, 'sx', 50);
    const c = await facts(page);
    expect(c.cardW - a.cardW).toBeCloseTo(-0.5 * a.slots[0].w, 4);        // and narrower
  });

  test('Scale Y makes a slot taller: the card box grows up and down to hold it; shorter slots never shrink the box', async ({ app: { page } }) => {
    await setText(page, 'Hi 🙂');
    const a = await facts(page), clear = await page.evaluate(() => __tt.S.clear * __tt.S.size);
    await setScale(page, 'sy', 220);
    const b = await facts(page), s = b.slots[0], l = b.lines[0];
    expect(s.h).toBeCloseTo(2.2 * a.slots[0].h, 6);
    expect(s.w).toBeCloseTo(a.slots[0].w, 6);
    expect(l.cy - s.h / 2).toBeGreaterThanOrEqual(l.y0 - 0.01);            // the box top is at or above the slot's top
    expect(l.y1).toBeGreaterThanOrEqual(l.cy + s.h / 2 + clear - 0.01);    // and the bottom keeps its usual clearance below the slot
    expect(b.cardH).toBeGreaterThan(a.cardH);
    await setScale(page, 'sy', 40);
    const c = await facts(page);
    expect(c.slots[0].h).toBeCloseTo(0.4 * a.slots[0].h, 6);
    await setText(page, 'Hi');                                             // the same line with no emoji at all: the measured box
    const plain = await facts(page);
    expect(c.cardH).toBeCloseTo(plain.cardH, 6);                           // a shorter slot never takes the box below it (the standard slot is the tallest thing that doesn't)
    expect(c.cardH).toBeLessThanOrEqual(a.cardH);
  });

  test('a slot at 100% / 100% lays out exactly as before, and ↺ brings it back exactly', async ({ app: { page } }) => {
    await setText(page, 'Hi 🙂 there 🙃');
    const base = await layoutKey(page);
    await setScale(page, 'sx', 170); await setScale(page, 'sy', 60, 1);
    expect(await layoutKey(page)).not.toBe(base);
    await page.locator('[data-slot-reset]').nth(0).click(); await page.locator('[data-slot-reset]').nth(1).click();
    expect(await layoutKey(page)).toBe(base);
    expect(await page.evaluate(() => __tt.S.emo.filter(Boolean))).toEqual([]);   // nothing left behind
  });

  test('each slot has its own scale, and it stays with its slot through typing, line breaks and wrapping', async ({ app: { page } }) => {
    await setText(page, 'A 🙂 B 🙃');
    await setScale(page, 'sx', 150, 0); await setScale(page, 'sy', 70, 1);
    let f = await facts(page);
    expect(f.slots[0].w).toBeCloseTo(1.5 * 1.25 * f.size, 6);
    expect(f.slots[1].h).toBeCloseTo(0.7 * 1.25 * f.size, 6);
    await page.focus('#text'); await page.keyboard.press('Control+Home'); await page.keyboard.type('Well, ');
    await page.evaluate(() => { const t = document.querySelector('#text'); t.setSelectionRange(t.value.indexOf('B') - 1, t.value.indexOf('B')); });
    await page.keyboard.type('\n');
    f = await facts(page);
    expect(f.slots[0].w).toBeCloseTo(1.5 * 1.25 * f.size, 6);     // still the first emoji's
    expect(f.slots[0].h).toBeCloseTo(1.25 * f.size, 6);
    expect(f.slots[1].h).toBeCloseTo(0.7 * 1.25 * f.size, 6);     // still the second's
    expect(f.slots[1].w).toBeCloseTo(1.25 * f.size, 6);
    await expect(field(page, 'sx', 0)).toHaveValue('150'); await expect(field(page, 'sy', 1)).toHaveValue('70');
    await page.evaluate(() => { __tt.S.wrap = 420; __tt.renderNow(); });                       // wrapping moves them across lines: still theirs
    f = await facts(page);
    expect(f.slots[0].w).toBeCloseTo(1.5 * 1.25 * f.size, 6);
    expect(f.slots[1].h).toBeCloseTo(0.7 * 1.25 * f.size, 6);
  });

  test('rows follow the emoji in the text: adding one adds a row, deleting one removes it and its scale', async ({ app: { page } }) => {
    await setText(page, 'A 🙂');
    await setScale(page, 'sx', 130);
    await page.focus('#text'); await page.keyboard.press('Control+End'); await page.keyboard.type(' 🙃');
    await expect(page.locator('#slotRows .slotrow')).toHaveCount(2);
    await expect(field(page, 'sx', 1)).toHaveValue('100');
    await page.evaluate(() => { const t = document.querySelector('#text'); t.setSelectionRange(2, 4); });
    await page.keyboard.press('Delete');
    await expect(page.locator('#slotRows .slotrow')).toHaveCount(1);
    await expect(field(page, 'sx', 0)).toHaveValue('100');                                      // the 🙃 took its own default, not the old 130
    expect(await page.evaluate(() => __tt.S.emo.filter(Boolean))).toEqual([]);
  });

  test('the fields clamp, restore a bad entry, step with Shift+arrows, scrub, and reset on double-click', async ({ app: { page } }) => {
    await setText(page, 'Hi 🙂');
    await setScale(page, 'sx', 9999); await expect(field(page, 'sx')).toHaveValue('400');
    await setScale(page, 'sy', 1); await expect(field(page, 'sy')).toHaveValue('10');
    await field(page, 'sx').fill(''); await field(page, 'sx').press('Enter'); await expect(field(page, 'sx')).toHaveValue('400');
    await field(page, 'sy').focus(); await page.keyboard.press('Shift+ArrowUp');
    await expect(field(page, 'sy')).toHaveValue('20');
    await page.locator('[data-sscrub="sy"]').dblclick();
    await expect(field(page, 'sy')).toHaveValue('100');
    const steps = () => page.evaluate(() => __tt.history.length);
    const before = await steps();
    const h = await page.locator('[data-sscrub="sx"]').boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(h.x + h.width / 2 - i * 4, h.y + h.height / 2);
    await page.mouse.up();
    expect(Number(await field(page, 'sx').inputValue())).toBeLessThan(400);
    expect(await steps()).toBe(before + 1);                                                      // a drag is one undo step
    await page.click('#undo');
    await expect(field(page, 'sx')).toHaveValue('400');
  });

  test('changing a scale is an undo and redo step', async ({ app: { page } }) => {
    await setText(page, 'Hi 🙂');
    const a = await layoutKey(page);
    await setScale(page, 'sx', 160); const b = await layoutKey(page);
    expect(b).not.toBe(a);
    await page.click('#undo'); expect(await layoutKey(page)).toBe(a);
    await page.click('#redo'); expect(await layoutKey(page)).toBe(b);
  });

  test('a picture fits the slot\'s own box, and its Y offset is a percent of the slot\'s height', async ({ app: { page } }) => {
    await addImage(page);
    await setText(page, 'Hi 🙂');
    let b = (await facts(page)).slots[0];
    await setSelection(page, b.s, b.e); await page.locator('#emGrid .emthumb').click();
    await setScale(page, 'sx', 200);                                                            // twice as wide, as tall as before: a square picture fits the height
    b = (await facts(page)).slots[0];
    const mid = Math.round(b.y + b.ph / 2);
    const row = async (dx) => pixelAt(page, [Math.round(b.x + b.pw * dx), mid]);
    expect(near(await row(0.5), RED)).toBe(true);                                               // the middle of the slot
    expect(near(await row(0.1), RED)).toBe(false);                                              // beyond the picture on the left: it is not stretched to fill
    expect(near(await row(0.9), RED)).toBe(false);
    // Y is a share of the slot's height: with the slot twice as tall, 25% moves the picture a quarter of its height
    await setScale(page, 'sx', 100); await setScale(page, 'sy', 200);
    b = (await facts(page)).slots[0];
    await page.evaluate((s) => { __tt.S.emo[s] = { ...__tt.S.emo[s], y: 25 }; __tt.renderNow(); }, b.s);
    const col = Math.round(b.x + b.pw / 2);
    const picH = b.pw;                                                                          // fitted by the narrower side: as tall as the slot is wide
    const centreY = b.y + b.ph / 2 + 0.25 * b.ph;
    expect(near(await pixelAt(page, [col, Math.round(centreY)]), RED)).toBe(true);
    expect(near(await pixelAt(page, [col, Math.round(centreY - picH / 2 - 6)]), RED)).toBe(false);   // above the moved picture
    expect(near(await pixelAt(page, [col, Math.round(b.y + b.ph / 2 - picH / 2 + 4)]), RED)).toBe(false);   // where it was before the shift
  });

  test('clicking the extra room of a wide slot in the preview still selects it', async ({ app: { page } }) => {
    await setText(page, 'Hi 🙂');
    await setScale(page, 'sx', 300);
    const b = (await facts(page)).slots[0], g = await page.evaluate(() => __tt.exportGeometry());
    const r = await page.locator('#cv').boundingBox();
    await page.mouse.click(r.x + (b.x + b.pw * 0.9) * (r.width / g.W), r.y + (b.y + b.ph / 2) * (r.height / g.H));
    expect(await page.evaluate(() => [document.querySelector('#text').selectionStart, document.querySelector('#text').selectionEnd])).toEqual([b.s, b.e]);
  });

  test('a scaled slot shows W×H in the slot list', async ({ app: { page } }) => {
    await setText(page, 'Hi 🙂');
    await expect(page.locator('#slotInfo')).not.toContainText('×');
    await setScale(page, 'sx', 200);
    await expect(page.locator('#slotInfo')).toContainText('×');
  });

  test('scales are saved in the set file (only when not 100), come back on open, and bad values are dropped or clamped', async ({ app: { page } }) => {
    await setText(page, 'A 🙂 🙃');
    await setScale(page, 'sx', 140); await setScale(page, 'sy', 60, 1);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.querySelector('#batchSave').click())]);
    const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
    const json = JSON.parse(Buffer.concat(chunks).toString());
    expect(Object.values(json.cards[0].e)).toEqual([{ sx: 140 }, { sy: 60 }]);                  // no name, no x, no y: only what differs
    await page.fill('#text', 'x'); await page.evaluate(() => __tt.renderNow());
    await openSet(page, json); await confirmDialog(page, true);
    await page.waitForFunction(() => __tt.S.text === 'A 🙂 🙃');
    await expect(field(page, 'sx', 0)).toHaveValue('140'); await expect(field(page, 'sy', 1)).toHaveValue('60');
    // untrusted
    await openSet(page, { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: '🙂 🙂 🙂 🙂', e: { 0: { sx: 'wide', sy: 9999 }, 3: { sx: -5 }, 6: { sx: 100, sy: 100 }, 9: { sx: 150.4 } } }] });
    await confirmDialog(page, true);
    await page.waitForFunction(() => __tt.S.text === '🙂 🙂 🙂 🙂');
    expect(await page.evaluate(() => __tt.S.emo.map((d, i) => d && [i, d.sx, d.sy]).filter(Boolean))).toEqual([[0, undefined, 400], [3, 10, undefined], [9, 150, undefined]]);
  });

  test('an older set or preset that carries a slot size still lays out as it did, though nothing in the app edits it any more', async ({ app: { page } }) => {
    await openSet(page, { app: 'opentitlecard', type: 'batch', v: 1, active: 0, style: { slot: 1.6 }, cards: [{ t: 'Hi 🙂' }] });
    await page.waitForFunction(() => __tt.S.text === 'Hi 🙂');
    const f = await facts(page);
    expect(f.slots[0].w).toBeCloseTo(1.6 * f.size, 6);
    await setScale(page, 'sx', 50);                                                              // Scale is a percent of that standard slot
    expect((await facts(page)).slots[0].w).toBeCloseTo(0.8 * f.size, 6);
  });
});
