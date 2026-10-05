import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const index = await readJson('storybook-static/index.json');
const entries = Object.values(index.entries);
const stories = entries.filter((e) => e.type === 'story');
const pages = await readJson('src/pages/catalog.json');
for (const page of pages) {
  const title = `Pages/${page.workspace}/${page.title}`;
  assert(
    stories.some((e) => e.title === title),
    `Missing page: ${title}`,
  );
}
const counts = {};
for (const [directory, title] of [
  ['components', 'Components'],
  ['patterns', 'Patterns'],
  ['sections', 'Sections'],
]) {
  const files = (await readdir(`src/${directory}`)).filter((f) => f.endsWith('.svelte'));
  counts[directory] = files.length;
  for (const file of files)
    assert(
      stories.some((e) => e.title === `${title}/${file.slice(0, -7)}`),
      `No isolated story for ${file}`,
    );
}
const map = await readJson('docs/legacy-component-map.json');
assert.equal(map.length, 213, 'The complete captured Svelte inventory must stay accounted for');
for (const row of map) {
  assert(index.entries[row.story], `Invalid mapped story: ${row.story} from ${row.source}`);
  assert((await stat(`heritage/${row.source}`)).isFile());
}
const manifest = await readJson('docs/design-system/snapshot-manifest.json');
const archive = await readFile('docs/design-system/ui-source-snapshot.tar.gz');
assert.equal(
  createHash('sha256').update(archive).digest('hex'),
  manifest.archive_sha256,
  'Source archive hash',
);
let checked = 0;
for (const file of manifest.files) {
  const path =
    file.path.startsWith('renderer/') ||
    file.path.startsWith('app/') ||
    file.path.startsWith('design_handoff_oaken/')
      ? `heritage/${file.path}`
      : null;
  if (path) {
    const content = await readFile(path);
    assert.equal(
      createHash('sha256').update(content).digest('hex'),
      file.sha256,
      `Original source changed: ${path}`,
    );
    checked++;
  }
}
console.log(
  JSON.stringify(
    {
      stories: stories.length,
      documentation: entries.filter((e) => e.type === 'docs').length,
      pages: pages.length,
      ...counts,
      legacyComponents: map.length,
      verifiedSourceFiles: checked,
      archive: 'sha256 verified',
    },
    null,
    2,
  ),
);
