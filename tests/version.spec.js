const fs = require('fs');
const path = require('path');
const { test, expect } = require('./helpers');

// One version, three places: package.json (x.y.0), the header and the newest CHANGELOG.md entry.
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

test.describe('version', () => {
  test('package.json, the header and the changelog agree', async ({ app: { page } }) => {
    const m = /^(\d+)\.(\d+)\.0$/.exec(pkg.version);
    expect(m, 'package.json version is MAJOR.MINOR.0').not.toBeNull();
    const v = `v${m[1]}.${m[2]}`;
    await expect(page.locator('header h1 #appVersion')).toHaveText(v);
    const newest = /^## (v\S+)/m.exec(changelog);
    expect(newest && newest[1], 'newest CHANGELOG.md entry').toBe(v);
  });

  test('the version sits next to the name and links to the changelog', async ({ app: { page } }) => {
    const ver = page.locator('#appVersion');
    await expect(ver).toHaveAttribute('href', /CHANGELOG\.md$/);
    await expect(ver).toHaveAttribute('target', '_blank');
    const [h, b] = await Promise.all([page.locator('header h1').boundingBox(), ver.boundingBox()]);
    expect(b.x).toBeLessThan(300); // top left, with the name
    expect(b.y).toBeGreaterThanOrEqual(h.y - 2);
  });
});
