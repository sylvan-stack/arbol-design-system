import { buildSync } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const temporary = mkdtempSync(join(tmpdir(), 'arbol-rebuild-timing-'))
try {
  const outfile = join(temporary, 'test.mjs')
  buildSync({
    entryPoints: [fileURLToPath(new URL('./rebuildTiming.test.ts', import.meta.url))],
    outfile, bundle: true, format: 'esm', platform: 'node',
  })
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
