// Actual TypeScript module graph and DTO behavior; no daemon or gate simulation.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../..')
const require = createRequire(join(renderer, 'package.json'))
const { build } = require('esbuild')
const cache = join(renderer, 'node_modules/.cache')
mkdirSync(cache, { recursive: true })
const temporary = mkdtempSync(join(cache, 'arbol-state-profile-'))

try {
  const output = join(temporary, 'state.mjs')
  const result = await build({ entryPoints: [resolve(here, '../src/state.ts')], bundle: true,
    platform: 'node', format: 'esm', outfile: output, metafile: true })
  const module = await import(pathToFileURL(output))
  test('actual state entry graph excludes legacy replay and preserves DTO/live render exports', () => {
    assert(!Object.keys(result.metafile.inputs).some((path) => path.endsWith('/project.ts')))
    assert.equal(typeof module.initialChatSession, 'function')
    assert.equal(typeof module.chatSessionView, 'function')
    assert.equal(typeof module.onRenderInvalidation, 'function')
    assert.equal(module.projectChatSession, undefined)
    assert.equal(module.replayChatSession, undefined)
    const initial = module.initialChatSession('real-dto-contract')
    assert.equal(initial.chat_session_id, 'real-dto-contract')
    assert.deepEqual(initial.messages, [])
    assert.deepEqual(initial.toolRequests, {})
  })
  const configFile = join(temporary, 'config.mjs')
  await build({ entryPoints: [resolve(renderer, 'vite.shared.ts')], bundle: true,
    platform: 'node', format: 'esm', outfile: configFile, packages: 'external' })
  const { appConfig } = await import(pathToFileURL(configFile))
  test('only explicit state Vite builds select neutral exports and reject a durable fold import', () => {
    const original = process.env.ARBOL_BUILD_PROFILE
    try {
      delete process.env.ARBOL_BUILD_PROFILE
      assert(appConfig(resolve(renderer, 'apps/elma'), 'elma').resolve.alias['@arbol/events'].endsWith('/index.ts'))
      process.env.ARBOL_BUILD_PROFILE = 'state'
      const config = appConfig(resolve(renderer, 'apps/elma'), 'elma')
      assert(config.resolve.alias['@arbol/events'].endsWith('/state.ts'))
      const guard = config.plugins.find((plugin) => plugin.name === 'arbol-state-replay-boundary')
      assert.throws(() => guard.moduleParsed({ id: resolve(renderer, 'packages/events/src/project.ts') }), /durable event fold/)
      guard.moduleParsed({ id: resolve(renderer, 'packages/events/src/view.ts') })
    } finally {
      if (original === undefined) delete process.env.ARBOL_BUILD_PROFILE
      else process.env.ARBOL_BUILD_PROFILE = original
    }
  })
} finally {
  // Delete only this test's newly created temporary compiler outputs.
  rmSync(temporary, { recursive: true, force: true })
}
