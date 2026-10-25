const { test, expect, setText, settle, setRange, setSelection, exportPng, inspectPng } = require('./helpers');

const LONG = 'The quick brown fox jumps over the lazy dog again and again';
const lineText = (l) => l.items.map((i) => (i.k === 't' ? i.text : '⬚')).join('');
const boxW = (l) => l.x1 - l.x0;
// The slider moves in steps of 10, so apply (and return) the snapped value.
async function setWrap(page, v) { const n = Math.max(10, Math.round(v / 10) * 10); await setRange(page, 'wrap', n); return n; }

test.describe('auto-wrap (max card width)', () => {
  test('is off by default: a long line stays on one line', async ({ app: { page } }) => {
    await setText(page, LONG);
    expect(await page.evaluate(() => __tt.S.wrap)).toBe(0);
    expect((await settle(page)).lines).toHaveLength(1);
    await expect(page.locator('#v_wrap')).toHaveText('Off');
  });

  test('wraps at spaces so every box fits the max card width', async ({ app: { page } }) => {
    await setText(page, LONG);
    const full = (await settle(page)).lines[0];
    const limit = await setWrap(page, boxW(full) * 0.45);
    const L = await settle(page);
    expect(L.lines.length).toBeGreaterThan(1);
    for (const l of L.lines) expect(boxW(l)).toBeLessThanOrEqual(limit + 0.05 * L.size);
    await expect(page.locator('#v_wrap')).toHaveText(`${limit} px`);
  });

  test('wrapping never changes the text: same words, same order', async ({ app: { page } }) => {
    await setText(page, LONG);
    const full = (await settle(page)).lines[0];
    await setWrap(page, boxW(full) * 0.4);
    const L = await settle(page);
    expect(L.lines.map(lineText).join(' ')).toBe(LONG);
    expect(await page.evaluate(() => __tt.S.text)).toBe(LONG);
  });

  test('a narrower limit never gives fewer lines; a very wide one gives one', async ({ app: { page } }) => {
    await setText(page, LONG);
    const full = boxW((await settle(page)).lines[0]);
    const counts = [];
    for (const f of [0.9, 0.6, 0.4, 0.25]) { await setWrap(page, Math.round(full * f)); counts.push((await settle(page)).lines.length); }
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    await setRange(page, 'size', 50); // at the default size this sentence is wider than the slider's 1900 max
    await setWrap(page, 1900);
    expect((await settle(page)).lines).toHaveLength(1);
  });

  test('a single word wider than the limit keeps its own line and is never split', async ({ app: { page } }) => {
    const BIG = 'Supercalifragilisticexpialidocious';
    await setText(page, `Hi ${BIG} yo`);
    await setWrap(page, 300);
    const L = await settle(page);
    expect(L.lines.map(lineText)).toEqual(['Hi', BIG, 'yo']);
  });

  test('your own line breaks are kept and each paragraph wraps separately', async ({ app: { page } }) => {
    await setText(page, 'First paragraph is rather long indeed\nShort');
    const first = (await settle(page)).lines[0];
    await setWrap(page, Math.round(boxW(first) * 0.5));
    const L = await settle(page);
    const texts = L.lines.map(lineText);
    expect(texts[texts.length - 1]).toBe('Short');
    expect(texts.slice(0, -1).join(' ')).toBe('First paragraph is rather long indeed');
  });

  test('colour and italic survive wrapping', async ({ app: { page } }) => {
    await setText(page, LONG);
    await page.evaluate(() => {
      const S = __tt.S, k = S.text.indexOf('lazy');
      for (let j = k; j < k + 4; j++) { S.colors[j] = '#ff2d2d'; S.ital[j] = 1; }
    });
    const full = (await settle(page)).lines[0];
    await setWrap(page, boxW(full) * 0.4);
    const runs = await page.evaluate(() => __tt.L.lines.flatMap((l) => l.items.filter((i) => i.k === 't').map((i) => [i.text.trim(), i.c, i.it])));
    expect(runs).toContainEqual(['lazy', '#ff2d2d', 1]);
    expect(runs.filter((r) => r[1] === '#ff2d2d')).toHaveLength(1); // nothing else picked it up
  });

  test('an emoji slot typed right after a word stays glued to it', async ({ app: { page } }) => {
    await setText(page, 'aaaa bbbb cccc dddd eeee😳');
    const full = (await settle(page)).lines[0];
    await setWrap(page, Math.round(boxW(full) * 0.6));
    const L = await settle(page);
    const last = L.lines[L.lines.length - 1];
    expect(lineText(last)).toMatch(/eeee⬚$/);
  });

  test('an emoji slot after a space may wrap onto its own line', async ({ app: { page } }) => {
    await setText(page, 'Supercalifragilisticexpialidocious 😳');
    await setWrap(page, 300);
    const L = await settle(page);
    expect(L.lines).toHaveLength(2);
    expect(L.lines[1].items.some((i) => i.k === 'slot')).toBe(true);
  });

  test('the limit includes the side padding (it is the card width, not the text width)', async ({ app: { page } }) => {
    await setText(page, LONG);
    await setWrap(page, 600);
    const L = await settle(page);
    for (const l of L.lines) expect(l.w + 2 * L.padX).toBeLessThanOrEqual(600 + 0.05 * L.size);
    expect(Math.max(...L.lines.map((l) => l.w))).toBeGreaterThan(600 - 2 * L.padX - 0.9 * L.size); // and it fills the space
  });

  test('line nudge rows follow the wrapped lines', async ({ app: { page } }) => {
    await setText(page, LONG);
    const full = (await settle(page)).lines[0];
    await setWrap(page, boxW(full) * 0.4);
    const n = (await settle(page)).lines.length;
    expect(n).toBeGreaterThan(1);
    await expect(page.locator('#nudges .nudge')).toHaveCount(n);
  });

  test('clicking a word on a wrapped line selects that word', async ({ app: { page } }) => {
    await setText(page, LONG);
    const full = (await settle(page)).lines[0];
    await setWrap(page, boxW(full) * 0.4);
    const target = await page.evaluate(() => {
      const g = __tt.exportGeometry(), l = __tt.L.lines[1], w = l.words[0];
      const r = document.querySelector('#cv').getBoundingClientRect();
      return {
        word: __tt.S.text.slice(w.s, w.e),
        x: r.left + (g.cx + (l.tx + l.nx + (w.x0 + w.x1) / 2) * g.u) * (r.width / g.W),
        y: r.top + (g.cy + l.cy * g.u) * (r.height / g.H),
      };
    });
    await page.mouse.click(target.x, target.y);
    expect(await page.evaluate(() => { const t = document.querySelector('#text'); return t.value.slice(t.selectionStart, t.selectionEnd); })).toBe(target.word);
  });

  test('exported card is no wider than the limit', async ({ app: { page } }) => {
    await setText(page, LONG);
    await setWrap(page, 700);
    const { buffer } = await exportPng(page);
    const { results } = await inspectPng(page, buffer, [{ type: 'bbox' }]);
    expect(results[0].x1 - results[0].x0 + 1).toBeLessThanOrEqual(700 + 4);
  });

  test('the setting is part of presets and persists across reloads', async ({ app: { page } }) => {
    await setWrap(page, 500);
    await page.fill('#presetName', 'wrapped');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#presetExport')]);
    const chunks = []; for await (const c of await dl.createReadStream()) chunks.push(c);
    expect(JSON.parse(Buffer.concat(chunks).toString('utf8')).wrap).toBe(500);
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect(await page.evaluate(() => __tt.S.wrap)).toBe(500);
  });

  test('works with every alignment', async ({ app: { page } }) => {
    await setText(page, LONG);
    const full = boxW((await settle(page)).lines[0]);
    await setWrap(page, Math.round(full * 0.4));
    for (const a of ['left', 'right', 'center']) {
      await page.selectOption('#align', a);
      const L = await settle(page);
      expect(L.lines.length).toBeGreaterThan(1);
      if (a === 'left') for (const l of L.lines) expect(l.x0).toBeCloseTo(L.lines[0].x0, 6);
      if (a === 'right') for (const l of L.lines) expect(l.x1).toBeCloseTo(L.lines[0].x1, 6);
    }
  });
});
