import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base = process.env.STORYBOOK_URL || 'http://127.0.0.1:6006';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const checks = [];
async function open(id) {
  await page.goto(base + '/iframe.html?id=' + id + '&viewMode=story');
  await page.waitForFunction(() => !!document.querySelector('#storybook-root')?.textContent.trim());
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('✓ ' + name);
}
try {
  await check(
    'Collection preserves search and selected identity across presentations',
    async () => {
      await open('patterns-collection--default');
      await page.getByRole('searchbox').fill('design');
      await page.getByRole('button', { name: 'Restore the design language', exact: true }).click();
      await page.getByRole('button', { name: 'Table', exact: true }).click();
      assert.equal(await page.getByRole('searchbox').inputValue(), 'design');
      assert.equal(
        await page
          .getByRole('heading', { name: 'Restore the design language', exact: true })
          .count(),
        1,
      );
      await page.getByRole('button', { name: 'Cards', exact: true }).click();
      assert.equal(await page.getByRole('searchbox').inputValue(), 'design');
    },
  );
  await check('No-results recovery restores all collection items', async () => {
    await page.getByRole('searchbox').fill('impossible query');
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    assert.equal(await page.getByRole('searchbox').inputValue(), '');
    assert.equal(
      await page.getByRole('button', { name: 'Preserve chat drafts', exact: true }).count(),
      1,
    );
  });
  await check('Create validates, focuses invalid field, and commits fixture data', async () => {
    await page.getByRole('button', { name: 'New work item', exact: true }).click();
    await page.getByRole('button', { name: 'Create work item', exact: true }).click();
    assert.equal(await page.locator('[aria-invalid=true]').count(), 1);
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-invalid') === 'true',
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-invalid')),
      'true',
    );
    await page.getByRole('textbox', { name: /Title/ }).fill('Keyboard-tested work');
    await page.getByRole('button', { name: 'Create work item', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
      await page.getByRole('button', { name: 'Keyboard-tested work', exact: true }).count(),
      1,
    );
  });
  await check('Dirty Escape keeps draft, offers discard and restores trigger focus', async () => {
    await open('patterns-entityeditor--default');
    await page.getByRole('button', { name: 'Open editor' }).click();
    await page.getByRole('textbox', { name: /Title/ }).fill('Unsaved draft');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: 'Keep editing' }).click();
    assert.equal(await page.getByRole('textbox', { name: /Title/ }).inputValue(), 'Unsaved draft');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Open editor');
  });
  await check('Save failure retains draft and stays in dialog', async () => {
    await open('patterns-entityeditor--save-failure');
    await page.getByRole('button', { name: 'Open editor' }).click();
    await page.getByRole('textbox', { name: /Title/ }).fill('Keep this draft');
    await page.getByRole('button', { name: 'Create work item' }).click();
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('textbox', { name: /Title/ }).inputValue(),
      'Keep this draft',
    );
  });
  await check('Destructive confirmation focuses Cancel and contains keyboard focus', async () => {
    await open('patterns-confirmaction--default');
    await page.getByRole('button', { name: 'Delete work item', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancel');
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')), true);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  });
  await check('Permission resolves once and removes obsolete decisions', async () => {
    await open('patterns-permissionrequest--default');
    await page.getByRole('button', { name: 'Allow once', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Reject', exact: true }).count(), 0);
    assert.equal(await page.getByRole('status').count(), 1);
  });
  await check('Email rule requires a preview before activation', async () => {
    await open('sections-emailruleeditor--default');
    assert.equal(await page.getByRole('button', { name: 'Create rule' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Test retained email' }).click();
    assert.equal(await page.getByRole('button', { name: 'Create rule' }).isEnabled(), true);
    await page.getByRole('button', { name: 'Create rule' }).click();
    assert(await page.getByText('Rule created for future email').isVisible());
  });
  await check(
    'Workspace navigation resets domain records and opens long-form editors',
    async () => {
      await open('pages-seqoya-repos--default');
      await page.getByRole('button', { name: 'Organizations', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: 'Sylvan Stack', exact: true }).count(),
        1,
      );
      assert.equal(await page.getByRole('button', { name: 'mycel', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Blueprints', exact: true }).click();
      await page.getByRole('button', { name: 'New Blueprint' }).click();
      assert(await page.getByRole('textbox', { name: 'Blueprint name' }).isVisible());
      assert.equal(await page.getByRole('dialog').count(), 0);
    },
  );
  await check('Long editor guards navigation and keeps its unsaved values', async () => {
    await page.getByRole('textbox', { name: 'Blueprint name' }).fill('Unsaved blueprint');
    await page.getByRole('button', { name: '← Back to Blueprints' }).click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Blueprint name' }).inputValue(),
      'Unsaved blueprint',
    );
    await page.getByRole('button', { name: 'Save blueprint', exact: true }).click();
    await page.getByRole('button', { name: '← Back to Blueprints' }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert(await page.getByRole('button', { name: 'New Blueprint' }).isVisible());
  });
  await check(
    'Source categories expose distinct cached conversations and empty results',
    async () => {
      await open('sections-sourceinbox--default');
      assert(await page.getByRole('heading', { name: 'Maya Chen' }).isVisible());
      await page.getByRole('button', { name: 'Channels', exact: true }).click();
      assert(await page.getByRole('heading', { name: 'Design systems' }).isVisible());
      await page.getByRole('button', { name: 'Ignored', exact: true }).click();
      assert(await page.getByRole('heading', { name: 'Release updates' }).isVisible());
      await page.getByRole('searchbox').fill('no matches');
      assert(await page.getByRole('heading', { name: 'No conversation selected' }).isVisible());
    },
  );
  await check('Action popover closes on Escape and restores its trigger', async () => {
    await open('patterns-actionpopover--default');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('button', { name: 'Open', exact: true }).focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#storybook-root [popover]').isVisible(), false);
    assert(
      (await page.evaluate(() => document.activeElement?.textContent)).includes('More actions'),
    );
  });
  await check('Read-only records do not offer editing controls', async () => {
    await open('pages-seqoya-reactions--default');
    assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
  });
  const index = JSON.parse(await readFile('storybook-static/index.json', 'utf8'));
  const pages = Object.values(index.entries).filter(
    (x) => x.type === 'story' && x.title.startsWith('Pages/'),
  );
  const overflow = [];
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const story of pages) {
      await open(story.id);
      const metrics = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
      }));
      if (metrics.scroll > metrics.width + 1) overflow.push({ id: story.id, width, ...metrics });
    }
  }
  await writeFile(
    'test-results/responsive-results.json',
    JSON.stringify({ pages: pages.length, widths: [390, 768], overflow }, null, 2),
  );
  assert.deepEqual(overflow, [], 'Pages must keep wide content inside a scrolling region');
  checks.push(`All ${pages.length} pages fit 390px and 768px viewports`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const axe = [];
  for (const id of [
    'components-textfield--invalid',
    'patterns-collection--default',
    'patterns-permissionrequest--default',
    'pages-seqoya-intelligence-providers--default',
    'pages-elma-conversation--default',
    'pages-willo-stations--default',
    'pages-oaken-swimlanes--default',
    'native-adapters-go-to-page--default',
  ]) {
    await open(id);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    axe.push({
      id,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    });
  }
  await writeFile('test-results/accessibility-results.json', JSON.stringify(axe, null, 2));
  assert.equal(
    axe.reduce((n, x) => n + x.violations.length, 0),
    0,
    'Representative WCAG checks should pass',
  );
  checks.push('Eight representative component/page accessibility checks');
  await writeFile('test-results/interaction-results.json', JSON.stringify({ checks }, null, 2));
  console.log(checks.length + ' interaction/layout/accessibility groups passed');
} finally {
  await browser.close();
}
