const { test, expect, setText, setSelection, exportPng } = require('./helpers');

// The built-in Help & guide: a button right of File, chapters, the "?" key, and a guard that keeps the guide honest.
const chapters = (page) => page.evaluate(() => __tt.help.chapters);
const open = async (page) => { await page.click('#helpBtn'); await expect(page.locator('#helpDlg')).toBeVisible(); };

test.describe('help and guide', () => {
  test('a ? button sits to the right of File, opens the guide on its first chapter, and Esc closes it with the focus back on the button', async ({ app: { page } }) => {
    const file = await page.locator('#fileMenuBtn').boundingBox(), help = await page.locator('#helpBtn').boundingBox();
    expect(help.x).toBeGreaterThan(file.x + file.width - 1);                      // to the right of the File button
    expect(Math.abs(help.y + help.height / 2 - (file.y + file.height / 2))).toBeLessThan(4);   // on the same row
    await expect(page.locator('#helpBtn')).toHaveAccessibleName('Help and guide');
    await open(page);
    await expect(page.locator('#helpPage h3')).toHaveText('Getting started');
    await expect(page.locator('#helpNav button[aria-current="true"]')).toHaveText('Getting started');
    await page.keyboard.press('Escape');
    await expect(page.locator('#helpDlg')).toBeHidden();
    await expect(page.locator('#helpBtn')).toBeFocused();
    await open(page); await page.click('#helpClose'); await expect(page.locator('#helpDlg')).toBeHidden();
  });

  test('every chapter has a unique id and a title, shows its own page with real content, and the arrow keys move between them', async ({ app: { page } }) => {
    const list = await chapters(page);
    expect(list.length).toBeGreaterThanOrEqual(9);
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
    expect(list.map((c) => c.id)).toEqual(expect.arrayContaining(['start', 'text', 'look', 'emoji', 'cards', 'view', 'export', 'data', 'keys', 'warnings']));
    await open(page);
    await expect(page.locator('#helpNav button')).toHaveCount(list.length);
    for (const c of list) {
      await page.click(`#helpNav [data-ch="${c.id}"]`);
      await expect(page.locator('#helpPage h3')).toHaveText(c.title);
      await expect(page.locator(`#helpNav [data-ch="${c.id}"]`)).toHaveAttribute('aria-current', 'true');
      expect((await page.locator('#helpPage').innerText()).length, c.id).toBeGreaterThan(300);
    }
    await page.click(`#helpNav [data-ch="${list[0].id}"]`);
    await page.locator(`#helpNav [data-ch="${list[0].id}"]`).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#helpPage h3')).toHaveText(list[1].title);
    await expect(page.locator(`#helpNav [data-ch="${list[1].id}"]`)).toBeFocused();
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');                // stops at the first
    await expect(page.locator('#helpPage h3')).toHaveText(list[0].title);
  });

  test('it remembers the chapter you were on while the page stays open, and a new chapter starts at the top', async ({ app: { page } }) => {
    await open(page); await page.click('#helpNav [data-ch="export"]');
    await page.keyboard.press('Escape');
    await open(page);
    await expect(page.locator('#helpPage h3')).toHaveText('Exporting');
    await page.click('#helpNav [data-ch="keys"]');
    await page.evaluate(() => { document.querySelector('#helpPage').scrollTop = 400; });
    expect(await page.evaluate(() => document.querySelector('#helpPage').scrollTop)).toBeGreaterThan(100);   // the keys chapter is long enough to scroll
    await page.click('#helpNav [data-ch="emoji"]');
    expect(await page.evaluate(() => document.querySelector('#helpPage').scrollTop)).toBe(0);
  });

  test('the ? key opens it, but not while you are typing in a field or when another dialog is open', async ({ app: { page } }) => {
    await page.click('#text'); await page.keyboard.type('really?');
    await expect(page.locator('#helpDlg')).toBeHidden();
    expect(await page.evaluate(() => document.querySelector('#text').value)).toContain('really?');
    await page.fill('#n_size', ''); await page.keyboard.type('?');
    await expect(page.locator('#helpDlg')).toBeHidden();
    await page.evaluate(() => document.activeElement.blur());
    await page.click('#cardsNew'); await expect(page.locator('#confirmDlg, #batchDlg')).toBeHidden().catch(() => {});
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('Shift+Slash');                                                    // "?" on a US keyboard
    await expect(page.locator('#helpDlg')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.click('#batchOpen'); await expect(page.locator('#batchDlg')).toBeVisible();
    await page.keyboard.press('Shift+Slash');
    await expect(page.locator('#helpDlg')).toBeHidden();                                         // another dialog is open: leave it be
  });

  test('keys are shown for your computer: Ctrl, Alt and Shift here, ⌘, ⌥ and ⇧ on a Mac', async ({ app: { page, errors }, browser }) => {
    await open(page); await page.click('#helpNav [data-ch="keys"]');
    const row = page.locator('#helpPage table.keys tr', { hasText: 'Save the set' }).first();
    expect((await row.locator('kbd').allTextContents())).toEqual(['Ctrl', 'S']);
    const ctx = await browser.newContext(); const mac = await ctx.newPage();
    await mac.addInitScript(() => { Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); });
    await mac.goto(page.url()); await mac.waitForFunction(() => window.__tt && window.__tt.L);
    await mac.click('#helpBtn'); await mac.click('#helpNav [data-ch="keys"]');
    expect(await mac.locator('#helpPage table.keys tr', { hasText: 'Save the set as' }).first().locator('kbd').allTextContents()).toEqual(['⌘', '⇧', 'S']);
    expect(await mac.locator('#helpPage table.keys tr', { hasText: 'Apply the 1st' }).first().locator('kbd').allTextContents()).toEqual(['⌥', '1 … 9']);
    await ctx.close();
  });

  test('the keys chapter documents the pan and zoom controls, and the combos it lists do what it says', async ({ app: { page } }) => {
    await open(page); await page.click('#helpNav [data-ch="keys"]');
    const text = await page.locator('#helpPage').innerText();
    for (const t of ['Space', 'Middle button', 'scroll', 'Zoom in', 'Zoom out', 'Fit the canvas', 'Undo', 'Redo', 'Nudge the line', 'Bold', 'swatch']) expect(text, t).toContain(t);
    await page.keyboard.press('Escape');
    // bold with Ctrl+B
    await setText(page, 'Hello world'); await setSelection(page, 0, 5);
    await page.keyboard.press('Control+b');
    expect(await page.evaluate(() => __tt.S.bold.slice(0, 5))).toEqual([1, 1, 1, 1, 1]);
    // Alt+1 applies the first swatch
    await setSelection(page, 6, 11); await page.keyboard.press('Alt+1');
    expect(await page.evaluate(() => __tt.S.colors[6])).toBeTruthy();
    // Ctrl+= zooms in, Ctrl+0 fits again
    await page.evaluate(() => document.activeElement.blur());
    const z0 = await page.evaluate(() => __tt.view.z);
    await page.keyboard.press('Control+='); expect(await page.evaluate(() => __tt.view.z)).toBeGreaterThan(z0);
    await page.keyboard.press('Control+0'); expect(await page.evaluate(() => __tt.view.fit)).toBe(true);
    // Ctrl+Z undoes
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => __tt.S.colors[6])).toBeFalsy();
  });

  test('every control the guide names ({{…}} in its text) is still in the app: the guide cannot drift from the UI', async ({ app: { page } }) => {
    await open(page);
    const named = new Set();
    for (const c of await chapters(page)) {
      await page.click(`#helpNav [data-ch="${c.id}"]`);
      for (const n of await page.locator('#helpPage b.ui').allTextContents()) named.add(n);
    }
    expect(named.size, 'the guide marks the controls it names').toBeGreaterThan(50);
    for (const must of ['Download PNG', 'Tight crop', 'Leave emoji slots empty', 'Match cap height', 'Sit on baseline', 'Scale X', 'Soft reset…', 'Add from list', 'Max card width', 'Descender clearance']) expect([...named], must).toContain(must);
    await page.keyboard.press('Escape');
    const missing = await page.evaluate((names) => {
      const root = document.body.cloneNode(true);
      root.querySelectorAll('script,style,template,#helpDlg').forEach((e) => e.remove());   // not the guide itself, and not the code
      const hay = [root.textContent, ...[...root.querySelectorAll('[title],[aria-label],[placeholder],option')].map((e) => [e.title, e.getAttribute('aria-label'), e.getAttribute('placeholder'), e.textContent].join(' '))].join('\n').replace(/&amp;/g, '&');
      return names.filter((n) => !hay.includes(n));
    }, [...named]);
    expect(missing, 'named in the guide but not found in the app').toEqual([]);
  });

  test('guide text is plain text: nothing in it can become markup', async ({ app: { page } }) => {
    await open(page);
    for (const c of await chapters(page)) {
      await page.click(`#helpNav [data-ch="${c.id}"]`);
      const bad = await page.evaluate(() => [...document.querySelectorAll('#helpPage *')].map((e) => e.tagName).filter((t) => !['H3', 'H4', 'P', 'UL', 'OL', 'LI', 'B', 'KBD', 'SPAN', 'DIV', 'TABLE', 'TBODY', 'TR', 'TD', 'CODE'].includes(t)));
      expect(bad, c.id).toEqual([]);
    }
  });
});
