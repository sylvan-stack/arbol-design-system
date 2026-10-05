import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.STORYBOOK_URL || 'http://127.0.0.1:6006';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
try {
  const page = await browser.newPage();
  await page.goto(base + '/iframe.html?id=foundations-themes--default&viewMode=story');
  await page.waitForFunction(() => !!document.querySelector('#storybook-root')?.textContent.trim());
  const results = await page.evaluate(() => {
    const themes = [
      'ironbark',
      'bloodwood',
      'redwood',
      'mahogany',
      'cedar',
      'evergreen',
      'driftwood',
      'amber',
      'sandstone',
      'oat',
      'birch',
      'paper',
    ];
    const results = [];
    const probe = document.createElement('div');
    document.body.append(probe);
    const ctx = document.createElement('canvas').getContext('2d');
    function rgb(color) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => v / 255);
    }
    function luminance(color) {
      return rgb(color)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
    }
    function ratio(fg, bg) {
      probe.style.color = `var(${fg})`;
      probe.style.background = `var(${bg})`;
      const style = getComputedStyle(probe),
        a = luminance(style.color),
        b = luminance(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    for (const theme of themes) {
      document.documentElement.dataset.theme = theme;
      for (const background of ['--canvas', '--panel', '--inset', '--selected'])
        for (const foreground of [
          '--text',
          '--muted',
          '--link',
          '--success',
          '--warning',
          '--failure',
        ])
          results.push({ theme, foreground, background, ratio: ratio(foreground, background) });
      results.push({
        theme,
        foreground: '--action-ink',
        background: '--accent',
        ratio: ratio('--action-ink', '--accent'),
      });
    }
    probe.remove();
    return results;
  });
  await writeFile('test-results/theme-contrast.json', JSON.stringify(results, null, 2));
  const failures = results.filter((r) => r.ratio < 4.5);
  console.log(`${results.length} text/background pairs: ${failures.length} below 4.5:1`);
  if (failures.length) console.log(failures);
  assert.equal(failures.length, 0);
} finally {
  await browser.close();
}
