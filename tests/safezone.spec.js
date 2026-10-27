const { test, expect, APP_URL, setText, settle, setRange, exportPng } = require('./helpers');

const sz = (page) => page.evaluate(() => { __tt.renderNow(); return __tt.safezone; });
const vertical = (page) => page.click('#orient [data-orient="v"]');
// a pixel of the preview canvas, at canvas (export) coordinates
const previewPx = (page, x, y) => page.evaluate(([x, y]) => {
  __tt.renderNow();
  const c = document.querySelector('#cv'), g = __tt.exportGeometry(), k = c.width / g.W;
  return [...c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data];
}, [x, y]);
async function pngFile(page, w, h, color) {
  const b64 = await page.evaluate(([w, h, color]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h, color]);
  return { name: 'my-zone.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

test.describe('safe zone overlay', () => {
  test('off by default; on, it shades the interface red and the safe zone green on the preview', async ({ app: { page } }) => {
    await vertical(page);
    await setText(page, 'Hi');
    expect((await sz(page)).on).toBe(false);
    expect(await previewPx(page, 540, 125)).toEqual([0, 0, 0, 0]); // nothing drawn in the top bar area
    await page.check('#szOn');
    const top = await previewPx(page, 540, 125), mid = await previewPx(page, 100, 700), bottom = await previewPx(page, 540, 1800);
    expect(top[0]).toBeGreaterThan(top[1] + 100); expect(top[3]).toBeGreaterThan(0); // red
    expect(bottom[0]).toBeGreaterThan(bottom[1] + 100);
    expect(mid[1]).toBeGreaterThan(mid[0]); expect(mid[3]).toBeGreaterThan(0);       // green
  });

  test('it is never exported', async ({ app: { page } }) => {
    await vertical(page);
    await setText(page, 'Hi');
    const off = (await exportPng(page)).buffer;
    await page.check('#szOn');
    await page.selectOption('#szKind', 'reels');
    const on = (await exportPng(page)).buffer;
    expect(on.equals(off)).toBe(true);
  });

  test('Stories and Reels use the measured zones, fitted to the canvas', async ({ app: { page } }) => {
    await vertical(page);
    await page.check('#szOn');
    expect((await sz(page)).box).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920, f: 1 }); // 1080 x 1920: exact
    await page.selectOption('#szKind', 'reels');
    const side = await previewPx(page, 980, 1400), leftOfIt = await previewPx(page, 700, 1400);
    expect(side[0]).toBeGreaterThan(side[1] + 100);            // side buttons: red
    expect(leftOfIt[1]).toBeGreaterThan(leftOfIt[0]);          // still safe beside them
    await page.selectOption('#frame', '2160x3840');
    expect((await sz(page)).box).toMatchObject({ x: 0, y: 0, w: 2160, h: 3840, f: 2 }); // 4K vertical: doubled
    await page.click('#orient [data-orient="h"]');             // 3840 x 2160: full height, centred
    const b = (await sz(page)).box;
    expect(b.h).toBeCloseTo(2160, 3); expect(b.w).toBeCloseTo(1215, 3); expect(b.x).toBeCloseTo((3840 - 1215) / 2, 3);
  });

  test('Position X / Y move it and Scale resizes it around the centre; ↺ resets', async ({ app: { page } }) => {
    await vertical(page);
    await page.check('#szOn');
    await setRange(page, 'szX', 100);
    await setRange(page, 'szY', -50);
    await setRange(page, 'szScale', 50);
    const b = (await sz(page)).box;
    expect(b).toMatchObject({ w: 540, h: 960 });
    expect(b.x).toBeCloseTo(540 + 100 - 270, 5);
    expect(b.y).toBeCloseTo(960 - 50 - 480, 5);
    await expect(page.locator('#v_szScale')).toHaveText('50%');
    for (const k of ['x', 'y', 'scale']) await page.click(`[data-sz-reset="${k}"]`);
    expect((await sz(page)).box).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920 });
    await expect(page.locator('[data-sz-reset="x"]')).toBeDisabled();
  });

  test('the verdict sits at the right end of the bottom bar; the panel keeps only notes about the overlay', async ({ app: { page } }) => {
    await vertical(page);
    await setText(page, 'Hi');
    await page.check('#szOn');
    const fit = page.locator('#info #szFit');
    await expect(fit).toHaveText('✓ The card is inside the safe zone.');
    await expect(page.locator('#szStatus')).toHaveText('');
    const [bar, f, stats] = await Promise.all(['#info', '#szFit', '#infoStats'].map((s) => page.locator(s).boundingBox()));
    expect(bar.x + bar.width - (f.x + f.width)).toBeLessThan(20);   // flush right, inside the bar's padding
    expect(Math.abs(f.y - stats.y)).toBeLessThan(4);                 // on the same line as "1 line · card … px"
    await expect(page.locator('#infoStats')).toContainText('1 line');
    await page.fill('#offY', '-850');
    await expect(fit).toHaveText(/^⚠ The card overlaps the top bar/);
    await expect(fit).toHaveClass(/bad/);
    await page.uncheck('#szOn');
    await expect(fit).toHaveText('');
    await expect(page.locator('#infoStats')).toContainText('1 line');   // the card's numbers stay
  });

  test('the panel says whether the card is clear of the interface', async ({ app: { page } }) => {
    await vertical(page);
    await setText(page, 'Hi');
    await page.check('#szOn');
    expect((await sz(page)).fit).toContain('inside the safe zone');
    await page.fill('#offY', '-850'); // up into the top bar
    expect((await sz(page)).fit).toContain('overlaps the top bar');
    await page.fill('#offY', '500');
    await page.fill('#offX', '350');
    await page.selectOption('#szKind', 'reels');
    expect((await sz(page)).fit).toContain('side buttons');
    await page.fill('#offX', '0'); await page.fill('#offY', '0');
    await setText(page, 'A line far too wide for a vertical frame');
    expect((await sz(page)).fit).toContain('goes past the edge');
  });

  test('your own image is drawn in its place, fitted, moved and scaled the same way', async ({ app: { page } }) => {
    await vertical(page);
    await page.selectOption('#szKind', 'image');
    await expect(page.locator('#szImageRow')).toBeVisible();
    await page.setInputFiles('#szFile', await pngFile(page, 540, 960, '#0000ff'));
    await expect(page.locator('#szImgName')).toHaveText('my-zone.png');
    const s = await sz(page);
    expect(s).toMatchObject({ on: true, kind: 'image' });
    expect(s.box).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920 }); // 540 x 960 fitted to the canvas
    const px = await previewPx(page, 100, 100);
    expect(px[2]).toBeGreaterThan(200); expect(px[0]).toBeLessThan(50);
    await setRange(page, 'szOpacity', 50);
    expect((await previewPx(page, 100, 100))[3]).toBeLessThan(160);
  });

  test('a file that is not an image is refused with a message', async ({ app: { page } }) => {
    await page.selectOption('#szKind', 'image');
    await page.setInputFiles('#szFile', { name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await expect(page.locator('#szStatus')).toContainText("couldn't be read");
  });

  test('settings are remembered; the image is not, and the panel says so', async ({ app: { page } }) => {
    await vertical(page);
    await page.setInputFiles('#szFile', await pngFile(page, 100, 100, '#00ff00'));
    await setRange(page, 'szScale', 80);
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    const s = await sz(page);
    expect(s).toMatchObject({ on: true, kind: 'image', scale: 80, box: null });
    await expect(page.locator('#szStatus')).toContainText('Load an image');
    await expect(page.locator('#szScale')).toHaveValue('80');
  });

  test('a tight crop shows no overlay and explains why', async ({ app: { page } }) => {
    await page.check('#szOn');
    await page.check('#tight');
    const s = await sz(page);
    expect(s.box).toBeNull();
    expect(s.status).toContain('Tight crop');
  });

  test('the overlay is not part of the design: not in undo or presets', async ({ app: { page } }) => {
    const h = await page.evaluate(() => __tt.history.length);
    await page.check('#szOn');
    await setRange(page, 'szX', 200);
    expect(await page.evaluate(() => __tt.history.length)).toBe(h);
    await page.fill('#presetName', 'P');
    await page.click('#presetSave');
    expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('opentitlecard.presets')).P))).not.toMatch(/sz|safe/i);
  });
});

test.describe('Instagram Reels UI | iPhone 16 Pro', () => {
  const iphone = async (page) => {
    await page.selectOption('#frame', '1206x2622');
    await page.check('#szOn');
    await page.selectOption('#szKind', 'igReels16');
  };

  test('is offered as an overlay and drawn at exactly its size on the iPhone 16 Pro canvas', async ({ app: { page } }) => {
    await expect(page.locator('#szKind option[value="igReels16"]')).toHaveText('Instagram Reels UI | iPhone 16 Pro');
    await iphone(page);
    expect((await sz(page)).box).toMatchObject({ x: 0, y: 0, w: 1206, h: 2622, f: 1 });
    const pill = await previewPx(page, 290, 2466), dot = await previewPx(page, 637, 2490);
    expect(pill[3]).toBe(255); expect(Math.max(...pill.slice(0, 3))).toBeLessThan(70);  // the dark Reels button in the nav bar
    expect(dot[0]).toBeGreaterThan(200); expect(dot[1]).toBeLessThan(120);               // the red new-message dot
    const video = await previewPx(page, 600, 1000);                                      // the 9:16 video area: a neutral tint
    expect(video[3]).toBeGreaterThan(40); expect(video[3]).toBeLessThan(140);
    expect(Math.max(...video.slice(0, 3)) - Math.min(...video.slice(0, 3))).toBeLessThan(8);
  });

  test('marks the 9:16 video area (top of the screen to the nav bar) without tinting the card', async ({ app: { page } }) => {
    await iphone(page);
    await setText(page, 'Hi');
    expect((await previewPx(page, 600, 10))[3]).toBeGreaterThan(40);   // from the very top, under the status bar
    expect((await previewPx(page, 5, 1200))[3]).toBeGreaterThan(40);   // edge to edge: the sides are cropped off-screen
    expect((await previewPx(page, 600, 2370))[3]).toBeGreaterThan(40); // right down to the nav bar (y = 2386)
    expect(await previewPx(page, 600, 2400)).toEqual([0, 0, 0, 0]);    // the nav bar itself isn't video
    const pad = await page.evaluate(() => {                           // the card's box, in its left padding
      __tt.renderNow(); const g = __tt.exportGeometry(), l = __tt.L.lines[0];
      return [g.cx + (l.x0 + 8) * g.u, g.cy + ((l.y0 + l.y1) / 2) * g.u];
    });
    expect(await previewPx(page, ...pad)).toEqual([255, 255, 255, 255]);
  });

  test('says whether the card is clear of the interface', async ({ app: { page } }) => {
    await iphone(page);
    await setText(page, 'Hi');
    expect((await sz(page)).fit).toContain('inside the safe zone');
    await page.fill('#offY', '820'); // down into the bottom of the screen
    expect((await sz(page)).fit).toContain('navigation bar');
    await page.fill('#offY', '-850'); // up into the tabs
    expect((await sz(page)).fit).toContain('top bar');
  });

  test('is never exported, and the choice is remembered', async ({ app: { page } }) => {
    await page.selectOption('#frame', '1206x2622');
    await setText(page, 'Hi');
    const off = (await exportPng(page)).buffer;
    await iphone(page);
    expect((await exportPng(page)).buffer.equals(off)).toBe(true);
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect((await sz(page)).kind).toBe('igReels16');
  });
});

test('broken saved safe zone settings are ignored or clamped', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('opentitlecard.safezone', JSON.stringify({ on: 'yes', kind: '<b>x</b>', x: 1e9, scale: -5, opacity: 'a' })));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  expect(await page.evaluate(() => { const s = __tt.safezone; return [s.on, s.kind, s.x, s.scale, s.opacity]; })).toEqual([false, 'stories', 1920, 10, 100]);
  expect(errors).toEqual([]);
  await context.close();
});
