import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.STORYBOOK_URL || 'http://127.0.0.1:6006';
const index = JSON.parse(await readFile('storybook-static/index.json', 'utf8'));
const docs = Object.values(index.entries).filter(
  (e) => e.type === 'docs' && e.title.startsWith('Design contracts/'),
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
const results = [];
try {
  const page = await browser.newPage();
  for (const doc of docs) {
    const errors = [];
    const handler = (e) => errors.push(e.message);
    page.on('pageerror', handler);
    await page.goto(base + '/iframe.html?id=' + doc.id + '&viewMode=docs');
    await page.waitForFunction(
      () => document.querySelector('#storybook-docs')?.textContent.length > 500,
    );
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(await page.locator('.sb-errordisplay').isVisible(), false);
    results.push({ id: doc.id, ok: true });
    page.off('pageerror', handler);
  }
  await writeFile('test-results/documentation-results.json', JSON.stringify(results, null, 2));
  console.log(`${results.length} Design System chapters rendered`);
} finally {
  await browser.close();
}
