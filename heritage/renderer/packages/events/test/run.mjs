#!/usr/bin/env node
// TS unit-test runner for @arbol/events (Step 6.1). There is no vitest/tsx in
// this repo, so we bundle the test (+ its import of project.ts) with the
// esbuild binary already present in renderer/node_modules, then run it under
// node's built-in test runner. `import type` lines are erased by esbuild, so the
// type-only dependency on catalog.gen drops out and nothing else is pulled in.
//
//   node renderer/packages/events/test/run.mjs

import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(here, '../../..') // renderer/
const esbuild = resolve(rendererRoot, 'node_modules/.bin/esbuild')

const entry = join(here, 'project.test.ts')
const out = join(mkdtempSync(join(tmpdir(), 'arbol-events-')), 'project.test.mjs')

const bundle = spawnSync(
  esbuild,
  [entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`],
  { stdio: 'inherit' },
)
if (bundle.status !== 0) process.exit(bundle.status ?? 1)

const run = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' })
process.exit(run.status ?? 1)
