#!/usr/bin/env node
// TS unit-test runner for stationSearch.ts — same esbuild-bundle + node --test
// approach as run.mjs. stationSearch imports only pure helpers, but its
// type-only imports reach api.ts/monitor.ts, so bundle with the same aliases.
//
//   node renderer/apps/willo/test/run-station-search.mjs

import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(here, '../../..')
const esbuild = resolve(rendererRoot, 'node_modules/.bin/esbuild')
const eventsProject = resolve(rendererRoot, 'packages/events/src/project.ts')
const designSystemStub = join(here, 'designSystemStub.ts')
const out = join(mkdtempSync(join(tmpdir(), 'arbol-willo-search-')), 'stationSearch.test.mjs')

const bundle = spawnSync(
  esbuild,
  [
    join(here, 'stationSearch.test.ts'),
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--alias:@arbol/events=${eventsProject}`,
    `--alias:@arbol/design-system=${designSystemStub}`,
    `--outfile=${out}`,
  ],
  { stdio: 'inherit' },
)
if (bundle.status !== 0) process.exit(bundle.status ?? 1)

const run = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' })
process.exit(run.status ?? 1)
