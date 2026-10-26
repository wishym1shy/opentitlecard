const { test, expect, setText, settle } = require('./helpers');

// Premiere-style X/Y controls for each line's text nudge (issue #4).
const slider = (page, line, axis) => page.locator(`#nudges input[data-slider="${axis}"][data-line="${line}"]`);
const number = (page, line, axis) => page.locator(`#nudges input[data-i="${line}"][data-a="${axis}"]`);
const scrubber = (page, line, axis) => page.locator(`#nudges [data-scrub="${axis}"][data-line="${line}"]`);
const nudge = (page, i) => page.evaluate((i) => ({ ...__tt.S.nudges[i] }), i);

// Mouse drags use raw coordinates, so the control is scrolled into view first (the sidebar can be taller than the window).
async function centerOf(loc) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
}

test.describe('line nudge sliders', () => {
  test('every line has an X and a Y slider resting at the exact middle', async ({ app: { page } }) => {
    await setText(page, 'First line\nSecond');
    await expect(page.locator('#nudges .nudge')).toHaveCount(2);
    for (const line of [0, 1]) for (const axis of ['x', 'y']) {
      const s = slider(page, line, axis);
      await expect(s).toHaveAttribute('min', '-200');
      await expect(s).toHaveAttribute('max', '200');
      await expect(s).toHaveValue('0'); // value 0 of a symmetric range = middle of the track
      await expect(s).toHaveAttribute('aria-label', `Line ${line + 1} ${axis.toUpperCase()} offset`);
    }
  });

  test('left of centre is negative, right is positive (keyboard)', async ({ app: { page } }) => {
    await slider(page, 0, 'x').focus();
    await page.keyboard.press('ArrowRight');
    expect((await nudge(page, 0)).x).toBe(1);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    expect((await nudge(page, 0)).x).toBe(-1); // steps of 1, and it can cross zero both ways
    await slider(page, 0, 'y').focus();
    await page.keyboard.press('ArrowRight');
    expect((await nudge(page, 0)).y).toBe(1);
    await settle(page);
    expect(await page.evaluate(() => __tt.L.lines[0].ny)).toBeGreaterThan(0); // +Y moves the text down, like Premiere
  });

  test('dragging the thumb left gives a negative value, right a positive one, live in the preview', async ({ app: { page } }) => {
    const s = slider(page, 0, 'x');
    const c = await centerOf(s);
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    await page.mouse.move(c.x - c.w * 0.25, c.y, { steps: 6 });
    const during = await nudge(page, 0); // still mouse-down: the preview already follows
    expect(during.x).toBeLessThan(-20);
    await page.mouse.up();
    await expect(number(page, 0, 'x')).toHaveValue(String(during.x));
    await settle(page);
    expect(await page.evaluate(() => __tt.L.lines[0].nx)).toBe(during.x);
    // and to the right of centre
    const c2 = await centerOf(s);
    await page.mouse.move(c2.x, c2.y); await page.mouse.down();
    await page.mouse.move(c2.x + c2.w * 0.4, c2.y, { steps: 6 }); await page.mouse.up();
    expect((await nudge(page, 0)).x).toBeGreaterThan(0);
  });

  test('a small drag near the centre snaps to exactly 0', async ({ app: { page } }) => {
    const s = slider(page, 0, 'x');
    const c = await centerOf(s);
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    await page.mouse.move(c.x + 1, c.y); await page.mouse.up(); // 1px is a few units on this short track, still inside the 2 px detent
    expect((await nudge(page, 0)).x).toBe(0);
    await expect(s).toHaveValue('0');
  });

  test('the slider and the number field stay in sync both ways', async ({ app: { page } }) => {
    await page.fill('#nudges input[data-i="0"][data-a="y"]', '75');
    await expect(slider(page, 0, 'y')).toHaveValue('75');
    await slider(page, 0, 'y').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(number(page, 0, 'y')).toHaveValue('74');
    // programmatic / preview changes (Alt-drag uses the same state) show up in the sliders too
    await page.evaluate(() => { __tt.S.nudges[0] = { x: 25, y: -5 }; __tt.renderNow(); });
    await expect(slider(page, 0, 'x')).toHaveValue('25');
    await expect(slider(page, 0, 'y')).toHaveValue('-5');
  });

  test('typing past the slider range keeps the real value; the slider pins to its end', async ({ app: { page } }) => {
    await page.fill('#nudges input[data-i="0"][data-a="x"]', '350');
    await expect(slider(page, 0, 'x')).toHaveValue('200');
    await expect(number(page, 0, 'x')).toHaveValue('350');
    expect((await nudge(page, 0)).x).toBe(350);
    await page.fill('#nudges input[data-i="0"][data-a="x"]', '-999');
    await expect(slider(page, 0, 'x')).toHaveValue('-200');
    expect((await nudge(page, 0)).x).toBe(-999);
  });

  test('double-click resets that axis only, and the thumb returns to the exact middle', async ({ app: { page } }) => {
    await page.fill('#nudges input[data-i="0"][data-a="x"]', '60');
    await page.fill('#nudges input[data-i="0"][data-a="y"]', '-30');
    await slider(page, 0, 'x').dblclick();
    expect(await nudge(page, 0)).toEqual({ x: 0, y: -30 });
    await expect(slider(page, 0, 'x')).toHaveValue('0');
    await scrubber(page, 0, 'y').dblclick();
    expect(await nudge(page, 0)).toEqual({ x: 0, y: 0 });
    await expect(slider(page, 0, 'y')).toHaveValue('0');
  });

  test('Shift+Arrow on a slider steps by 10', async ({ app: { page } }) => {
    await slider(page, 0, 'x').focus();
    await page.keyboard.press('Shift+ArrowRight');
    expect((await nudge(page, 0)).x).toBe(10);
    await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
    expect((await nudge(page, 0)).x).toBe(-10);
  });

  test('dragging the X/Y label scrubs the value; Shift scrubs 10x faster', async ({ app: { page } }) => {
    const c = await centerOf(scrubber(page, 0, 'x'));
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    await page.mouse.move(c.x + 30, c.y, { steps: 5 });
    expect((await nudge(page, 0)).x).toBe(30);
    await page.keyboard.down('Shift');
    await page.mouse.move(c.x + 35, c.y, { steps: 1 }); // +5px at 10x = +50
    await page.keyboard.up('Shift');
    await page.mouse.up();
    expect((await nudge(page, 0)).x).toBe(80);
    await expect(slider(page, 0, 'x')).toHaveValue('80');
    await expect(number(page, 0, 'x')).toHaveValue('80');
  });

  test('sliders move only the text, never the box', async ({ app: { page } }) => {
    await setText(page, 'One\nTwo words');
    const before = await settle(page);
    await slider(page, 1, 'x').focus();
    for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight');
    const after = await settle(page);
    expect(after.lines[1].nx).toBe(25);
    expect([after.cardW, after.cardH]).toEqual([before.cardW, before.cardH]);
    expect(after.lines.map((l) => [l.x0, l.x1, l.y0, l.y1])).toEqual(before.lines.map((l) => [l.x0, l.x1, l.y0, l.y1]));
  });

  test('rows and sliders follow the line count and keep each line\'s value', async ({ app: { page } }) => {
    await setText(page, 'a\nb');
    await page.fill('#nudges input[data-i="0"][data-a="x"]', '30');
    await setText(page, 'a\nb\nc');
    await expect(page.locator('#nudges input[data-slider]')).toHaveCount(6);
    await expect(slider(page, 0, 'x')).toHaveValue('30');
    await expect(slider(page, 2, 'y')).toHaveValue('0');
    await setText(page, 'a');
    await expect(page.locator('#nudges input[data-slider]')).toHaveCount(2);
  });

  test('the reset button still zeroes both axes and both controls', async ({ app: { page } }) => {
    await page.fill('#nudges input[data-i="0"][data-a="x"]', '30');
    await page.fill('#nudges input[data-i="0"][data-a="y"]', '-30');
    await page.click('#nudges [data-reset="0"]');
    expect(await nudge(page, 0)).toEqual({ x: 0, y: 0 });
    await expect(slider(page, 0, 'x')).toHaveValue('0');
    await expect(slider(page, 0, 'y')).toHaveValue('0');
    await expect(number(page, 0, 'x')).toHaveValue('0');
  });
});
