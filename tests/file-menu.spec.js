const { test, expect, setText, addCard, confirmDialog, fileMenu, expandUi } = require('./helpers');

const focusedId = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);
const setFile = (cards, extra = {}) => ({ app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: cards.map((t) => ({ t })), ...extra });
async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  return { filename: dl.suggestedFilename(), json: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
}
// Drops a file on the page the way a file dragged from the desktop arrives.
async function dropFile(page, name, content) {
  await page.evaluate(([name, content]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([content], name, { type: 'application/json' }));
    for (const type of ['dragover', 'drop']) document.querySelector('#cv').dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [name, typeof content === 'string' ? content : JSON.stringify(content)]);
}

test.describe('toolbar', () => {
  test('the set name, the File menu and the Help button sit at the top right; canvas size moved to the bottom bar, Panels to its own pill', async ({ app: { page } }) => {
    const ids = await page.evaluate(() => [...document.querySelector('.toolbar').children].map((e) => e.id).filter(Boolean));
    expect(ids.slice(-3)).toEqual(['setName', 'fileMenuBtn', 'helpBtn']);   // the ? button is last, right of File
    await expect(page.locator('#fileMenuBtn')).toHaveText('File');
    await expect(page.locator('#setName')).toHaveValue('Untitled set');
    await expect(page.locator('.toolbar #dims, .toolbar #panelsToggle')).toHaveCount(0);
    await expect(page.locator('#info #dims')).toHaveText('1920 × 1080 px');
    const [pill, panels] = await Promise.all([page.locator('#panelsToggle').boundingBox(), page.locator('#panels').boundingBox()]);
    expect(pill.y + pill.height).toBeLessThanOrEqual(panels.y);   // above the panel stack, not over it
  });
});

test.describe('File menu', () => {
  test('holds the set, preset and reset actions in order, and says what each reset does', async ({ app: { page } }) => {
    const items = await page.evaluate(() => [...document.querySelectorAll('#fileMenu [role=menuitem]')].map((b) => b.id));
    expect(items).toEqual(['setNew', 'batchOpenFile', 'batchSave', 'setSaveAs', 'presetImport', 'presetExport', 'softReset', 'resetAll']);
    await page.click('#fileMenuBtn');
    await expect(page.locator('#softReset')).toContainText('Keeps presets, palette and fonts');
    await expect(page.locator('#resetAll')).toContainText('Deletes presets, palette, fonts, emoji and every setting');
    await expect(page.locator('#batchSave kbd')).toHaveText(/^(Ctrl\+|⌘)S$/);
  });

  test('opens under its button, steps with the arrows, and closes with Esc, Tab, a second click or a choice', async ({ app: { page } }) => {
    const btn = page.locator('#fileMenuBtn'), menu = page.locator('#fileMenu');
    await expect(menu).toBeHidden();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#setNew')).toBeFocused();   // focus moves in on the popover's toggle event
    const [m, b] = await Promise.all([menu.boundingBox(), btn.boundingBox()]);
    expect(m.y).toBeGreaterThanOrEqual(b.y + b.height);
    expect(m.x + m.width).toBeCloseTo(b.x + b.width, 0);
    await page.keyboard.press('ArrowDown');
    expect(await focusedId(page)).toBe('batchOpenFile');
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');   // wraps round to the last item
    expect(await focusedId(page)).toBe('resetAll');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click(); await expect(page.locator('#setNew')).toBeFocused();
    await page.locator('#resetAll').focus(); await page.keyboard.press('Tab');   // past the last item and out
    await expect(menu).toBeHidden();
    await btn.click(); await expect(menu).toBeVisible();
    await btn.click(); await expect(menu).toBeHidden();
    const { filename } = await download(page, () => fileMenu(page, 'batchSave'));
    expect(filename).toBe('Untitled set.opntcd');
    await expect(menu).toBeHidden();
    await expect(page.locator('#fileMsg')).toContainText('Saved 1 card to “Untitled set.opntcd”');
  });

  test('presets are exported and imported from the menu; a bad preset file is reported, not alerted', async ({ app: { page } }) => {
    await page.fill('#presetName', 'look');
    const { filename, json } = await download(page, () => fileMenu(page, 'presetExport'));
    expect(filename).toBe('look.json');
    json.size = 77;
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), fileMenu(page, 'presetImport')]);
    await chooser.setFiles({ name: 'look.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
    await expect.poll(() => page.evaluate(() => __tt.S.size)).toBe(77);
    await expect(page.locator('#fileMsg')).toContainText('Applied the preset from “look.json”');
    await page.setInputFiles('#presetFile', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
    await expect(page.locator('#fileMsg')).toContainText('isn\'t an OpenTitlecard preset');
    await expect(page.locator('#fileMsg')).toHaveClass(/bad/);
  });
});

test.describe('set name and .opntcd files', () => {
  test('opening a .opntcd file takes its name; a file without one is named after the file; old .json files still open', async ({ app: { page } }) => {
    await page.setInputFiles('#batchFile', { name: 'whatever.opntcd', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(setFile(['One', 'Two'], { name: 'Promo week' }))) });
    await expect(page.locator('#fileMsg')).toContainText('Opened 2 cards from “whatever.opntcd”');
    await expect(page.locator('#setName')).toHaveValue('Promo week');
    await page.setInputFiles('#batchFile', { name: 'Old cuts-set.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(setFile(['Three']))) });
    await confirmDialog(page, true);   // two cards on the page: it asks before replacing them
    await expect(page.locator('#fileMsg')).toContainText('Opened 1 card');
    await expect(page.locator('#setName')).toHaveValue('Old cuts-set');
    await expect(page.locator('#batchFile')).toHaveAttribute('accept', '.opntcd,.json,application/json');
  });

  test('an empty name falls back to "Untitled set"; Esc puts the old name back; New set starts untitled', async ({ app: { page } }) => {
    await page.fill('#setName', 'Keep');
    await page.press('#setName', 'Enter');
    await page.fill('#setName', 'Typo');
    await page.press('#setName', 'Escape');
    await expect(page.locator('#setName')).toHaveValue('Keep');
    await page.fill('#setName', '   ');
    await page.press('#setName', 'Enter');
    await expect(page.locator('#setName')).toHaveValue('Untitled set');
    await page.fill('#setName', 'Named'); await page.press('#setName', 'Enter');
    await fileMenu(page, 'setNew');   // nothing on the page yet: no question
    await expect(page.locator('#setName')).toHaveValue('Untitled set');
  });

  test('the Export panel offers this card or all cards as two equal buttons, with the count', async ({ app: { page } }) => {
    await expect(page.locator('#batchOpen')).toHaveText('Export as ZIP…');
    await addCard(page, 'Two'); await addCard(page, 'Three');
    await expect(page.locator('#batchOpen')).toHaveText('Export all 3 as ZIP…');
    const [a, b] = await Promise.all([page.locator('#export').boundingBox(), page.locator('#batchOpen').boundingBox()]);
    expect(b.y).toBeGreaterThan(a.y);                         // all cards under this card
    expect([Math.round(b.width), Math.round(b.height)]).toEqual([Math.round(a.width), Math.round(a.height)]);   // same size: one line each
    await expect(page.locator('#batchOpen')).toHaveClass(/primary/);
  });
});

test.describe('shortcuts and drag and drop', () => {
  test('Ctrl+S saves, Ctrl+Shift+S saves too (a copy), Ctrl+O opens the file chooser, even from a text field', async ({ app: { page } }) => {
    await setText(page, 'Hi');
    await page.focus('#text');
    expect((await download(page, () => page.keyboard.press('Control+s'))).filename).toBe('Untitled set.opntcd');
    expect((await download(page, () => page.keyboard.press('Control+Shift+S'))).filename).toBe('Untitled set.opntcd');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Control+o')]);
    expect(await chooser.element().getAttribute('id')).toBe('batchFile');
    await expect(page.locator('#text')).toHaveValue('Hi');   // the key didn't type into the field
  });

  test('a failure after the cards are replaced does not claim that nothing was changed', async ({ app: { page } }) => {
    await page.evaluate(() => {   // the step that records the opened set in undo history fails
      const real = JSON.stringify;
      JSON.stringify = (v, ...r) => { if (v && v.cards && v.shared) { JSON.stringify = real; throw new Error('boom'); } return real(v, ...r); };
    });
    await dropFile(page, 'dropped.opntcd', setFile(['Dropped']));
    await expect(page.locator('#fileMsg')).toContainText('something went wrong while showing it');
    await expect(page.locator('#fileMsg')).not.toContainText('nothing was changed');
    await expect(page.locator('#text')).toHaveValue('Dropped');
  });

  test('dropping a set file opens it, asking first when there is work on the page; other files are refused', async ({ app: { page } }) => {
    await dropFile(page, 'dropped.opntcd', setFile(['Dropped'], { name: 'Dropped set' }));
    await expect(page.locator('#fileMsg')).toContainText('Opened 1 card from “dropped.opntcd”');
    await expect(page.locator('#text')).toHaveValue('Dropped');
    await setText(page, 'My work');
    await dropFile(page, 'other.opntcd', setFile(['Other']));
    await expect(page.locator('#cTitle')).toHaveText('Open this set?');
    await confirmDialog(page, false);
    await expect(page.locator('#text')).toHaveValue('My work');
    await dropFile(page, 'photo.png', 'not a set');
    await expect(page.locator('#fileMsg')).toContainText('Drop an OpenTitlecard set (.opntcd)');
    await expect(page.locator('#text')).toHaveValue('My work');
  });
});

test.describe('Save writes back to the same file (Chromium)', () => {
  test.use({ fileAccess: true });
  test.beforeEach(async ({ app: { page } }) => {
    // stand-ins for Chromium's pickers: they record what is written instead of opening native dialogs
    await page.evaluate(() => {
      window.__fs = { saves: 0, opens: 0, writes: [] };
      const handle = (name) => ({ name, kind: 'file', requestPermission: async () => 'granted',
        getFile: async () => new File([JSON.stringify({ app: 'opentitlecard', type: 'batch', v: 1, active: 0, cards: [{ t: 'Opened' }] })], name),
        createWritable: async () => ({ write: async (d) => window.__fs.writes.push([name, d]), close: async () => {} }) });
      window.showSaveFilePicker = async (o) => { window.__fs.saves++; if (window.__fs.cancel) throw new DOMException('cancelled', 'AbortError'); return handle(o.suggestedName.replace('.opntcd', ' v2.opntcd')); };
      window.showOpenFilePicker = async () => { window.__fs.opens++; return [handle('opened.opntcd')]; };
    });
  });
  const fs = (page) => page.evaluate(() => ({ saves: __fs.saves, opens: __fs.opens, files: __fs.writes.map((w) => w[0]) }));

  test('the first Save asks where; later Saves write to that file; Save as asks again', async ({ app: { page } }) => {
    await setText(page, 'Hi');
    await page.keyboard.press('Control+s');
    await expect.poll(() => fs(page)).toEqual({ saves: 1, opens: 0, files: ['Untitled set v2.opntcd'] });
    await expect(page.locator('#setName')).toHaveValue('Untitled set v2');   // the name picked in the dialog
    await page.keyboard.press('Control+s');
    await expect.poll(() => fs(page)).toEqual({ saves: 1, opens: 0, files: ['Untitled set v2.opntcd', 'Untitled set v2.opntcd'] });
    await fileMenu(page, 'setSaveAs');
    await expect.poll(() => fs(page)).toMatchObject({ saves: 2 });
    const last = await page.evaluate(() => JSON.parse(__fs.writes.at(-1)[1]));
    expect(last.cards[0].t).toBe('Hi');
    await expect(page.locator('#fileMsg')).toContainText('Saved 1 card to “Untitled set v2 v2.opntcd”');
  });

  test('Save as writes the name just picked into the file, and the set is not left looking unsaved', async ({ app: { page } }) => {
    await setText(page, 'Hi');
    await fileMenu(page, 'setSaveAs');
    await expect.poll(() => fs(page)).toMatchObject({ saves: 1 });
    await expect(page.locator('#setName')).toHaveValue('Untitled set v2');
    const saved = await page.evaluate(() => JSON.parse(__fs.writes.at(-1)[1]));
    expect(saved.name).toBe('Untitled set v2');   // not the name from before the dialog
    expect(await page.evaluate(() => __tt.unsavedWork())).toBe(false);
  });

  test('a set opened from a file saves back to it; cancelling the dialog saves nothing', async ({ app: { page } }) => {
    await fileMenu(page, 'batchOpenFile');
    await expect(page.locator('#text')).toHaveValue('Opened');
    await page.keyboard.press('Control+s');
    await expect.poll(() => fs(page)).toEqual({ saves: 0, opens: 1, files: ['opened.opntcd'] });
    await page.evaluate(() => { __fs.cancel = true; });
    await fileMenu(page, 'setSaveAs');
    await expect(page.locator('#fileMsg')).toHaveText('Cancelled. Nothing was saved.');
    expect((await fs(page)).files).toHaveLength(1);
  });
});

test.describe('resets', () => {
  // a preset, a palette color, a changed look and changed settings, as a returning user would have
  async function returningUser(page) {
    await page.evaluate(() => {
      localStorage.setItem('opentitlecard.presets', JSON.stringify({ Mine: { size: 50 } }));
      localStorage.setItem('opentitlecard.defaultPreset', JSON.stringify('Mine'));
      localStorage.setItem('opentitlecard.custom', JSON.stringify(['#123456']));
      localStorage.setItem('opentitlecard.autoScale', 'false');
      localStorage.setItem('opentitlecard.safezone', JSON.stringify({ on: true, kind: 'reels' }));
      localStorage.setItem('opentok.style', JSON.stringify({ size: 33 }));   // left over from before the rename
    });
    await page.fill('#n_size', '120'); await page.press('#n_size', 'Enter');
  }
  const keys = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => /^(opentitlecard|opentok)\./.test(k)).sort());
  async function reset(page, id) {
    await fileMenu(page, id);
    await page.waitForSelector('#confirmDlg[open]');
    await Promise.all([page.waitForEvent('load'), page.click('#cOk')]);
    await page.waitForFunction(() => window.__tt && window.__tt.L);
  }

  test('Soft reset clears the settings and keeps presets, palette and fonts; the default preset applies again', async ({ app: { page } }) => {
    await returningUser(page);
    await fileMenu(page, 'softReset');
    for (const t of ['canvas size', 'overlay, mock-up', 'Kept: your presets, your default preset, your palette colors, your remembered fonts and your emoji library', 'cards on the page are cleared'])
      await expect(page.locator('#cMsg')).toContainText(t);
    await confirmDialog(page, false);   // Cancel changes nothing
    expect(await page.evaluate(() => __tt.S.size)).toBe(120);
    await reset(page, 'softReset');
    const k = await keys(page);
    for (const kept of ['opentitlecard.presets', 'opentitlecard.defaultPreset', 'opentitlecard.custom', 'opentitlecard.rememberedFonts']) expect(k).toContain(kept);
    for (const gone of ['opentitlecard.autoScale', 'opentitlecard.safezone', 'opentok.style']) expect(k).not.toContain(gone);
    expect(await page.evaluate(() => __tt.S.size)).toBe(50);   // the default preset, not the 120 from before
    await expandUi(page);
    await expect(page.locator('#autoScale')).toBeChecked();
    await expect(page.locator('#fontMem')).toBeVisible();   // the loaded test font is still remembered
  });

  test('Reset all deletes everything the app keeps, fonts included, after saying so', async ({ app: { page } }) => {
    await returningUser(page);
    await fileMenu(page, 'resetAll');
    for (const t of ['presets and the default preset', 'palette colors', 'remembered fonts', 'can\'t be undone'])
      await expect(page.locator('#cMsg')).toContainText(t);
    await confirmDialog(page, false);
    await reset(page, 'resetAll');
    expect(await keys(page)).toEqual(['opentitlecard.rememberedFonts']);   // written again on load, now empty
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('opentitlecard.rememberedFonts')))).toEqual([]);
    expect(await page.evaluate(() => [__tt.S.size, __tt.S.family])).toEqual([100, 'Inter']);
    await expect(page.locator('#presetSel option', { hasText: 'Mine' })).toHaveCount(0);
  });
});

