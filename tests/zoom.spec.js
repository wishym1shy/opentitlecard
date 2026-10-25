const { test, expect, setText, settle } = require('./helpers');

const view = (page) => page.evaluate(() => __tt.view);
const cvBox = (page) => page.locator('#cv').boundingBox();
async function settled(page) { await settle(page); return view(page); }
async function ctrlWheel(page, x, y, dy, times = 1) {
  await page.mouse.move(x, y);
  await page.keyboard.down('Control');
  for (let i = 0; i < times; i++) await page.mouse.wheel(0, dy);
  await page.keyboard.up('Control');
}

test.describe('zoom and pan', () => {
  test('the canvas starts fitted in the view, clear of the panels, never above 100%', async ({ app: { page } }) => {
    const v = await settled(page);
    expect(v.fit).toBe(true);
    expect(v.z).toBeLessThanOrEqual(1);
    const cv = await cvBox(page), panels = await page.locator('#panels').boundingBox(), vw = await page.locator('.view').boundingBox();
    expect(cv.x).toBeGreaterThanOrEqual(vw.x);
    expect(cv.x + cv.width).toBeLessThanOrEqual(panels.x);
    expect(cv.y + cv.height).toBeLessThanOrEqual(vw.y + vw.height);
    await expect(page.locator('#zoomPct')).toHaveText(Math.round(v.z * 100) + '%');
    await expect(page.locator('#zoomFit')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a small canvas is fitted at 100%, not magnified', async ({ app: { page } }) => {
    await setText(page, 'Hi');
    await page.check('#tight');
    await page.evaluate(() => { const e = document.querySelector('#exportScale'); e.value = '1'; e.dispatchEvent(new Event('input')); });
    const v = await settled(page);
    expect(v.W).toBeLessThan(500); // would fit at well over 100%
    expect(v.z).toBe(1);
  });

  test('the buttons zoom in and out, stop at 5% and 400%, and Fit and 100% work', async ({ app: { page } }) => {
    const z0 = (await settled(page)).z;
    await page.click('#zoomIn');
    const z1 = (await settled(page)).z;
    expect(z1).toBeCloseTo(z0 * 1.25, 5);
    await expect(page.locator('#zoomFit')).toHaveAttribute('aria-pressed', 'false');
    expect((await cvBox(page)).width).toBeCloseTo(1920 * z1, 0);
    for (let i = 0; i < 20; i++) await page.click('#zoomIn', { force: true });
    expect((await settled(page)).z).toBe(4);
    await expect(page.locator('#zoomIn')).toBeDisabled();
    for (let i = 0; i < 40; i++) await page.click('#zoomOut', { force: true });
    expect((await settled(page)).z).toBe(0.05);
    await expect(page.locator('#zoomOut')).toBeDisabled();
    await page.click('#zoom100');
    expect((await settled(page)).z).toBe(1);
    expect((await cvBox(page)).width).toBeCloseTo(1920, 0);
    await page.click('#zoomFit');
    expect(await settled(page)).toMatchObject({ fit: true, z: z0 });
  });

  test('Ctrl+scroll zooms around the cursor: the point under it stays put', async ({ app: { page } }) => {
    await settle(page);
    const a = await cvBox(page);
    const x = a.x + a.width * 0.3, y = a.y + a.height * 0.6;
    await ctrlWheel(page, x, y, -100, 3);
    const v = await settled(page), b = await cvBox(page);
    expect(v.z).toBeGreaterThan(0.5);
    expect((x - b.x) / b.width).toBeCloseTo(0.3, 2); // same spot of the canvas under the cursor
    expect((y - b.y) / b.height).toBeCloseTo(0.6, 2);
  });

  test('scrolling pans; Shift+scroll pans sideways', async ({ app: { page } }) => {
    await settle(page);
    const a = await cvBox(page);
    await page.mouse.move(a.x + 50, a.y + 50);
    await page.mouse.wheel(0, 80);
    await settle(page);
    const b = await cvBox(page);
    expect(b.y).toBeCloseTo(a.y - 80, 0);
    expect(b.x).toBeCloseTo(a.x, 0);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 50);
    await page.keyboard.up('Shift');
    const c = await cvBox(page);
    expect(c.x).toBeCloseTo(b.x - 50, 0);
  });

  test('Space+drag and middle-drag pan without selecting or nudging anything', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await page.locator('#text').blur();
    await page.evaluate(() => { window.__cvDowns = 0; document.querySelector('#cv').addEventListener('pointerdown', () => window.__cvDowns++); });
    const a = await cvBox(page);
    const x = a.x + a.width / 2, y = a.y + a.height / 2; // right on the text
    await page.keyboard.down(' ');
    await expect(page.locator('.view')).toHaveClass(/pan/);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 120, y + 40, { steps: 4 }); await page.mouse.up();
    await page.keyboard.up(' ');
    let b = await cvBox(page);
    expect(b.x).toBeCloseTo(a.x + 120, 0);
    expect(b.y).toBeCloseTo(a.y + 40, 0);
    await page.mouse.move(x + 120, y + 40); await page.mouse.down({ button: 'middle' }); await page.mouse.move(x + 60, y + 40, { steps: 4 }); await page.mouse.up({ button: 'middle' });
    b = await cvBox(page);
    expect(b.x).toBeCloseTo(a.x + 60, 0);
    const st = await page.evaluate(() => ({ sel: [document.querySelector('#text').selectionStart, document.querySelector('#text').selectionEnd], n: __tt.S.nudges[0] }));
    expect(st.sel[0]).toBe(st.sel[1]); // no word was selected
    expect(await page.evaluate(() => window.__cvDowns)).toBe(0); // the canvas never saw the press, so it can't start a drag
    expect(st.n ? st.n.x || st.n.y : 0).toBe(0);
  });

  test('Space still types in the text box and presses a focused button', async ({ app: { page } }) => {
    await setText(page, 'Ab');
    await page.focus('#text');
    await page.keyboard.press('End');
    await page.keyboard.press(' ');
    expect(await page.evaluate(() => __tt.S.text)).toBe('Ab ');
    await page.focus('#fph_cards');
    await page.keyboard.press(' ');
    await expect(page.locator('#fph_cards')).toHaveAttribute('aria-expanded', 'false');
  });

  test('Ctrl+= / Ctrl+- zoom and Ctrl+0 fits', async ({ app: { page } }) => {
    const z0 = (await settled(page)).z;
    await page.keyboard.press('Control+=');
    expect((await settled(page)).z).toBeCloseTo(z0 * 1.25, 5);
    await page.keyboard.press('Control+-'); await page.keyboard.press('Control+-');
    expect((await settled(page)).z).toBeCloseTo(z0 / 1.25, 5);
    await page.keyboard.press('Control+0');
    expect(await settled(page)).toMatchObject({ fit: true, z: z0 });
  });

  test('clicking a word still selects it when zoomed in and panned', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await page.click('#zoomIn'); await page.click('#zoomIn');
    await page.mouse.move(600, 400); await page.mouse.wheel(30, 20);
    await settle(page);
    const pt = await page.evaluate(() => {
      const l = __tt.L.lines[0], w = l.words[1], g = __tt.exportGeometry(), r = document.querySelector('#cv').getBoundingClientRect();
      return { x: r.left + (g.cx + (l.tx + (w.x0 + w.x1) / 2) * g.u) * r.width / g.W, y: r.top + (g.cy + l.cy * g.u) * r.height / g.H, s: w.s, e: w.e };
    });
    await page.mouse.click(pt.x, pt.y);
    expect(await page.evaluate(() => [document.querySelector('#text').selectionStart, document.querySelector('#text').selectionEnd])).toEqual([pt.s, pt.e]);
  });

  test('the preview bitmap never exceeds the export size, however far you zoom', async ({ app: { page } }) => {
    await page.selectOption('#frame', '3840x2160');
    for (let i = 0; i < 20; i++) await page.click('#zoomIn', { force: true });
    await settle(page);
    expect(await page.evaluate(() => { const c = document.querySelector('#cv'); return [c.width, c.height]; })).toEqual([3840, 2160]);
  });

  test('panning can never lose the canvas', async ({ app: { page } }) => {
    await settle(page);
    await page.mouse.move(600, 400);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 500);
    const cv = await cvBox(page), vw = await page.locator('.view').boundingBox();
    expect(cv.y + cv.height).toBeGreaterThanOrEqual(vw.y + 60 - 1);
  });

  test('Fit follows a change of canvas size; a zoomed view keeps its centre', async ({ app: { page } }) => {
    await settle(page);
    await page.click('#orient [data-orient="v"]');
    const v = await settled(page), vw = await page.locator('.view').boundingBox(), cv = await cvBox(page);
    expect(v.fit).toBe(true);
    expect(cv.height).toBeLessThanOrEqual(vw.height);
    expect(cv.height).toBeGreaterThan(vw.height * 0.6); // a tall canvas fills the height
    await page.click('#zoomIn');
    const before = await cvBox(page);
    await page.click('#orient [data-orient="h"]');
    await settle(page);
    const after = await cvBox(page);
    expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 0);
    expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2, 0);
  });

  test('nothing about zoom or pan is saved or undoable', async ({ app: { page } }) => {
    const h = await page.evaluate(() => __tt.history.length);
    await page.click('#zoomIn');
    await page.mouse.move(600, 400); await page.mouse.wheel(0, 100);
    expect(await page.evaluate(() => __tt.history.length)).toBe(h);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /zoom|view/i.test(k)))).toEqual([]);
  });
});
