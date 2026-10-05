import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const selected = process.argv.slice(2)
if (!selected.length) {
  console.error('usage: node run-selected.mjs <test.ts> [...]')
  process.exit(2)
}

const esbuild = join(here, '../../../node_modules/.bin/esbuild')
const outdir = mkdtempSync(join(tmpdir(), 'arbol-elma-selected-'))
try {
  const outputs = []
  for (const name of selected) {
    const input = join(here, name)
    const output = join(outdir, basename(name, '.ts') + '.mjs')
    const bundle = spawnSync(esbuild, [input, '--bundle', '--format=esm', '--platform=node', `--outfile=${output}`], { stdio: 'inherit' })
    if (bundle.status !== 0) process.exit(bundle.status ?? 1)
    outputs.push(output)
  }
  const test = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...outputs], { stdio: 'inherit' })
  process.exit(test.status ?? 1)
} finally {
  rmSync(outdir, { recursive: true, force: true })
}
