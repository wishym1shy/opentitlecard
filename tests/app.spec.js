const { test, expect, expandUi, APP_URL, loadTestFont, setText, settle, setSelection, exportPng, inspectPng } = require('./helpers');

test.describe('loading and fonts', () => {
  test('opens cleanly with the default card', async ({ app: { page } }) => {
    await expect(page).toHaveTitle(/^OpenTitlecard/);
    await expect(page.locator('#text')).toHaveValue('Type your Titlecard here! 😳');
    const L = await settle(page);
    expect(L.lines).toHaveLength(1);
    expect(L.lines[0].items.filter((i) => i.k === 'slot')).toHaveLength(1);
    // default formatting is plain: nothing coloured, nothing italic
    expect(await page.evaluate(() => __tt.S.colors.every((c) => c === null) && __tt.S.ital.every((i) => !i))).toBe(true);
  });

  test('the default font is Inter Bold, an open-source font suited to everyone (nothing brand-specific)', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect(await page.evaluate(() => ({ family: __tt.S.family, weight: __tt.S.weight }))).toEqual({ family: 'Inter', weight: 700 });
    await expect(page.locator('#family')).toHaveValue('Inter');
    await expect(page.locator('#weight')).toHaveValue('700');
  });

  test('header links to the GitHub repo and has no subtitle', async ({ app: { page } }) => {
    const link = page.locator('header a.gh');
    await expect(link).toHaveAttribute('href', 'https://github.com/wishym1shy/opentitlecard');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/); // never leave window.opener to the new tab
    await expect(link).toContainText('GitHub');
    await expect(page.locator('header .sub')).toHaveCount(0);
    await expect(page.locator('header')).not.toContainText('transparent PNG for Premiere');
    // the font chip is still on the right of the header
    const [l, c] = await Promise.all([link.boundingBox(), page.locator('#fontChip').boundingBox()]);
    expect(c.x).toBeGreaterThan(l.x);
  });

  test('warns when the selected font is missing and clears once a font is loaded', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    await expandUi(page);
    await page.fill('#family', 'Definitely Not An Installed Font 12345');
    await expect(page.locator('#fontChip')).toHaveClass(/bad/);
    await expect(page.locator('#fontWarn')).toBeVisible();
    await expect(page.locator('#fontWarnMsg')).toContainText('isn\'t installed or loaded');
    await expect(page.locator('#export')).toContainText('fallback font');
    await loadTestFont(page);
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    await expect(page.locator('#fontWarn')).toBeHidden();
    await expect(page.locator('#fontWarnMsg')).toBeHidden();
    await expect(page.locator('#export')).toHaveText('Download PNG');
    expect(errors).toEqual([]);
  });

  test('every element id is unique (controls bind by id, so duplicates silently misbehave)', async ({ app: { page } }) => {
    const dupes = await page.evaluate(() => {
      const seen = {}, out = [];
      document.querySelectorAll('[id]').forEach((e) => { seen[e.id] = (seen[e.id] || 0) + 1; });
      for (const [id, n] of Object.entries(seen)) if (n > 1) out.push(`${id} x${n}`);
      return out;
    });
    expect(dupes).toEqual([]);
  });

  test('preview background buttons recolour the preview, not a control', async ({ app: { page } }) => {
    const box = page.locator('#previewBox');
    await expect(box).toHaveClass(/checker/);
    for (const bg of ['white', 'black', 'gray', 'checker']) {
      await page.click(`#pbg button[data-bg="${bg}"]`);
      await expect(box).toHaveClass(new RegExp(bg));
    }
    await expect(page.locator('input#wrap')).not.toHaveClass(/checker|white|black|gray/);
  });
});

test.describe('emoji slots', () => {
  test('text symbols and digits are not treated as emoji', async ({ app: { page } }) => {
    await setText(page, 'A™ ©2026 #1 2');
    const L = await settle(page);
    expect(L.lines[0].items.filter((i) => i.k === 'slot')).toHaveLength(0);
  });

  test('skin tones, flags, keycaps, hearts and ZWJ families are one slot each', async ({ app: { page } }) => {
    await setText(page, '👍🏽 🇵🇭 1️⃣ ❤️ 👨‍👩‍👧');
    const L = await settle(page);
    expect(L.lines[0].items.filter((i) => i.k === 'slot')).toHaveLength(5);
  });

  test('"+ Emoji slot" inserts a slot at the caret', async ({ app: { page } }) => {
    await setText(page, 'Hello');
    await setSelection(page, 5);
    await page.click('#addSlot');
    const L = await settle(page);
    expect(L.lines[0].items.filter((i) => i.k === 'slot')).toHaveLength(1);
  });

  test('slot width follows the size slider', async ({ app: { page } }) => {
    await setText(page, 'Hi 😳');
    const before = (await settle(page)).lines[0].items.find((i) => i.k === 'slot').w;
    await page.evaluate(() => { const e = document.querySelector('#slot'); e.value = '2'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    const L = await settle(page);
    const after = L.lines[0].items.find((i) => i.k === 'slot').w;
    expect(after).toBeCloseTo(2 * L.size, 3);
    expect(after).toBeGreaterThan(before);
  });
});

test.describe('per-word colour and italic', () => {
  // Formatting is judged on visible letters only: whitespace carries no visible colour or slant.
  const coloured = (page) => page.evaluate(() => __tt.S.colors.map((c, i) => (c && !/\s/.test(__tt.S.text[i]) ? __tt.S.text[i] : '')).join(''));
  const italic = (page) => page.evaluate(() => __tt.S.ital.map((c, i) => (c && !/\s/.test(__tt.S.text[i]) ? __tt.S.text[i] : '')).join(''));

  test('caret in a word + swatch colours the whole word', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await setSelection(page, 6); // inside NEWS
    await page.click('#swatches .sw:nth-child(3)'); // Red
    expect(await coloured(page)).toBe('NEWS');
    expect(await page.evaluate(() => __tt.S.colors[4])).toBe('#cf0202');
  });

  test('Reset colour puts the word back to the default', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await setSelection(page, 6);
    await page.click('#swatches .sw:nth-child(3)');
    await page.click('#clr');
    expect(await coloured(page)).toBe('');
  });

  test('an italic word keeps even gaps to its neighbours (slant is not left crowding the next word)', async ({ app: { page } }) => {
    // H has equal side bearings, so with plain neighbours the two gaps must match when the italic ink is centred.
    await page.uncheck('#bgOn');
    await page.uncheck('#textShadow');
    await setText(page, 'HH HHH HH');
    await setSelection(page, 3, 6);
    await page.click('#ital');
    await settle(page);
    const { buffer } = await exportPng(page);
    const { results: [runs] } = await inspectPng(page, buffer, [{ type: 'inkRuns', gap: 15 }]); // size 100: word gap > 15px
    expect(runs).toHaveLength(3);
    const gapBefore = runs[1][0] - runs[0][1], gapAfter = runs[2][0] - runs[1][1];
    expect(Math.abs(gapBefore - gapAfter), `gaps ${gapBefore}px / ${gapAfter}px`).toBeLessThanOrEqual(3);
  });

  test('every italic word is shifted by the same amount, whatever its letters', async ({ app: { page } }) => {
    const shift = async (text) => {
      await setText(page, text); // "<plain> <italic>"
      await setSelection(page, text.indexOf(' ') + 1, text.length);
      await page.click('#ital');
      const L = await settle(page);
      const [plain, ital] = L.lines[0].items;
      await page.click('#ital'); // toggle back for the next call
      return ital.x - (plain.x + plain.w + 0); // the italic run starts at the plain run's end (it includes its leading space)
    };
    const a = await shift('H xyz');   // short word, no ascenders
    const b = await shift('H Titlecard'); // tall word
    expect(a).toBeCloseTo(b, 3);
    expect(a).toBeLessThan(0); // shifted left to cancel the right lean
  });

  test('italic does not change the card size, and the selection box follows the drawn word', async ({ app: { page } }) => {
    await setText(page, 'HH HHH HH');
    const plain = await settle(page);
    await setSelection(page, 3, 6);
    await page.click('#ital');
    const it = await settle(page);
    expect(it.cardW).toBeCloseTo(plain.cardW, 3);
    // the word's hit/selection box sits where the italic run is drawn (centred on it), not on the unshifted advance box
    const run = it.lines[0].items.find((i) => i.text.includes('HHH'));
    const word = it.lines[0].words.find((w) => w.s === 3);
    expect(word.x0).toBeCloseTo(run.x, 3);
  });

  test('the palette starts White, Black, then the default Red #CF0202 and Green #02CF02', async ({ app: { page } }) => {
    const first = await page.locator('#swatches .sw').evaluateAll((els) => els.slice(0, 4).map((e) => e.title));
    expect(first.map((t) => t.toLowerCase())).toEqual([expect.stringMatching(/white/), expect.stringMatching(/black/), expect.stringMatching(/red/), expect.stringMatching(/green/)]);
    await setText(page, 'Big NEWS today');
    await setSelection(page, 1);
    await page.keyboard.press('Alt+3');
    expect(await page.evaluate(() => __tt.S.colors[0])).toBe('#cf0202');
    await setSelection(page, 6);
    await page.keyboard.press('Alt+4');
    expect(await page.evaluate(() => __tt.S.colors[4])).toBe('#02cf02');
  });

  test('Alt+number applies a palette colour and Ctrl+I toggles italic', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await setSelection(page, 1); // inside Big
    await page.keyboard.press('Alt+5'); // Orange
    expect(await page.evaluate(() => __tt.S.colors[0])).toBe('#ff8a00');
    await page.keyboard.press('Control+I');
    expect(await italic(page)).toBe('Big');
    await page.keyboard.press('Control+I');
    expect(await italic(page)).toBe('');
  });

  test('the shortcuts work with a Mac keyboard: Option+number and Cmd+I', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await setSelection(page, 1);
    // On a Mac, Option+4 reports the typed character ("¢") as the key; only the physical key code says "4".
    const prevented = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { key: '¢', code: 'Digit4', altKey: true, bubbles: true, cancelable: true });
      document.querySelector('#text').dispatchEvent(e);
      return e.defaultPrevented; // so "¢" is not typed into the text as well
    });
    expect(prevented).toBe(true);
    expect(await page.evaluate(() => __tt.S.colors[0])).toBe('#02cf02'); // slot 4 is Green
    await page.keyboard.press('Meta+I');
    expect(await italic(page)).toBe('Big');
  });

  test('formatting stays attached to the right letters while editing', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await setSelection(page, 6);
    await page.click('#swatches .sw:nth-child(3)');
    // type at the very start
    await setSelection(page, 0);
    await page.keyboard.type('>> ');
    expect(await coloured(page)).toBe('NEWS');
    // delete a character before the coloured word (the second ">")
    await setSelection(page, 2);
    await page.keyboard.press('Backspace');
    expect(await coloured(page)).toBe('NEWS');
    // delete a character after it
    const end = await page.evaluate(() => __tt.S.text.indexOf('today') + 5);
    await setSelection(page, end);
    await page.keyboard.press('Backspace');
    expect(await coloured(page)).toBe('NEWS');
    expect(await page.evaluate(() => __tt.S.text)).toBe('> Big NEWS toda');
  });

  test('typing at the end of a coloured word continues the colour, but a new word does not', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await setSelection(page, 6);
    await page.click('#swatches .sw:nth-child(3)');
    const endOfNews = await page.evaluate(() => __tt.S.text.indexOf('NEWS') + 4);
    await setSelection(page, endOfNews);
    await page.keyboard.type('X');
    expect(await coloured(page)).toBe('NEWSX');
    await page.keyboard.type(' ok');
    expect(await coloured(page)).toBe('NEWSX');
  });

  test('pasted text takes no colour from its neighbours', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await setSelection(page, 6);
    await page.click('#swatches .sw:nth-child(3)');
    const endOfNews = await page.evaluate(() => __tt.S.text.indexOf('NEWS') + 4);
    await setSelection(page, endOfNews);
    await page.evaluate(() => {
      const t = document.querySelector('#text');
      t.setRangeText('abc', t.selectionStart, t.selectionEnd, 'end');
      t.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', bubbles: true }));
    });
    expect(await coloured(page)).toBe('NEWS');
  });

  test('colour is applied to the rendered text run', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    await setSelection(page, 6);
    await page.click('#swatches .sw:nth-child(3)');
    await settle(page);
    const runs = await page.evaluate(() => __tt.L.lines[0].items.filter((i) => i.k === 't').map((i) => [i.text, i.c]));
    expect(runs).toContainEqual(['NEWS', '#cf0202']);
  });

  test('custom colours can be pinned to the palette', async ({ app: { page } }) => {
    const before = await page.locator('#swatches .sw').count();
    await page.evaluate(() => { const p = document.querySelector('#pick'); p.value = '#123456'; });
    await page.click('#pin');
    await expect(page.locator('#swatches .sw')).toHaveCount(before + 1);
  });
});

test.describe('preview interaction and line nudge', () => {
  test('clicking a word in the preview selects it in the text box', async ({ app: { page } }) => {
    await setText(page, 'Big NEWS today');
    const pos = await page.evaluate(() => {
      const g = __tt.exportGeometry(), l = __tt.L.lines[0], w = l.words[1];
      const r = document.querySelector('#cv').getBoundingClientRect();
      return { x: r.left + (g.cx + (l.tx + l.nx + (w.x0 + w.x1) / 2) * g.u) * (r.width / g.W), y: r.top + (g.cy + l.cy * g.u) * (r.height / g.H) };
    });
    await page.mouse.click(pos.x, pos.y);
    expect(await page.evaluate(() => { const t = document.querySelector('#text'); return t.value.slice(t.selectionStart, t.selectionEnd); })).toBe('NEWS');
  });

  test('line nudge moves the text but not the box', async ({ app: { page } }) => {
    await setText(page, 'First line\nSecond line');
    const before = await settle(page);
    await page.fill('#nudges input[data-i="1"][data-a="x"]', '-8');
    await page.fill('#nudges input[data-i="1"][data-a="y"]', '12');
    const after = await settle(page);
    expect(after.lines[1].nx).toBe(-8);
    expect(after.lines[1].ny).toBe(12);
    expect(after.lines[0].nx).toBe(0);
    for (const k of ['x0', 'x1', 'y0', 'y1']) expect(after.lines[1][k]).toBeCloseTo(before.lines[1][k], 6);
  });

  test('Shift+ArrowUp in a nudge field steps by 10', async ({ app: { page } }) => {
    await setText(page, 'One\nTwo');
    const field = page.locator('#nudges input[data-i="0"][data-a="y"]');
    await field.focus();
    await page.keyboard.press('Shift+ArrowUp');
    expect(await page.evaluate(() => __tt.S.nudges[0].y)).toBe(10);
  });

  test('Alt-dragging a line in the preview nudges it', async ({ app: { page } }) => {
    await setText(page, 'First line\nSecond line');
    const p = await page.evaluate(() => {
      const g = __tt.exportGeometry(), l = __tt.L.lines[1];
      const r = document.querySelector('#cv').getBoundingClientRect();
      return { x: r.left + g.cx * (r.width / g.W), y: r.top + (g.cy + l.cy * g.u) * (r.height / g.H) };
    });
    await page.keyboard.down('Alt');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 20, p.y + 10, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const n = await page.evaluate(() => __tt.S.nudges[1]);
    expect(n.x).toBeGreaterThan(0);
    expect(n.y).toBeGreaterThan(0);
  });

  test('the reset button clears a nudge', async ({ app: { page } }) => {
    await setText(page, 'One\nTwo');
    await page.fill('#nudges input[data-i="1"][data-a="x"]', '30');
    await page.click('#nudges [data-reset="1"]');
    expect(await page.evaluate(() => __tt.S.nudges[1])).toEqual({ x: 0, y: 0 });
  });
});
