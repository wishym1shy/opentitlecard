const { test, expect, expandUi, APP_URL, setText, settle } = require('./helpers');

// The families that ship inside index.html (Inter, Montserrat, Source Serif 4, Playfair Display, Linik Sans), and the font picker
// that lists them. Like default-font.spec.js these tests never load the test font: they use what a first-time visitor
// gets. (Every other spec loads a pinned static Inter through "Load font file…" for identical metrics.)

const FAMILIES = [
  { name: 'Inter', serif: false },
  { name: 'Montserrat', serif: false },
  { name: 'Source Serif 4', serif: true },
  { name: 'Playfair Display', serif: true },
  { name: 'Linik Sans', serif: false },
];

async function openPlain(browser, init) {
  const context = await browser.newContext();
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.__tt && window.__tt.L);
  await expandUi(page);
  return { context, page, errors, requests };
}
// all ten embedded faces (five families, upright and italic) are registered and loaded
const allLoaded = (page) => page.waitForFunction(() => {
  const faces = [...document.fonts].filter((f) => f.family.includes('OpenTitlecard') && f.status === 'loaded');
  return faces.length === 10;
});
// typing a name opens the menu (as for a user); Esc closes it again so it doesn't cover the controls below
async function setFamily(page, name) { await page.fill('#family', name); await page.keyboard.press('Escape'); }
const options = (page) => page.locator('#famMenu [role=option]').evaluateAll((o) => o.map((x) => x.dataset.fam));

test.describe('bundled font families', () => {
  test('every family has a real upright and a real italic, and a working weight axis', async ({ browser }) => {
    const { context, page, errors, requests } = await openPlain(browser);
    await allLoaded(page);
    for (const { name } of FAMILIES) {
      const m = await page.evaluate((fam) => {
        const c = document.createElement('canvas').getContext('2d'), out = {};
        for (const w of [400, 700, 900]) for (const st of ['normal', 'italic']) {
          c.font = `${st} ${w} 100px "OpenTitlecard ${fam}"`; out[`${st}${w}`] = c.measureText('Titlecard affiliate').width;
        }
        c.font = '700 100px monospace'; out.mono = c.measureText('Titlecard affiliate').width;
        return out;
      }, name);
      expect(Math.abs(m.normal700 - m.mono), `${name} is not the generic fallback`).toBeGreaterThan(5);
      // a faked slant keeps the upright advance widths exactly; a real italic face does not
      for (const w of [400, 700, 900]) expect(Math.abs(m[`italic${w}`] - m[`normal${w}`]), `${name} italic ${w}`).toBeGreaterThan(0.5);
      expect(m.normal900, `${name} weight axis`).toBeGreaterThan(m.normal400);
      expect(m.italic900, `${name} italic weight axis`).toBeGreaterThan(m.italic400);
    }
    expect(requests.filter((u) => !/^(file|data|blob):/.test(u)), 'no network requests').toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('picking each family is ready to use: green chip, no warning, its own stack, and a different look from the others', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await allLoaded(page);
    const widths = {};
    for (const { name, serif } of FAMILIES) {
      await setFamily(page, name);
      await setText(page, 'Titlecard affiliate');
      const L = await settle(page);
      widths[name] = L.lines[0].w;
      await expect(page.locator('#fontChip')).toHaveClass(/ok/);
      await expect(page.locator('#fontWarn')).toBeHidden();
      await expect(page.locator('#export')).toHaveText('Download PNG');
      const stack = await page.evaluate(() => {
        const seen = new Set(), desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
        const c = document.createElement('canvas'); c.width = 400; c.height = 200;
        const ctx = c.getContext('2d');
        Object.defineProperty(ctx, 'font', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); seen.add(desc.get.call(this)); } });
        __tt.draw(ctx, 400, 200, { u: 0.2, cx: 200, cy: 100, guides: false, sel: null });
        return [...seen];
      });
      expect(stack.length).toBeGreaterThan(0);
      for (const f of stack) {
        expect(f).toContain(`OpenTitlecard ${name}`);
        expect(f, 'the plain name comes first, so an installed copy wins').toMatch(new RegExp(`${name}"?, "?OpenTitlecard ${name}"?, `));
        expect(/serif/.test(f.replace(/sans-serif/g, ''))).toBe(serif);
      }
    }
    expect(new Set(Object.values(widths).map((w) => Math.round(w))).size, 'five different typefaces').toBe(5);
    await context.close();
  });

  test('italic words in every bundled family are not shifted: a real italic spaces itself', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await allLoaded(page);
    await page.check('#align input[value="left"]');
    for (const { name } of FAMILIES) {
      await setFamily(page, name);
      await setText(page, 'Hello world');
      await page.evaluate(() => { const t = document.querySelector('#text'); t.focus(); t.setSelectionRange(0, 0); });
      const before = (await settle(page)).lines[0].items[0].x;
      await page.evaluate(() => { const t = document.querySelector('#text'); t.focus(); t.setSelectionRange(0, 5); });
      await page.click('#ital');
      const L = await settle(page);
      expect(L.lines[0].items[0].text).toBe('Hello');
      expect(L.lines[0].items[0].x, name).toBeCloseTo(before, 3);
      await page.click('#ital'); // back to upright for the next family
    }
    await context.close();
  });

  test('an embedded family that cannot load is reported, and only that one', async ({ browser }) => {
    const { context, page } = await openPlain(browser, () => {
      const Orig = window.FontFace;
      window.FontFace = function (name, ...rest) { if (String(name).includes('OpenTitlecard Montserrat')) throw new Error('blocked'); return new Orig(name, ...rest); };
      window.FontFace.prototype = Orig.prototype;
    });
    await page.waitForFunction(() => [...document.fonts].filter((f) => f.family.includes('OpenTitlecard') && f.status === 'loaded').length === 8);
    await setFamily(page, 'Source Serif 4');
    await expect(page.locator('#fontWarn')).toBeHidden();
    await setFamily(page, 'Montserrat');
    await expect(page.locator('#fontChip')).toHaveClass(/bad/);
    await expect(page.locator('#fontWarn')).toBeVisible();
    await context.close();
  });

  test('a font file that says it is a bundled family gets its own name instead of replacing it; an unreadable one is judged by its file name', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await allLoaded(page);
    const { FONT_FILE } = require('./helpers');
    const fs = require('fs'), os = require('os'), path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-font-'));
    // a readable file is named by what is inside it (the real Inter), whatever the file is called
    const readable = path.join(dir, 'Montserrat.woff');
    fs.copyFileSync(FONT_FILE, readable);
    await page.setInputFiles('#fontFile', readable);
    await expect(page.locator('#family')).toHaveValue('Inter (file)');
    // an unreadable one (WOFF2) falls back to its file name, which here is a bundled family
    const guessed = path.join(dir, 'Montserrat.woff2');
    fs.copyFileSync(require.resolve('@fontsource/inter/files/inter-latin-800-normal.woff2'), guessed);
    await page.setInputFiles('#fontFile', guessed);
    await expect(page.locator('#family')).toHaveValue('Montserrat (file)');
    await context.close();
  });
});

test.describe('font picker', () => {
  test('the chevron opens a grouped menu: the included families first, each drawn in its own typeface', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await allLoaded(page);
    await expect(page.locator('#famMenu')).toBeHidden();
    await page.click('#famToggle');
    await expect(page.locator('#famMenu')).toBeVisible();
    await expect(page.locator('#family')).toHaveAttribute('aria-expanded', 'true');
    expect(await options(page)).toEqual(FAMILIES.map((f) => f.name));
    await expect(page.locator('#famMenu .fgh')).toHaveText(['Included with OpenTitlecard']);
    const styles = await page.locator('#famMenu [role=option]').evaluateAll((o) => o.map((x) => x.style.fontFamily));
    FAMILIES.forEach((f, i) => expect(styles[i]).toContain(`OpenTitlecard ${f.name}`));
    await expect(page.locator('#famMenu [role=option][aria-selected=true]')).toHaveText(/^Inter/); // the current family is marked
    await page.click('#famToggle');
    await expect(page.locator('#famMenu')).toBeHidden();
    await context.close();
  });

  test('clicking a family applies it like typing: saved, undoable, and the box shows it', async ({ browser }) => {
    const { context, page, errors } = await openPlain(browser);
    await allLoaded(page);
    await page.click('#famToggle');
    await page.locator('#famMenu [role=option]', { hasText: 'Playfair Display' }).click();
    await expect(page.locator('#famMenu')).toBeHidden();
    await expect(page.locator('#family')).toHaveValue('Playfair Display');
    expect(await page.evaluate(() => __tt.S.family)).toBe('Playfair Display');
    await expect(page.locator('#fontChip')).toContainText('Playfair Display');
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => __tt.S.family)).toBe('Inter');
    await page.keyboard.press('Control+Shift+z');
    expect(await page.evaluate(() => __tt.S.family)).toBe('Playfair Display');
    await page.reload();
    await page.waitForFunction(() => window.__tt && window.__tt.L);
    expect(await page.evaluate(() => __tt.S.family)).toBe('Playfair Display'); // the last-used style is remembered
    await allLoaded(page);
    await expect(page.locator('#fontChip')).toHaveClass(/ok/);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('typing filters the menu, the keyboard picks, and Esc closes without changing anything', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await allLoaded(page);
    await page.click('#family');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('serif');
    expect(await options(page)).toEqual(['Source Serif 4']);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#family')).toHaveAttribute('aria-activedescendant', /fo0/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#family')).toHaveValue('Source Serif 4');
    expect(await page.evaluate(() => __tt.S.family)).toBe('Source Serif 4');
    await expect(page.locator('#famMenu')).toBeHidden();
    // arrows alone open the full list; Esc leaves the family as it was
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#famMenu')).toBeVisible();
    expect(await options(page)).toHaveLength(5);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.locator('#famMenu')).toBeHidden();
    expect(await page.evaluate(() => __tt.S.family)).toBe('Source Serif 4');
    await context.close();
  });

  test('the box still takes any name, and a name with no match says so', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await allLoaded(page);
    await page.fill('#family', 'Courier New');
    expect(await page.evaluate(() => __tt.S.family)).toBe('Courier New');
    await page.fill('#family', 'Zzz Not A Font');
    await expect(page.locator('#famMenu')).toContainText('No matching font');
    expect(await page.evaluate(() => __tt.S.family)).toBe('Zzz Not A Font');
    await page.keyboard.press('Enter'); // nothing highlighted: Enter keeps what was typed
    expect(await page.evaluate(() => __tt.S.family)).toBe('Zzz Not A Font');
    await context.close();
  });

  test('a click elsewhere closes it, and the menu stays inside the window', async ({ browser }) => {
    const { context, page } = await openPlain(browser);
    await allLoaded(page);
    await page.click('#famToggle');
    const box = await page.locator('#famMenu').boundingBox(), input = await page.locator('#family').boundingBox();
    expect(box.x).toBeCloseTo(input.x, 0);
    expect(box.width).toBeCloseTo(input.width, 0);
    expect(box.y).toBeGreaterThanOrEqual(input.y + input.height);
    const vp = page.viewportSize();
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    await page.mouse.click(vp.width - 5, vp.height - 5);
    await expect(page.locator('#famMenu')).toBeHidden();
    await context.close();
  });

  test('installed fonts are listed under their own heading once "Installed fonts…" has read them', async ({ browser }) => {
    const { context, page } = await openPlain(browser, () => {
      window.queryLocalFonts = async () => [{ family: 'Zeta Sans' }, { family: 'Alpha Serif' }, { family: 'Inter' }];
    });
    await allLoaded(page);
    await page.click('#loadInstalled');
    await expect(page.locator('#famMenu')).toBeVisible();
    await expect(page.locator('#famMenu .fgh')).toHaveText(['Included with OpenTitlecard', 'Installed on this computer']);
    const o = await options(page);
    expect(o.slice(-2)).toEqual(['Alpha Serif', 'Zeta Sans']);
    expect(o.filter((f) => f === 'Inter'), 'a family is listed once, under the first group that has it').toHaveLength(1);
    await context.close();
  });
});
