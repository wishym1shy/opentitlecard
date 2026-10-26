const { test, expect, setText, settle, setRange, exportPng, inspectPng } = require('./helpers');

// Box geometry is calibrated against reference cards (see CLAUDE.md "Calibration").
// These tests pin the *rules*, not specific pixel values, so they hold for any font.

test.describe('background box geometry', () => {
  test('every line box spans cap line - topPad to baseline + botPad for a flat-bottomed line', async ({ app: { page } }) => {
    await setText(page, 'HEH');
    const L = await settle(page);
    const l = L.lines[0];
    expect(l.base - l.y0).toBeCloseTo(L.capH + 0.44 * L.size, 3); // top margin
    expect(l.y1 - l.base).toBeCloseTo(0.49 * L.size, 3);           // bottom margin
  });

  test('line boxes overlap their neighbours (pitch is shorter than box height)', async ({ app: { page } }) => {
    await setText(page, 'Hello\nWorld');
    const L = await settle(page);
    expect(L.lines[1].y0).toBeLessThan(L.lines[0].y1);
    expect(L.lines[1].base - L.lines[0].base).toBeCloseTo(1.25 * L.size, 3);
  });

  test('the card is vertically centred on its own bounds', async ({ app: { page } }) => {
    await setText(page, 'Hello\nWorld\nagain');
    const L = await settle(page);
    const top = L.lines[0].y0, bottom = L.lines[L.lines.length - 1].y1;
    expect((top + bottom) / 2).toBeCloseTo(0, 6);
    expect(L.cardH).toBeCloseTo(bottom - top, 6);
  });

  test('descenders keep the clearance: a deeper "clearance" setting grows the box under g/y/p/q', async ({ app: { page } }) => {
    await setText(page, 'gypq');
    await setRange(page, 'clear', 0.1);
    const small = (await settle(page)).lines[0];
    await setRange(page, 'clear', 0.5);
    const big = await settle(page);
    const l = big.lines[0];
    expect(l.below).toBeGreaterThan(0.1 * big.size);          // g/y/p/q really descend
    expect(l.y1).toBeGreaterThan(small.y1);                    // box grew
    expect(l.y1 - (l.base + l.below)).toBeGreaterThanOrEqual(0.5 * big.size - 0.01); // clearance honoured
  });

  test('a line with no descenders is NOT affected by the clearance setting', async ({ app: { page } }) => {
    await setText(page, 'HEH');
    await setRange(page, 'clear', 0.1);
    const a = (await settle(page)).lines[0];
    await setRange(page, 'clear', 0.3);
    const b = (await settle(page)).lines[0];
    expect(b.y1 - b.base).toBeCloseTo(a.y1 - a.base, 6);
  });

  test('regression: descenders never touch the bottom edge in the exported PNG', async ({ app: { page } }) => {
    await setText(page, 'gypq');
    await setRange(page, 'clear', 0.5); // deliberately demanding so the growth path is exercised
    const L = await settle(page);
    const { buffer } = await exportPng(page);
    const g = await page.evaluate(() => __tt.exportGeometry());
    const x0 = Math.round(g.cx - (L.lines[0].w / 2) * g.u), x1 = Math.round(g.cx + (L.lines[0].w / 2) * g.u);
    const { results } = await inspectPng(page, buffer, [{ type: 'colBox', x: Math.round(g.cx) }, { type: 'lowestDark', x0, x1 }]);
    const [box, lowestInk] = results;
    expect(lowestInk).toBeGreaterThan(0);
    expect(box.bottom - lowestInk).toBeGreaterThanOrEqual(0.5 * L.size * g.u * 0.9);
  });

  test('a wider line below steps OUT at its own top; a narrower line below steps IN at the upper box bottom', async ({ app: { page } }) => {
    await setText(page, 'Hi\nA much wider second line');
    const wider = await settle(page);
    expect(wider.lines[1].x1).toBeGreaterThan(wider.lines[0].x1);
    await setText(page, 'A much wider first line\nHi');
    const narrower = await settle(page);
    expect(narrower.lines[1].x1).toBeLessThan(narrower.lines[0].x1);
  });

  test('near-equal line widths snap together so the box has no tiny steps', async ({ app: { page } }) => {
    await setText(page, 'Hello\nHellp'); // same width within 0.3em
    const L = await settle(page);
    expect(L.lines[0].x1).toBeCloseTo(L.lines[1].x1, 6);
  });

  test('alignment: left aligns box left edges, right aligns right edges', async ({ app: { page } }) => {
    await setText(page, 'Short\nA much longer line here');
    await page.check('#align input[value="left"]');
    let L = await settle(page);
    expect(L.lines[0].x0).toBeCloseTo(L.lines[1].x0, 6);
    await page.check('#align input[value="right"]');
    L = await settle(page);
    expect(L.lines[0].x1).toBeCloseTo(L.lines[1].x1, 6);
  });

  test('blank lines are ignored by the layout', async ({ app: { page } }) => {
    await setText(page, 'One\n\n   \nTwo');
    expect((await settle(page)).lines).toHaveLength(2);
  });
});
