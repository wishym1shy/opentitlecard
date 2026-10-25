const { test, expect, setText, settle, setRange, setSelection, addCard, exportPng, inspectPng } = require('./helpers');

// Every slider in these panels must have a reset button, including any added later.
const SECTIONS = ['Text Settings', 'Background'];
const sliderIds = (page) => page.evaluate((names) => [...document.querySelectorAll('details')]
  .filter((d) => names.includes(d.querySelector('summary').textContent.trim()))
  .flatMap((d) => [...d.querySelectorAll('input[type=range]')].map((r) => r.id)), SECTIONS);

test.describe('slider reset buttons', () => {
  test('every Text Settings and Background slider has one, and it puts the slider back to its default', async ({ app: { page } }) => {
    const ids = await sliderIds(page);
    expect(ids.length).toBeGreaterThanOrEqual(11);
    for (const id of ids) {
      const btn = page.locator(`button[data-reset-key="${id}"]`);
      await expect(btn, id).toHaveCount(1);
      await expect(btn, `${id} starts at its default`).toBeDisabled();
      const { def, min, max, label } = await page.evaluate((id) => {
        const el = document.querySelector('#' + id);
        return { def: +el.value, min: +el.min, max: +el.max, label: document.querySelector('#v_' + id).textContent };
      }, id);
      await setRange(page, id, def === max ? min : max);
      await expect(btn, id).toBeEnabled();
      await btn.click();
      await settle(page);
      expect(await page.evaluate((id) => __tt.S[id], id), id).toBe(def);
      await expect(page.locator('#v_' + id), id).toHaveText(label);
      await expect(btn, id).toBeDisabled();
      expect(await page.evaluate((id) => JSON.parse(localStorage.getItem('opentitlecard.style'))[id], id), `${id} saved`).toBe(def);
    }
  });

  test('buttons are named for screen readers and say what the default is', async ({ app: { page } }) => {
    await expect(page.locator('button[data-reset-key="size"]')).toHaveAttribute('aria-label', 'Reset Size');
    await expect(page.locator('button[data-reset-key="size"]')).toHaveAttribute('title', /default \(100 px\)/);
    await expect(page.locator('button[data-reset-key="wrap"]')).toHaveAttribute('title', /default \(Off\)/);
  });

  test('double-clicking a slider resets it too', async ({ app: { page } }) => {
    await setRange(page, 'radius', 0.4);
    await page.dblclick('#radius');
    await settle(page);
    expect(await page.evaluate(() => __tt.S.radius)).toBe(0.17);
  });

  test('on a card with its own style, reset changes only that card', async ({ app: { page } }) => {
    await setText(page, 'One');
    await setRange(page, 'size', 140); // shared style
    await addCard(page, 'Two');
    await page.check('#cardOwn');
    await page.click('button[data-reset-key="size"]');
    await settle(page);
    expect(await page.evaluate(() => __tt.S.size)).toBe(100);
    await page.click('#cardList [data-card="0"]');
    await settle(page);
    expect(await page.evaluate(() => __tt.S.size)).toBe(140);
  });
});

test.describe('stretch and squish', () => {
  const line = (L, i = 0) => L.lines[i];

  test('width stretch scales the letters and word boxes, and the box grows around them with the same padding', async ({ app: { page } }) => {
    await setText(page, 'HHHH NEWS');
    const a = await settle(page);
    await setRange(page, 'stretchX', 150);
    const b = await settle(page);
    expect(line(b).w).toBeCloseTo(line(a).w * 1.5, 0);
    expect(line(b).x1 - line(b).x0).toBeCloseTo(line(a).w * 1.5 + 2 * b.padX, 0);
    expect(line(b).tx - line(b).x0).toBeCloseTo(b.padX, 3);                    // side padding unchanged
    const last = line(b).words[line(b).words.length - 1];
    expect(last.x1).toBeCloseTo(line(b).w, 0);                                  // click targets follow the letters
    expect([b.capH, line(b).y0, line(b).y1]).toEqual([a.capH, line(a).y0, line(a).y1]); // height untouched
  });

  test('height stretch raises the cap line; margins stay in em and stacked boxes keep their overlap', async ({ app: { page } }) => {
    await setText(page, 'HHHH\nHHHH');
    const a = await settle(page);
    await setRange(page, 'stretchY', 150);
    const b = await settle(page);
    const top = (L) => line(L).base - line(L).y0, pitch = (L) => line(L, 1).base - line(L, 0).base;
    const overlap = (L) => line(L, 0).y1 - line(L, 1).y0;
    expect(b.capH).toBeCloseTo(a.capH * 1.5, 3);
    expect(top(b)).toBeCloseTo(b.capH + 0.44 * b.size, 3);                       // topPad above the (stretched) cap line
    expect(pitch(b)).toBeCloseTo(pitch(a) + a.capH * 0.5, 3);
    expect(overlap(b)).toBeCloseTo(overlap(a), 3);
    expect(line(b).w).toBeCloseTo(line(a).w, 3);                                 // width untouched
  });

  test('the exported letters are stretched by the set amounts', async ({ app: { page } }) => {
    await page.uncheck('#bgOn');
    await page.uncheck('#textShadow');
    await setText(page, 'HHHH');
    const ink = async () => {
      const { buffer } = await exportPng(page);
      const { results: [bb] } = await inspectPng(page, buffer, [{ type: 'bbox' }]);
      return { w: bb.x1 - bb.x0 + 1, h: bb.y1 - bb.y0 + 1 };
    };
    const base = await ink();
    await setRange(page, 'stretchX', 150);
    const wide = await ink();
    expect(Math.abs(wide.w - base.w * 1.5)).toBeLessThanOrEqual(3);
    expect(Math.abs(wide.h - base.h)).toBeLessThanOrEqual(1);
    await page.click('button[data-reset-key="stretchX"]');
    await setRange(page, 'stretchY', 60);
    const flat = await ink();
    expect(Math.abs(flat.h - base.h * 0.6)).toBeLessThanOrEqual(2);
    expect(Math.abs(flat.w - base.w)).toBeLessThanOrEqual(1);
  });

  test('an italic word keeps even gaps to its neighbours when the text is stretched wide', async ({ app: { page } }) => {
    // as in app.spec.js: H has equal side bearings, so the two gaps match when the italic ink is centred
    await page.uncheck('#bgOn');
    await page.uncheck('#textShadow');
    await setText(page, 'HH HHH HH');
    await setSelection(page, 3, 6);
    await page.click('#ital');
    await setRange(page, 'stretchX', 200);
    const { buffer } = await exportPng(page);
    const { results: [runs] } = await inspectPng(page, buffer, [{ type: 'inkRuns', gap: 30 }]);
    expect(runs).toHaveLength(3);
    const gapBefore = runs[1][0] - runs[0][1], gapAfter = runs[2][0] - runs[1][1];
    expect(Math.abs(gapBefore - gapAfter), `gaps ${gapBefore}px / ${gapAfter}px`).toBeLessThanOrEqual(3);
  });

  test('emoji slots keep their size and stay square', async ({ app: { page } }) => {
    await setText(page, 'Hi 😀');
    const slot = (L) => line(L).items.find((i) => i.k === 'slot');
    const a = await settle(page);
    await setRange(page, 'stretchX', 180);
    await setRange(page, 'stretchY', 60);
    const b = await settle(page);
    expect(slot(b).w).toBe(slot(a).w);
    expect(line(b).cy).toBeCloseTo(line(b).base - b.capH / 2, 3);               // centred on the squished letters
  });

  test('auto-wrap measures the stretched width', async ({ app: { page } }) => {
    await setText(page, 'one two three four');
    const full = await settle(page);
    const limit = Math.ceil((line(full).x1 - line(full).x0) / 10) * 10 + 10; // just wider than the unstretched line
    await setRange(page, 'wrap', limit);
    expect((await settle(page)).lines).toHaveLength(1);
    await setRange(page, 'stretchX', 160);
    const b = await settle(page);
    expect(b.lines.length).toBeGreaterThan(1);
    for (const l of b.lines) expect(l.x1 - l.x0).toBeLessThanOrEqual(limit + 0.5);
  });

  test('clicking a stretched word in the preview selects that word', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await setRange(page, 'stretchX', 170);
    await settle(page);
    const pt = await page.evaluate(() => {
      const L = __tt.L, l = L.lines[0], w = l.words[2], g = __tt.exportGeometry(), r = document.querySelector('#cv').getBoundingClientRect();
      const px = g.cx + (l.tx + l.nx + (w.x0 + w.x1) / 2) * g.u, py = g.cy + l.cy * g.u;
      return { x: r.left + px * (r.width / g.W), y: r.top + py * (r.height / g.H), s: w.s, e: w.e };
    });
    await page.mouse.click(pt.x, pt.y);
    expect(await page.evaluate(() => { const t = document.querySelector('#text'); return [t.selectionStart, t.selectionEnd]; })).toEqual([pt.s, pt.e]);
  });

  test('stretch is part of presets, and hand-edited values are kept within 50–200%', async ({ app: { page } }) => {
    await setRange(page, 'stretchX', 130);
    await page.fill('#presetName', 'Wide');
    await page.click('#presetSave');
    await page.click('button[data-reset-key="stretchX"]');
    await page.click('#presetLoad');
    await settle(page);
    expect(await page.evaluate(() => __tt.S.stretchX)).toBe(130);
    const payload = Buffer.from(JSON.stringify({ stretchX: -50, stretchY: 1000 }));
    await page.setInputFiles('#presetFile', { name: 'p.json', mimeType: 'application/json', buffer: payload });
    await page.waitForFunction(() => __tt.S.stretchY === 1000);
    const L = await page.evaluate(() => { __tt.renderNow(); return { sx: __tt.L.sx, sy: __tt.L.sy }; });
    expect(L).toEqual({ sx: 0.5, sy: 2 }); // never mirrored or flattened
  });
});
