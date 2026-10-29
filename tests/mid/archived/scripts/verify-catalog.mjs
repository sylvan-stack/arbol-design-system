import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
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
console.log(JSON.stringify({verifiedSourceFiles: checked, archive: 'sha256 verified'}, null, 2));
