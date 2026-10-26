const { test, expect } = require('./helpers');

// The app icon (browser tab, bookmarks, home screens) is inline like everything else: no file, no request.
const decode = (page, sel) => page.evaluate(async (sel) => {
  const href = document.querySelector(sel).getAttribute('href');
  const img = new Image(); img.src = href; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 64);
  const px = (a, b) => Array.from(x.getImageData(a, b, 1, 1).data);
  return { href: href.slice(0, 22), w: img.naturalWidth, h: img.naturalHeight, corner: px(1, 1), letter: px(13, 37), back: px(24, 37) };
}, sel);

test.describe('app icon', () => {
  test.use({ expandUi: false });

  test('the tab icon is an inline SVG: a rounded square (clear corners) with white letters on a colored background', async ({ app: { page } }) => {
    const r = await decode(page, 'link[rel="icon"][type="image/svg+xml"]');
    expect(r.href).toBe('data:image/svg+xml,%3C');
    expect(r.corner[3]).toBe(0);                                   // the rounded corner is see-through
    expect(r.letter.slice(0, 3).every((v) => v > 240)).toBe(true); // the left stroke of the O is white
    expect(r.back[3]).toBe(255);                                   // inside the O: the gradient, opaque…
    expect(Math.max(...r.back.slice(0, 3)) - Math.min(...r.back.slice(0, 3))).toBeGreaterThan(60); // …and colored, not grey
  });

  test('bookmarks and home screens get a 180 × 180 PNG, full-bleed (iOS rounds it)', async ({ app: { page } }) => {
    const r = await decode(page, 'link[rel="apple-touch-icon"]');
    expect(r.href).toBe('data:image/png;base64,');
    expect([r.w, r.h]).toEqual([180, 180]);
    expect(r.corner[3]).toBe(255);
  });
});
