#!/usr/bin/env node
// TS unit-test runner for liveTails.ts — same esbuild-bundle + node --test
// approach as run.mjs. '@arbol/design-system' is aliased to the local stub:
// the real module wires window bridge hooks at import time and re-exports
// .svelte components, neither of which exists under node.
//
//   node renderer/apps/willo/test/run-live-tails.mjs

import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const esbuild = resolve(here, '../../../node_modules/.bin/esbuild')
const stub = join(here, 'designSystemStub.ts')
const out = join(mkdtempSync(join(tmpdir(), 'arbol-willo-tails-')), 'liveTails.test.mjs')

const bundle = spawnSync(
  esbuild,
  [
    join(here, 'liveTails.test.ts'),
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--alias:@arbol/design-system=${stub}`,
    `--outfile=${out}`,
  ],
  { stdio: 'inherit' },
)
if (bundle.status !== 0) process.exit(bundle.status ?? 1)

const run = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' })
process.exit(run.status ?? 1)
