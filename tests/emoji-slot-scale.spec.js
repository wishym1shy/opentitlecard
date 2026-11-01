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

  /** The red picture's box in the exported PNG (the only red thing on the card), in export px. */
  const redBox = async (page, around) => {   // `around`: the slot's box; only its neighbourhood is scanned (a whole 1920x1080 scan ×5 is slow when the suite is busy)
    const { buffer } = await exportPng(page);
    const win = around ? { x0: Math.max(0, Math.floor(around.x - 400)), x1: Math.ceil(around.x + around.pw + 400), y0: Math.max(0, Math.floor(around.y - 400)), y1: Math.ceil(around.y + around.ph + 400) } : null;
    return page.evaluate(async ({ b64, win }) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const cx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d'); cx.drawImage(bmp, 0, 0);
      const W = bmp.width, H = bmp.height, a = win ? Math.min(win.x0, W - 1) : 0, c = win ? Math.min(win.x1, W) : W, e = win ? Math.min(win.y0, H - 1) : 0, f = win ? Math.min(win.y1, H) : H;
      const d = cx.getImageData(0, 0, W, H).data; let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let y = e; y < f; y++) for (let x = a; x < c; x++) { const i = (y * W + x) * 4; if (d[i] > 180 && d[i + 1] < 80 && d[i + 2] < 80 && d[i + 3] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      return { x0, x1: x1 + 1, y0, y1: y1 + 1 };
    }, { b64: buffer.toString('base64'), win });
  };
  const COMBOS = [[100, 100], [200, 100], [100, 50], [300, 300], [40, 40]];
  async function placeImage(page) {
    await addImage(page);
    await setText(page, 'Hi 🙂');
    const b = (await facts(page)).slots[0];
    await setSelection(page, b.s, b.e); await page.locator('#emGrid .emthumb').click();
  }

  test('the picture is the same size, and centred on the slot, whatever the slot\'s Scale X and Scale Y', async ({ app: { page } }) => {
    test.setTimeout(90000);
    await placeImage(page);
    for (const [sx, sy] of COMBOS) {
      await setScale(page, 'sx', sx); await setScale(page, 'sy', sy);
      const f = await facts(page), b = f.slots[0], base = 1.25 * f.size * f.u;                 // the standard slot, in export px
      const r = await redBox(page, b);
      expect(r.x1 - r.x0, `width at ${sx}/${sy}`).toBeGreaterThan(base - 2); expect(r.x1 - r.x0, `width at ${sx}/${sy}`).toBeLessThan(base + 2);
      expect(r.y1 - r.y0, `height at ${sx}/${sy}`).toBeGreaterThan(base - 2); expect(r.y1 - r.y0, `height at ${sx}/${sy}`).toBeLessThan(base + 2);
      expect((r.x0 + r.x1) / 2, `centre x at ${sx}/${sy}`).toBeCloseTo(b.x + b.pw / 2, -0.3);   // within about 1 px
      expect((r.y0 + r.y1) / 2, `centre y at ${sx}/${sy}`).toBeCloseTo(b.y + b.ph / 2, -0.3);
    }
  });

  test('Size and the X / Y offsets are percents of the standard slot, so they move the picture the same distance at any slot scale', async ({ app: { page } }) => {
    test.setTimeout(90000);
    await placeImage(page);
    for (const [sx, sy] of [[100, 100], [250, 60]]) {
      await setScale(page, 'sx', sx); await setScale(page, 'sy', sy);
      const f = await facts(page), b = f.slots[0], base = 1.25 * f.size * f.u;
      await page.evaluate((s) => { __tt.S.emo[s] = { ...__tt.S.emo[s], x: -20, y: 25, s: 50 }; __tt.renderNow(); }, b.s);
      const r = await redBox(page, b);
      expect(r.x1 - r.x0, `size at ${sx}/${sy}`).toBeGreaterThan(0.5 * base - 2); expect(r.x1 - r.x0, `size at ${sx}/${sy}`).toBeLessThan(0.5 * base + 2);   // Size 50% of the standard picture
      expect((r.x0 + r.x1) / 2 - (b.x + b.pw / 2), `x shift at ${sx}/${sy}`).toBeCloseTo(-0.2 * base, -0.3);                   // 20% of the standard slot, to the left
      expect((r.y0 + r.y1) / 2 - (b.y + b.ph / 2), `y shift at ${sx}/${sy}`).toBeCloseTo(0.25 * base, -0.3);                    // 25% of it, down
      await page.evaluate((s) => { const d = { ...__tt.S.emo[s] }; delete d.x; d.x = 0; d.y = 0; d.s = 100; __tt.S.emo[s] = d; }, b.s);
    }
  });

  test('"Match cap height" and "Sit on baseline" give the same result at any slot scale', async ({ app: { page } }) => {
    await placeImage(page);
    const sizeAfterCap = async () => { const b = (await facts(page)).slots[0]; await setSelection(page, b.s, b.e); await page.click('#anCap'); return (await emo(page, b.s)).s; };
    const baseline = async () => { const b = (await facts(page)).slots[0]; await setSelection(page, b.s, b.e); await page.click('#anBase'); const d = await emo(page, b.s); return [d.s, d.y]; };
    const plain = await sizeAfterCap(), plainBase = await baseline();
    await setScale(page, 'sx', 300); await setScale(page, 'sy', 60);
    expect(await sizeAfterCap()).toBe(plain);
    expect(await baseline()).toEqual(plainBase);
    // and the picture really is as tall as the capitals in the PNG
    await page.evaluate(() => { __tt.S.emo.forEach((d, i) => { if (d) __tt.S.emo[i] = { ...d, y: 0 }; }); });
    const b = (await facts(page)).slots[0]; await setSelection(page, b.s, b.e); await page.click('#anCap');
    const f = await facts(page), r = await redBox(page, f.slots[0]);
    expect(Math.abs(r.y1 - r.y0 - f.capH * f.u)).toBeLessThan(f.capH * f.u * 0.04 + 2);
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
