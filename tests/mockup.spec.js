const { test, expect, APP_URL, setText, setRange, exportPng } = require('./helpers');

const mk = (page) => page.evaluate(() => { __tt.renderNow(); return __tt.mockup; });
const vertical = (page) => page.click('#orient [data-orient="v"]');
// a pixel of the preview canvas, at canvas (export) coordinates
const previewPx = (page, x, y) => page.evaluate(([x, y]) => {
  __tt.renderNow();
  const c = document.querySelector('#cv'), g = __tt.exportGeometry(), k = c.width / g.W;
  return [...c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data];
}, [x, y]);
async function pngFile(page, w, h, color, name = 'frame.png') {
  const b64 = await page.evaluate(([w, h, color]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h, color]);
  return { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
// loads a mock-up image and waits until it is decoded (the panel then shows its name)
async function loadMockup(page, file) {
  await page.setInputFiles('#mkFile', file);
  await expect(page.locator('#mkImgName')).toHaveText(file.name);
}
// a point inside the card's box, in its left padding (no text there), in canvas px
const cardPadding = (page) => page.evaluate(() => {
  __tt.renderNow();
  const g = __tt.exportGeometry(), l = __tt.L.lines[0];
  return [g.cx + (l.x0 + 8) * g.u, g.cy + ((l.y0 + l.y1) / 2) * g.u];
});

test.describe('mock-up background', () => {
  test('the panel is "Mock-up & safe zone", with the mock-up first', async ({ app: { page } }) => {
    await expect(page.locator('#fph_safezone')).toHaveText('Mock-up & safe zone');
    const [mock, safe] = await Promise.all([page.locator('#mkHead').boundingBox(), page.locator('#szHead').boundingBox()]);
    expect(mock.y).toBeLessThan(safe.y);
    expect((await mk(page)).on).toBe(false);
  });

  test('a loaded image turns it on and is drawn behind the card', async ({ app: { page } }) => {
    await vertical(page);
    await setText(page, 'Hi');
    expect(await previewPx(page, 40, 40)).toEqual([0, 0, 0, 0]);
    await loadMockup(page, await pngFile(page, 1080, 1920, '#ff0000'));
    await expect(page.locator('#mkImgName')).toHaveText('frame.png');
    expect(await mk(page)).toMatchObject({ on: true, image: 'frame.png' });
    expect(await previewPx(page, 40, 40)).toEqual([255, 0, 0, 255]);          // the image, around the card
    const box = await previewPx(page, ...(await cardPadding(page)));          // the card's white box, on top
    expect(box).toEqual([255, 255, 255, 255]);
  });

  test('it is never exported', async ({ app: { page } }) => {
    await vertical(page);
    await setText(page, 'Hi');
    const off = (await exportPng(page)).buffer;
    await loadMockup(page, await pngFile(page, 1080, 1920, '#ff0000'));
    const on = (await exportPng(page)).buffer;
    expect(on.equals(off)).toBe(true);
  });

  test('it covers the canvas at 100%, and X / Y / Scale / Opacity move it; ↺ resets', async ({ app: { page } }) => {
    await vertical(page);
    await loadMockup(page, await pngFile(page, 1000, 1000, '#0000ff'));
    expect((await mk(page)).box).toMatchObject({ y: 0, w: 1920, h: 1920 });   // square covers 1080 x 1920 by height
    expect((await mk(page)).box.x).toBeCloseTo((1080 - 1920) / 2, 5);
    await setRange(page, 'mkX', 100);
    await setRange(page, 'mkY', -50);
    await setRange(page, 'mkScale', 50);
    const b = (await mk(page)).box;
    expect(b).toMatchObject({ w: 960, h: 960 });
    expect(b.x).toBeCloseTo(540 + 100 - 480, 5);
    expect(b.y).toBeCloseTo(960 - 50 - 480, 5);
    await expect(page.locator('#v_mkScale')).toHaveText('50%');
    expect(await previewPx(page, 40, 40)).toEqual([0, 0, 0, 0]);              // smaller now: the corner is empty
    await setRange(page, 'mkOpacity', 50);
    const px = await previewPx(page, 200, 500);                               // image, clear of the card
    expect(px[3]).toBeGreaterThan(100); expect(px[3]).toBeLessThan(160);
    for (const k of ['X', 'Y']) await page.dblclick(`[data-view-scrub="mk${k}"]`);   // X / Y: double-click the icon, like the card's position
    for (const k of ['scale', 'opacity']) await page.click(`[data-mk-reset="${k}"]`);
    expect(await mk(page)).toMatchObject({ x: 0, y: 0, scale: 100, opacity: 100 });
    await expect(page.locator('[data-mk-reset="scale"]')).toBeDisabled();
    await expect(page.locator('[data-mk-reset="x"]')).toHaveCount(0);
  });

  test('its fields work like Position & Scale in the sidebar: X | Y, then Scale, then Opacity', async ({ app: { page } }) => {
    const box = (id) => page.locator(id).boundingBox();
    const [x, y, sc, op] = await Promise.all(['#n_mkX', '#n_mkY', '#n_mkScale', '#n_mkOpacity'].map(box));
    expect(Math.abs(x.y - y.y)).toBeLessThan(2); expect(y.x).toBeGreaterThan(x.x);   // X and Y side by side
    expect(sc.y).toBeGreaterThan(x.y); expect(op.y).toBeGreaterThan(sc.y);           // then Scale, then Opacity
    await page.fill('#n_mkScale', '150'); await page.press('#n_mkScale', 'Enter');    // typed
    expect((await mk(page)).scale).toBe(150);
    await page.fill('#n_mkScale', '9999'); await page.press('#n_mkScale', 'Enter');   // clamped to the range
    expect((await mk(page)).scale).toBe(400);
    await page.fill('#n_mkX', '25'); await page.press('#n_mkX', 'Enter');
    await page.press('#n_mkX', 'ArrowUp'); await page.press('#n_mkX', 'Shift+ArrowUp'); // arrows step, Shift = 10
    expect((await mk(page)).x).toBe(36);
    // the panel stack scrolls, and the sticky Export panel covers its bottom edge: bring the icon to the middle
    await page.locator('[data-view-scrub="mkY"]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const h = await box('[data-view-scrub="mkY"]');                                    // scrub: one step per pixel
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 30, h.y + h.height / 2, { steps: 3 }); await page.mouse.up();
    expect((await mk(page)).y).toBe(30);
    await page.dblclick('[data-view-scrub="mkY"]');                                    // double-click: back to 0
    expect((await mk(page)).y).toBe(0);
    await expect(page.locator('[data-mk-reset]')).toHaveCount(2);                      // ↺ for Scale and Opacity only
    await expect(page.locator('#mkX')).toBeHidden();                                   // no slider line on X / Y
    await expect(page.locator('#mkScale')).toBeVisible();
  });

  test('the safe zone is drawn over the mock-up, and each can be on without the other', async ({ app: { page } }) => {
    await vertical(page);
    await loadMockup(page, await pngFile(page, 1080, 1920, '#0000ff'));
    await page.check('#szOn');
    const top = await previewPx(page, 540, 125);                              // the red top bar, over blue
    expect(top[0]).toBeGreaterThan(50);
    await page.uncheck('#mkOn');
    expect((await mk(page)).box).toBeNull();
    expect((await previewPx(page, 100, 700))[2]).toBeLessThan(100);            // safe zone alone: no blue
    await page.check('#mkOn');
    await page.uncheck('#szOn');
    expect(await previewPx(page, 540, 125)).toEqual([0, 0, 255, 255]);        // mock-up alone
  });

  test('a file that is not an image is refused with a message', async ({ app: { page } }) => {
    await page.setInputFiles('#mkFile', { name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await expect(page.locator('#mkStatus')).toContainText("couldn't be read");
    expect((await mk(page)).image).toBeNull();
  });

  test('settings are remembered; the image is not, and the panel says so', async ({ app: { page } }) => {
    await loadMockup(page, await pngFile(page, 100, 100, '#00ff00'));
    await setRange(page, 'mkScale', 80);
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect(await mk(page)).toMatchObject({ on: true, scale: 80, image: null, box: null });
    await expect(page.locator('#mkStatus')).toContainText('Load an image');
    await expect(page.locator('#mkScale')).toHaveValue('80');
  });

  test('a tight crop shows no mock-up and explains why', async ({ app: { page } }) => {
    await loadMockup(page, await pngFile(page, 100, 100, '#00ff00'));
    await page.check('#tight');
    const s = await mk(page);
    expect(s.box).toBeNull();
    expect(s.status).toContain('Tight crop');
  });

  test('the mock-up is not part of the design: not in undo or presets', async ({ app: { page } }) => {
    const h = await page.evaluate(() => __tt.history.length);
    await page.check('#mkOn');
    await setRange(page, 'mkX', 200);
    expect(await page.evaluate(() => __tt.history.length)).toBe(h);
    await page.fill('#presetName', 'P');
    await page.click('#presetSave');
    expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('opentitlecard.presets')).P))).not.toMatch(/mk|mock/i);
  });
});

test('broken saved mock-up settings are ignored or clamped', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('opentitlecard.mockup', JSON.stringify({ on: 'yes', x: 1e9, scale: -5, opacity: 'a' })));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  expect(await page.evaluate(() => { const s = __tt.mockup; return [s.on, s.x, s.scale, s.opacity]; })).toEqual([false, 3840, 10, 100]);
  expect(errors).toEqual([]);
  await context.close();
});
