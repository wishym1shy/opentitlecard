const { test, expect, setText, settle, setSelection } = require('./helpers');

// Part-of-a-word selection: the preview highlight shows exactly what a color would change, and clicking a selected word
// again narrows the selection to the part clicked (the "!" of "here!", or "here").

/** Screen position of the middle of character `ci` on line 0 of the preview. */
const charPos = (page, ci) => page.evaluate((ci) => {
  __tt.renderNow();
  const g = __tt.exportGeometry(), l = __tt.L.lines[0], w = l.words.find((w) => ci >= w.s && ci < w.e);
  const r = document.querySelector('#cv').getBoundingClientRect();
  const x = (w.xs[ci - w.s] + w.xs[ci - w.s + 1]) / 2;
  return { x: r.left + (g.cx + (l.tx + l.nx + x) * g.u) * (r.width / g.W), y: r.top + (g.cy + l.cy * g.u) * (r.height / g.H) };
}, ci);
/** Is character `ci` highlighted in the preview? Reads the canvas just above the capitals, inside the highlight band,
 *  at fraction `f` across the character (0.5 = its middle, 0.97 = right by its right edge). */
const lit = (page, ci, f = 0.5) => page.evaluate(([ci, f]) => {
  __tt.renderNow();
  const g = __tt.exportGeometry(), L = __tt.L, l = L.lines[0], cv = document.querySelector('#cv'), k = cv.width / g.W;
  const w = l.words.find((w) => ci >= w.s && ci < w.e), x = w.xs[ci - w.s] + (w.xs[ci - w.s + 1] - w.xs[ci - w.s]) * f;
  const px = (g.cx + (l.tx + l.nx + x) * g.u) * k, py = (g.cy + (l.base - L.capH - L.size * 0.04 + l.ny) * g.u) * k;
  const d = cv.getContext('2d').getImageData(Math.round(px), Math.round(py), 1, 1).data;
  return d[2] > d[0] + 40; // the blue highlight over the white box
}, [ci, f]);
const selected = (page) => page.evaluate(() => { const t = document.querySelector('#text'); return t.value.slice(t.selectionStart, t.selectionEnd); });
async function clickChar(page, ci) { const p = await charPos(page, ci); await page.mouse.click(p.x, p.y); }

const TEXT = 'Big NEWS here!';
const H = TEXT.indexOf('here'), BANG = TEXT.indexOf('!');

test.describe('punctuation and part-of-a-word selection', () => {
  test('selecting just the "!" in the text box highlights just the "!" in the preview', async ({ app: { page } }) => {
    await setText(page, TEXT);
    await setSelection(page, BANG, BANG + 1);
    expect(await lit(page, BANG)).toBe(true);
    expect(await lit(page, H + 3)).toBe(false); // the "e" right next to it…
    expect(await lit(page, H + 3, 0.97)).toBe(false); // …even right at its edge: the highlight doesn't spill onto it
    expect(await lit(page, H)).toBe(false);
    await setSelection(page, H, H + 4);         // just "here": the "!" stays unlit
    expect(await lit(page, H + 3)).toBe(true);
    expect(await lit(page, BANG)).toBe(false);
    await setSelection(page, H + 1);            // a caret still means the whole word, and the highlight says so
    expect(await lit(page, H)).toBe(true);
    expect(await lit(page, BANG)).toBe(true);
  });

  test('click once for the whole word, again on the "!" for just the "!", and again for the whole word', async ({ app: { page } }) => {
    await setText(page, TEXT);
    await clickChar(page, BANG);
    expect(await selected(page)).toBe('here!');
    await clickChar(page, BANG);
    expect(await selected(page)).toBe('!');
    expect(await lit(page, BANG)).toBe(true);
    expect(await lit(page, H + 3)).toBe(false);
    await clickChar(page, BANG);
    expect(await selected(page)).toBe('here!');
    await clickChar(page, H + 1);               // or narrow to the letters
    expect(await selected(page)).toBe('here');
  });

  test('a caret in the word (say, just after typing) still gets the whole word on the first click', async ({ app: { page } }) => {
    await setText(page, TEXT);
    await page.focus('#text'); await page.keyboard.press('End');
    await clickChar(page, BANG);
    expect(await selected(page)).toBe('here!');
  });

  test('after narrowing, a color changes only the "!"', async ({ app: { page } }) => {
    await setText(page, TEXT);
    await clickChar(page, BANG); await page.click('#swatches .sw:nth-child(3)');  // whole word red (it stays selected)
    await clickChar(page, BANG);                                                    // then just the "!"
    expect(await selected(page)).toBe('!');
    await page.click('#swatches .sw:nth-child(2)');                                 // black
    const colors = await page.evaluate(([h, b]) => __tt.S.colors.slice(h, b + 1), [H, BANG]);
    expect(colors).toEqual(['#cf0202', '#cf0202', '#cf0202', '#cf0202', '#000000']);
    await settle(page);
    const runs = await page.evaluate(() => __tt.L.lines[0].items.filter((i) => i.k === 't').map((i) => [i.text, i.c]));
    expect(runs.slice(-2)).toEqual([['here', '#cf0202'], ['!', '#000000']]);
  });

  test('with the "!" already its own color, clicking its left edge still narrows to the "!"', async ({ app: { page } }) => {
    await setText(page, TEXT);
    await setSelection(page, BANG, BANG + 1);
    await page.click('#swatches .sw:nth-child(2)'); // black "!": now two boxes, "here" and "!"
    const edge = async () => { const p = await page.evaluate((ci) => {
      __tt.renderNow();
      const g = __tt.exportGeometry(), l = __tt.L.lines[0], w = l.words.find((w) => ci >= w.s && ci < w.e);
      const r = document.querySelector('#cv').getBoundingClientRect();
      const x = w.xs[0] + (w.xs[1] - w.xs[0]) * 0.12; // the left edge of the "!"
      return { x: r.left + (g.cx + (l.tx + l.nx + x) * g.u) * (r.width / g.W), y: r.top + (g.cy + l.cy * g.u) * (r.height / g.H) };
    }, BANG); await page.mouse.click(p.x, p.y); };
    await edge();
    expect(await selected(page)).toBe('here!');
    await edge();
    expect(await selected(page)).toBe('!');
  });

  test('quotes and apostrophes: “Wow!” splits into “ Wow !”, and don\'t stays one part', async ({ app: { page } }) => {
    const t = '“Wow!” don\'t?';
    await setText(page, t);
    await clickChar(page, 2); await clickChar(page, 2);
    expect(await selected(page)).toBe('Wow');
    await clickChar(page, 0);                             // a click outside the selected part: the whole word again
    expect(await selected(page)).toBe('“Wow!”');
    await clickChar(page, 0);
    expect(await selected(page)).toBe('“');
    const ap = t.indexOf('\'');
    await clickChar(page, ap); await clickChar(page, ap);
    expect(await selected(page)).toBe('don\'t');
    await clickChar(page, t.length - 1); await clickChar(page, t.length - 1);
    expect(await selected(page)).toBe('?');
  });
});
