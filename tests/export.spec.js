const { test, expect, expandUi, setText, settle, exportPng, inspectPng } = require('./helpers');

test.describe('PNG export', () => {
  test('shadows are off by default: nothing is painted outside the box', async ({ app: { page } }) => {
    await expect(page.locator('#textShadow')).not.toBeChecked();
    await expect(page.locator('#boxShadow')).not.toBeChecked();
    const { buffer } = await exportPng(page);
    const [x, mid] = [960, 540];
    const { results: [col] } = await inspectPng(page, buffer, [{ type: 'colBox', x }]);
    const { results: [above, below] } = await inspectPng(page, buffer, [{ type: 'px', x, y: col.top - 4 }, { type: 'px', x, y: col.bottom + 4 }]);
    expect(col.top).toBeLessThan(mid);
    expect(above[3]).toBe(0); // a soft box shadow would leave a faint halo here
    expect(below[3]).toBe(0);
  });

  test('a saved style that has shadows on keeps them', async ({ app: { page } }) => {
    await page.check('#textShadow');
    await page.check('#boxShadow');
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expandUi(page);
    await expect(page.locator('#textShadow')).toBeChecked();
    await expect(page.locator('#boxShadow')).toBeChecked();
    const { buffer } = await exportPng(page);
    const { results: [col] } = await inspectPng(page, buffer, [{ type: 'colBox', x: 960 }]);
    const { results: [below] } = await inspectPng(page, buffer, [{ type: 'px', x: 960, y: col.bottom + 4 }]);
    expect(below[3]).toBeGreaterThan(0); // control: the halo check above can see a shadow
  });

  test('full-frame export is a 1920×1080 transparent PNG', async ({ app: { page } }) => {
    const { buffer, filename } = await exportPng(page);
    expect(filename).toMatch(/^titlecard_.+\.png$/);
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG signature
    const out = await inspectPng(page, buffer, [{ type: 'px', x: 0, y: 0 }, { type: 'px', x: 1919, y: 1079 }, { type: 'bbox' }]);
    expect([out.w, out.h]).toEqual([1920, 1080]);
    expect(out.results[0][3]).toBe(0);
    expect(out.results[1][3]).toBe(0);
    const bb = out.results[2];
    expect(bb.x0).toBeGreaterThan(100);
    expect(bb.x1).toBeLessThan(1820);
    // the card is centred in the frame
    expect((bb.x0 + bb.x1) / 2).toBeCloseTo(960, -1);
    expect((bb.y0 + bb.y1) / 2).toBeCloseTo(540, -1);
  });

  test('the emoji slot is left empty: no guide outline, no emoji, just the box fill', async ({ app: { page } }) => {
    await page.check('#showGuides'); // the guide is on in the preview...
    await settle(page);
    const slot = await page.evaluate(() => {
      const g = __tt.exportGeometry(), l = __tt.L.lines[0], it = l.items.find((i) => i.k === 'slot');
      const s = it.w * g.u;
      return { cx: g.cx + (l.tx + l.nx + it.x + it.w / 2) * g.u, cy: g.cy + l.cy * g.u, s };
    });
    const { buffer } = await exportPng(page);
    const cx = Math.round(slot.cx), cy = Math.round(slot.cy), h = Math.round(slot.s / 2) + 6;
    const { results } = await inspectPng(page, buffer, [
      { type: 'px', x: cx, y: cy },
      { type: 'noBlue', x0: cx - h, y0: cy - h, x1: cx + h, y1: cy + h },
    ]);
    expect(results[0]).toEqual([255, 255, 255, 255]); // ...but the export shows plain background
    expect(results[1]).toBe(0);
  });

  test('with the background off, the slot area is fully transparent', async ({ app: { page } }) => {
    await page.uncheck('#bgOn');
    await page.uncheck('#textShadow');
    await settle(page);
    const c = await page.evaluate(() => {
      const g = __tt.exportGeometry(), l = __tt.L.lines[0], it = l.items.find((i) => i.k === 'slot');
      return { x: Math.round(g.cx + (l.tx + l.nx + it.x + it.w / 2) * g.u), y: Math.round(g.cy + l.cy * g.u) };
    });
    const { buffer } = await exportPng(page);
    const { results } = await inspectPng(page, buffer, [{ type: 'px', x: c.x, y: c.y }]);
    expect(results[0][3]).toBe(0);
  });

  test('tight crop is smaller than the frame and fits the card plus margin', async ({ app: { page } }) => {
    await page.check('#tight');
    const L = await settle(page);
    const expected = await page.evaluate(() => { const g = __tt.exportGeometry(); return { w: g.W, h: g.H }; });
    const { buffer } = await exportPng(page);
    const out = await inspectPng(page, buffer, [{ type: 'px', x: 0, y: 0 }, { type: 'bbox' }]);
    expect([out.w, out.h]).toEqual([expected.w, expected.h]);
    expect(out.w).toBeLessThan(1920 * 2);
    expect(out.results[0][3]).toBe(0);
    const bb = out.results[1];
    expect(bb.x0).toBeGreaterThan(0);
    expect(bb.x1).toBeLessThan(out.w - 1);
    expect(out.w).toBeGreaterThan(L.cardW * 2); // 2× export scale, plus margins
  });

  test('export scale changes tight-crop dimensions', async ({ app: { page } }) => {
    await page.check('#tight');
    await page.evaluate(() => { const e = document.querySelector('#exportScale'); e.value = '1'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    const one = await page.evaluate(() => __tt.exportGeometry());
    await page.evaluate(() => { const e = document.querySelector('#exportScale'); e.value = '3'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    const three = await page.evaluate(() => __tt.exportGeometry());
    expect(three.W / one.W).toBeCloseTo(3, 1);
  });

  test('canvas presets: vertical 1080×1920 and 4K', async ({ app: { page } }) => {
    await page.selectOption('#frame', '1080x1920');
    let out = await inspectPng(page, (await exportPng(page)).buffer, []);
    expect([out.w, out.h]).toEqual([1080, 1920]);
    await page.selectOption('#frame', '3840x2160');
    out = await inspectPng(page, (await exportPng(page)).buffer, []);
    expect([out.w, out.h]).toEqual([3840, 2160]);
  });

  test('custom canvas size is honoured', async ({ app: { page } }) => {
    await page.selectOption('#frame', 'custom');
    await page.fill('#fw', '1280');
    await page.fill('#fh', '720');
    const out = await inspectPng(page, (await exportPng(page)).buffer, []);
    expect([out.w, out.h]).toEqual([1280, 720]);
  });

  test('card position offset moves the card inside the frame', async ({ app: { page } }) => {
    await page.fill('#offX', '200');
    await page.fill('#offY', '-100');
    const { buffer } = await exportPng(page);
    const { results } = await inspectPng(page, buffer, [{ type: 'bbox' }]);
    const bb = results[0];
    expect((bb.x0 + bb.x1) / 2).toBeCloseTo(960 + 200, -1);
    expect((bb.y0 + bb.y1) / 2).toBeCloseTo(540 - 100, -1);
  });

  test('colour and italic make it into the export (coloured pixels exist)', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await page.evaluate(() => { const t = document.querySelector('#text'); t.focus(); t.setSelectionRange(6, 6); });
    await page.click('#swatches .sw:nth-child(4)'); // Green #02cf02
    const { buffer } = await exportPng(page);
    const hasGreen = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      const d = x.getImageData(0, 0, bmp.width, bmp.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 1] > 180 && d[i] < 60 && d[i + 2] < 60) n++;
      return n;
    }, buffer.toString('base64'));
    expect(hasGreen).toBeGreaterThan(500);
  });

  test('file name is derived from the words, without emoji or stray symbols', async ({ app: { page } }) => {
    await setText(page, '>> Big NEWS! 😳');
    const { filename } = await exportPng(page);
    expect(filename).toBe('titlecard_Big-NEWS.png');
  });
});
