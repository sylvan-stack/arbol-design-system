#!/usr/bin/env node
// TS unit-test runner for Elma's pure cores (policy, fold-derived tree). Same
// approach as renderer/packages/events/test/run.mjs: there is no vitest/tsx in
// this repo, so we bundle each `*.test.ts` (+ the pure src modules it imports,
// e.g. policy.ts / constants.ts — no runtime imports) with the esbuild binary
// already in renderer/node_modules, then run them under node's built-in test
// runner. `import type` lines (e.g. from '@arbol/events') are erased by esbuild,
// so type-only cross-package imports need no module resolution.
//
//   node renderer/apps/elma/test/run.mjs

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(here, '../../..') // renderer/
const esbuild = resolve(rendererRoot, 'node_modules/.bin/esbuild')

const tests = readdirSync(here).filter((f) => f.endsWith('.test.ts'))
if (tests.length === 0) process.exit(0)

const outdir = mkdtempSync(join(tmpdir(), 'arbol-elma-'))
const bundle = spawnSync(
  esbuild,
  [
    ...tests.map((f) => join(here, f)),
    '--bundle',
    '--format=esm',
    '--platform=node',
    // Pure Elma tests only need parseMarkdown/AnswerBlock. Resolving the package
    // barrel pulls every Svelte component into plain esbuild, which has no
    // .svelte loader; point the package name at its pure markdown implementation.
    `--alias:@arbol/design-system=${resolve(rendererRoot, 'packages/design-system/src/markdown/blocks.ts')}`,
    '--out-extension:.js=.mjs',
    `--outdir=${outdir}`,
  ],
  { stdio: 'inherit' },
)
if (bundle.status !== 0) process.exit(bundle.status ?? 1)

const outs = tests.map((f) => join(outdir, f.replace(/\.ts$/, '.mjs')))
const run = spawnSync(process.execPath, ['--test', ...outs], { stdio: 'inherit' })
process.exit(run.status ?? 1)
