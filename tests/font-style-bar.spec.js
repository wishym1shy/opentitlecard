const fs = require('fs'), path = require('path');
const { test, expect, expandUi, APP_URL, setText, settle, setSelection, addCard, confirmDialog } = require('./helpers');

// The text style bar (Bold, Italic, Underline) above the Font family menu, and the warning for faux styles: a font with no
// italic (or no bolder) face is faked by the browser, so the ⚠ by the bar says so, and a toast tells the user once.
// The shared fixture loads one upright Extra Bold file, which has no italic and no bolder face: a faux font on purpose.

const DIR = path.dirname(require.resolve('@fontsource/inter/files/inter-latin-400-normal.woff'));
const file = (w, style) => path.join(DIR, `inter-latin-${w}-${style}.woff`);
const S = (page, key) => page.evaluate((k) => __tt.S[k].join(''), key);
async function saveSet(page) {
  await page.click('#fileMenuBtn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#batchSave')]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const openSet = async (page, content) => { await page.setInputFiles('#batchFile', { name: 'set.opntcd', mimeType: 'application/json', buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)) }); };
const cardFormats = (page) => page.evaluate(() => { __tt.renderNow(); return __tt.cards.map((c, i) => { const live = i === __tt.active ? __tt.S : c; return { text: live.text, ital: live.ital.join(''), bold: live.bold.join(''), und: live.und.join('') }; }); });
const pressed = (page, id) => page.locator(id).getAttribute('aria-pressed');

test.describe('the style bar', () => {
  test('sits right above the Font family menu, in the Text section, with room under the line above it', async ({ app: { page } }) => {
    for (const id of ['#bold', '#ital', '#und']) await expect(page.locator(id)).toBeVisible();
    const box = (sel) => page.locator(sel).evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    const [bar, label, fontbox] = [await box('#fontStyleBar'), await box('label[for="family"]'), await box('.fontbox')];
    expect(bar.bottom, 'above the label').toBeLessThanOrEqual(label.top);
    expect(label.top - bar.bottom, 'right above it').toBeLessThan(24);
    expect(bar.top - fontbox.top, 'not hard against the section line').toBeGreaterThanOrEqual(10);
    expect(await page.locator('#fontStyleBar').evaluate((e) => e.closest('details > .body').parentElement.querySelector('summary').textContent.trim())).toBe('Text');
    for (const [id, name] of [['#bold', 'Bold'], ['#ital', 'Italic'], ['#und', 'Underline']]) await expect(page.locator(id)).toHaveAttribute('aria-label', name);
    await expect(page.locator('#fontStyleBar')).toHaveAttribute('role', 'toolbar');
  });

  test('each button formats the selected letters, or the word at the caret, and toggles', async ({ app: { page } }) => {
    await setText(page, 'Hello brave world');
    await setSelection(page, 0, 5);
    await page.click('#bold');
    expect(await S(page, 'bold')).toBe('11111000000000000');
    expect(await pressed(page, '#bold')).toBe('true');
    await page.click('#bold');
    expect(await S(page, 'bold')).toBe('00000000000000000');
    expect(await pressed(page, '#bold')).toBe('false');
    await setSelection(page, 8); // a caret inside "brave"
    await page.click('#und');
    expect(await S(page, 'und')).toBe('00000011111000000');
    await page.click('#ital');
    expect(await S(page, 'ital')).toBe('00000011111000000');
    expect(await S(page, 'bold')).toBe('00000000000000000');
  });

  test('the buttons are pressed only while the whole selection has the format, and follow the selection', async ({ app: { page } }) => {
    await setText(page, 'Hello brave world');
    await setSelection(page, 0, 5); await page.click('#bold');
    await setSelection(page, 0, 5); expect(await pressed(page, '#bold')).toBe('true');
    await setSelection(page, 6, 11); await page.evaluate(() => __tt.render()); expect(await pressed(page, '#bold')).toBe('false'); // another word
    await setSelection(page, 0, 11); await page.evaluate(() => __tt.render()); expect(await pressed(page, '#bold')).toBe('false'); // mixed
    await page.click('#bold'); // mixed: puts it on everything
    expect(await S(page, 'bold')).toBe('11111011111000000'); // the space between is left alone
    expect(await pressed(page, '#bold')).toBe('true');
  });

  test('Ctrl+B, Ctrl+I and Ctrl+U in the text box do the same, and Ctrl+U does not open the page source', async ({ app: { page } }) => {
    await setText(page, 'Hello brave world');
    const pages = page.context().pages().length;
    await setSelection(page, 0, 5);
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Control+i');
    await page.keyboard.press('Control+u');
    expect(await S(page, 'bold')).toBe('11111000000000000');
    expect(await S(page, 'ital')).toBe('11111000000000000');
    expect(await S(page, 'und')).toBe('11111000000000000');
    await page.keyboard.press('Control+u');
    expect(await S(page, 'und')).toBe('00000000000000000');
    expect(page.context().pages().length).toBe(pages);
  });

  test('typing at the end of a formatted word continues its formats; a new word starts plain; all undoable', async ({ app: { page } }) => {
    await setText(page, 'ab');
    await setSelection(page, 0, 2);
    await page.click('#bold'); await page.click('#und');
    await page.evaluate(() => { const t = document.querySelector('#text'); t.focus(); t.setSelectionRange(2, 2); });
    await page.keyboard.type('c');
    expect(await S(page, 'bold')).toBe('111');
    expect(await S(page, 'und')).toBe('111');
    await page.keyboard.type(' d');
    expect(await S(page, 'bold')).toBe('11110'); // the space typed after the word takes its formats like its color; the next word does not
    await page.keyboard.press('Control+z'); // the burst of typing is one step
    expect(await S(page, 'bold')).toBe('11');
    expect(await S(page, 'und')).toBe('11');
    await page.keyboard.press('Control+z'); // then the Underline click
    expect(await S(page, 'und')).toBe('00');
    expect(await S(page, 'bold')).toBe('11');
    await page.keyboard.press('Control+z'); // then the Bold click
    expect(await S(page, 'bold')).toBe('00');
  });

  test('formats belong to each card: a new card starts plain, and undo and redo bring them back', async ({ app: { page } }) => {
    await setText(page, 'one two');
    await setSelection(page, 0, 3); await page.click('#bold'); await page.click('#und');
    await addCard(page, 'second card');
    expect((await cardFormats(page)).map((c) => c.bold)).toEqual(['1110000', '00000000000']);
    await page.click('#cardList [data-card="0"]');
    await settle(page);
    expect(await S(page, 'und')).toBe('1110000'); // back on the first card, formats intact
    await setSelection(page, 0, 3); await page.click('#bold');
    expect(await S(page, 'bold')).toBe('0000000');
    await page.keyboard.press('Control+z');
    expect(await S(page, 'bold')).toBe('1110000');
    await page.keyboard.press('Control+Shift+z');
    expect(await S(page, 'bold')).toBe('0000000');
  });
});

test.describe('how bold and underline are drawn', () => {
  test('a bold word is set one weight up, so it is wider and the card grows', async ({ browser }) => {
    const context = await browser.newContext(), page = await context.newPage();
    await page.goto(APP_URL); await page.waitForFunction(() => window.__tt && window.__tt.L); await expandUi(page);
    await page.waitForFunction(() => [...document.fonts].filter((f) => f.family.includes('OpenTitlecard') && f.status === 'loaded').length === 10);
    await page.fill('#text', 'Titlecard affiliate');
    await page.selectOption('#weight', '400');
    const before = (await settle(page)).lines[0].w;
    await setSelection(page, 0, 19); await page.click('#bold');
    const bold = (await settle(page)).lines[0].w;
    expect(bold, 'Regular 400 becomes Bold 700').toBeGreaterThan(before + 5);
    await page.selectOption('#weight', '700');
    expect((await settle(page)).lines[0].w, 'Bold 700 becomes Black 900').toBeGreaterThan(bold);
    await context.close();
  });

  test('an underline runs under the formatted run only, in its color, keeps inside the card box, and follows the zoom', async ({ app: { page } }) => {
    await setText(page, 'aaaa bbbb cccc');
    await page.check('#align input[value="left"]');
    await setSelection(page, 5, 9); await page.click('#und'); // "bbbb"
    for (const k of [1, 0.5, 0.3]) {   // the preview draws smaller than the export: the bar must shrink with it
      const r = await page.evaluate((k) => {
        __tt.renderNow(); const g = __tt.exportGeometry(), l = __tt.L.lines[0], u = g.u * k;
        const c = document.createElement('canvas'); c.width = Math.round(g.W * k); c.height = Math.round(g.H * k);
        const ctx = c.getContext('2d');
        __tt.draw(ctx, c.width, c.height, { u, cx: g.cx * k, cy: g.cy * k, guides: false, sel: null });
        const run = l.items.find((i) => i.text.trim() === 'bbbb'), other = l.items.find((i) => i.text.includes('aaaa'));
        const y = Math.round(g.cy * k + (l.base + l.ny + __tt.S.size * 0.15) * u);   // inside the bar (0.12em down, 0.065em thick)
        const x = (it, f) => Math.round(g.cx * k + (l.tx + l.nx + it.x + it.w * f) * u);
        const dark = (px) => { const d = ctx.getImageData(px, y, 1, 1).data; return d[3] > 200 && d[0] < 80; };
        return { under: dark(x(run, 0.5)), startsAt: dark(x(run, 0.05)), endsAt: dark(x(run, 0.95)), before: dark(x(other, 0.5)), after: dark(x(run, 1.15)), insideBox: y < g.cy * k + l.y1 * u - 1 };
      }, k);
      expect(r, `at ${k}x`).toEqual({ under: true, startsAt: true, endsAt: true, before: false, after: false, insideBox: true });
    }
  });
});

test.describe('underline across spaces', () => {
  test('one underline runs under two underlined words and the space between them', async ({ app: { page } }) => {
    await setText(page, 'aa bb cc');
    await page.check('#align input[value="left"]');
    await setSelection(page, 0, 5); await page.click('#und'); // "aa bb": the toggle leaves the space alone
    expect(await S(page, 'und')).toBe('11011000');
    const dark = (xs) => page.evaluate((fr) => {
      __tt.renderNow(); const g = __tt.exportGeometry(), l = __tt.L.lines[0];
      const c = document.createElement('canvas'); c.width = g.W; c.height = g.H; const ctx = c.getContext('2d');
      __tt.draw(ctx, g.W, g.H, { u: g.u, cx: g.cx, cy: g.cy, guides: false, sel: null });
      const y = Math.round(g.cy + (l.base + l.ny + __tt.S.size * 0.15) * g.u);
      const left = g.cx + (l.tx + l.nx) * g.u, total = l.w * g.u;
      return fr.map((f) => { const d = ctx.getImageData(Math.round(left + total * f), y, 1, 1).data; return d[3] > 200 && d[0] < 80; });
    }, xs);
    // "aa bb cc": the space after "aa" is at about 0.25-0.33 of the line, and the line ends in "cc" (not underlined)
    expect(await dark([0.1, 0.3, 0.5, 0.9])).toEqual([true, true, true, false]);
  });
});

test.describe('faux styles: the warning and the toast', () => {
  test('italic in a font with no italic face shows a ⚠ with the reason, once toasted for 5 seconds', async ({ app: { page } }) => {
    await setText(page, 'Hello brave world');
    await expect(page.locator('#fauxWarn')).toBeHidden(); // nothing italic yet
    await expect(page.locator('#toast')).not.toHaveClass(/on/);
    await setSelection(page, 0, 5); await page.click('#ital');
    await expect(page.locator('#fauxWarn')).toBeVisible();
    await expect(page.locator('#fauxWarn')).toContainText('Faux italic');
    await expect(page.locator('#toast')).toHaveClass(/on/);
    await expect(page.locator('#toast')).toContainText('Inter (file)');
    await expect(page.locator('#toast')).toContainText('italic');
    // hovering the ⚠ shows why, and the tooltip names the family and the way out
    await expect(page.locator('#fauxTip')).toBeHidden();
    await page.hover('#fauxWarn');
    await expect(page.locator('#fauxTip')).toBeVisible();
    await expect(page.locator('#fauxTip')).toContainText('has no italic face');
    await expect(page.locator('#fauxTip')).toContainText('Load font file');
    // the toast fades after 5 seconds; the ⚠ stays while the card uses the faux italic
    await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('on'), null, { timeout: 8000 });
    await expect(page.locator('#fauxWarn')).toBeVisible();
    // it is also reachable by keyboard
    await page.mouse.move(0, 0);
    await page.locator('#fauxWarn').focus();
    await expect(page.locator('#fauxTip')).toBeVisible();
  });

  test('the toast comes once per family: more italic, or coming back to the family, does not repeat it', async ({ app: { page } }) => {
    await setText(page, 'Hello brave world');
    await setSelection(page, 0, 5); await page.click('#ital');
    await expect(page.locator('#toast')).toHaveClass(/on/);
    await page.click('#toast'); // dismissed by a click
    await expect(page.locator('#toast')).not.toHaveClass(/on/);
    await setSelection(page, 6, 11); await page.click('#ital');
    await page.fill('#family', 'Inter'); await page.keyboard.press('Escape'); // a font that has a real italic
    await expect(page.locator('#fauxWarn')).toBeHidden();
    await page.fill('#family', 'Inter (file)'); await page.keyboard.press('Escape');
    await expect(page.locator('#fauxWarn')).toBeVisible();
    await expect(page.locator('#toast')).not.toHaveClass(/on/); // the same family: told already
  });

  test('a font with a real italic never warns, and neither does a family that is not found', async ({ app: { page } }) => {
    await setText(page, 'Hello brave world');
    await setSelection(page, 0, 5); await page.click('#ital');
    await page.click('#toast');
    await page.fill('#family', 'Montserrat'); await page.keyboard.press('Escape');
    await expect(page.locator('#fauxWarn')).toBeHidden();
    await page.fill('#family', 'Some Font That Is Not Here 123'); await page.keyboard.press('Escape');
    await expect(page.locator('#fontWarn')).toBeVisible(); // that has its own warning
    await expect(page.locator('#fauxWarn')).toBeHidden();
  });

  test('bold in a family with no bolder face is flagged; with a bolder file loaded it is not', async ({ app: { page } }) => {
    await setText(page, 'Hello brave world');
    await setSelection(page, 0, 5); await page.click('#bold');
    await expect(page.locator('#fauxWarn')).toContainText('Faux bold');
    await expect(page.locator('#toast')).toContainText('bold');
    await setSelection(page, 6, 11); await page.click('#ital');
    await expect(page.locator('#fauxWarn')).toContainText('Faux italic and bold');
    await page.hover('#fauxWarn');
    await expect(page.locator('#fauxTip')).toContainText('no bolder face');
    // load a Black file of the same typeface: 800 -> 900 now has a real face... the test font family only has what we give it
    await page.setInputFiles('#fontFile', [file(700, 'normal'), file(400, 'normal')]);
    await page.waitForFunction(() => __tt.fonts.faces.some((f) => f.family === 'Inter (file)' && f.faces.length === 3));
    await page.selectOption('#weight', '400');
    await expect(page.locator('#fauxWarn')).not.toContainText('bold'); // 400 -> 700 is a real face
  });

  test('turning the italic off hides the ⚠', async ({ app: { page } }) => {
    await setText(page, 'Hello brave world');
    await setSelection(page, 0, 5); await page.click('#ital');
    await expect(page.locator('#fauxWarn')).toBeVisible();
    await page.click('#ital');
    await expect(page.locator('#fauxWarn')).toBeHidden();
  });
});

test.describe('formats in set files', () => {
  test('bold and underline are saved next to italics (the character positions), and come back on opening', async ({ app: { page } }) => {
    await setText(page, 'one two');
    await setSelection(page, 0, 3); await page.click('#bold'); await page.click('#und');
    await setSelection(page, 4, 7); await page.click('#ital');
    const saved = await saveSet(page);
    expect(saved.cards[0]).toMatchObject({ t: 'one two', b: [0, 1, 2], u: [0, 1, 2], i: [4, 5, 6] });
    await addCard(page, 'other'); // changes what is on the page, then the file brings it back
    await openSet(page, saved);
    await confirmDialog(page, true);
    await settle(page);
    expect(await cardFormats(page)).toEqual([{ text: 'one two', ital: '0000111', bold: '1110000', und: '1110000' }]);
  });

  test('a set with no formats saves none, and a file from before bold and underline opens plain', async ({ app: { page } }) => {
    await setText(page, 'plain text');
    const saved = await saveSet(page);
    expect(saved.cards[0]).not.toHaveProperty('b');
    expect(saved.cards[0]).not.toHaveProperty('u');
    await openSet(page, { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'old file', i: [0, 1] }] });
    await confirmDialog(page, true);
    await settle(page);
    expect(await cardFormats(page)).toEqual([{ text: 'old file', ital: '11000000', bold: '00000000', und: '00000000' }]);
  });

  test('hostile format lists are ignored: only whole numbers inside the text count', async ({ app: { page } }) => {
    await openSet(page, { app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'abcd', b: [0, 2, -1, 99, 1.5, 'x', null, {}], u: 'nope' }] });
    await settle(page);
    expect(await cardFormats(page)).toEqual([{ text: 'abcd', ital: '0000', bold: '1010', und: '0000' }]);
  });

  test('a card with only a bold or underline counts as work, so the leave-page prompt and the confirmations see it', async ({ browser }) => {
    const context = await browser.newContext(), page = await context.newPage();
    await page.goto(APP_URL); await page.waitForFunction(() => window.__tt && window.__tt.L); await expandUi(page);
    expect(await page.evaluate(() => __tt.unsavedWork())).toBe(false); // the untouched placeholder is no work
    await setSelection(page, 0, 3); await page.click('#und');
    expect(await page.evaluate(() => __tt.unsavedWork())).toBe(true);
    await page.click('#und');
    expect(await page.evaluate(() => __tt.unsavedWork())).toBe(false);
    await page.click('#bold');
    expect(await page.evaluate(() => __tt.unsavedWork())).toBe(true);
    await context.close();
  });
});
