import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const base = process.env.STORYBOOK_URL || 'http://127.0.0.1:6007';
let server;
if (!process.env.STORYBOOK_URL) {
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    env: { ...process.env, PORT: '6007' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/index.json')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
const index = JSON.parse(await readFile('storybook-static/index.json', 'utf8'));
const stories = Object.values(index.entries).filter((e) => e.type === 'story');
const results = [];
let cursor = 0;
try {
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      });
      while (cursor < stories.length) {
        const story = stories[cursor++];
        const errors = [];
        const handler = (e) => errors.push(e.message);
        page.on('pageerror', handler);
        try {
          await page.goto(base + '/iframe.html?id=' + story.id + '&viewMode=story');
          await page.locator('#storybook-root').waitFor();
          await page.waitForFunction(
            () =>
              document.querySelector('#storybook-root')?.childElementCount > 0 ||
              document.querySelector('#storybook-root')?.textContent.trim().length > 0,
          );
          await page.waitForTimeout(80);
          const errorVisible = await page.locator('.sb-errordisplay').isVisible();
          assert(!errorVisible, 'Storybook error display');
          assert.equal(errors.length, 0, errors.join('\n'));
          results.push({ id: story.id, ok: true });
        } catch (e) {
          results.push({ id: story.id, ok: false, error: String(e) });
        } finally {
          page.off('pageerror', handler);
        }
      }
      await page.close();
    }),
  );
  await writeFile('test-results/render-results.json', JSON.stringify(results, null, 2));
  const failures = results.filter((r) => !r.ok);
  console.log(`Rendered ${results.length} stories: ${failures.length} failures`);
  if (failures.length) console.log(failures);
  assert.equal(failures.length, 0, 'Every story must render');
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  for (const id of [
    'start-here--default',
    'pages-seqoya-intelligence-providers--default',
    'pages-elma-conversation--default',
    'pages-willo-stations--default',
    'pages-oaken-swimlanes--default',
    'patterns-collection--table',
  ]) {
    await page.goto(base + '/iframe.html?id=' + id + '&viewMode=story');
    await page.waitForFunction(
      () =>
        document.querySelector('#storybook-root')?.childElementCount > 0 ||
        document.querySelector('#storybook-root')?.textContent.trim().length > 0,
    );
    await page.screenshot({ path: 'test-results/' + id + '.png', fullPage: true });
  }
  await page.close();
} finally {
  await browser.close();
  server?.kill();
}
