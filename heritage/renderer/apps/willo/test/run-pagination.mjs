#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const esbuild = resolve(here, '../../../node_modules/.bin/esbuild')
const out = join(mkdtempSync(join(tmpdir(), 'arbol-willo-runs-')), 'test.mjs')
const bundle = spawnSync(esbuild, [join(here, 'runPagination.test.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`], { stdio: 'inherit' })
if (bundle.status !== 0) process.exit(bundle.status ?? 1)
const run = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' })
process.exit(run.status ?? 1)
