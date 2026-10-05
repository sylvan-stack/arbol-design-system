// Unit tests for Elma's pure repo-rule logic (src/policy.ts). These back the
// three picker rules: open-with-repo-default (point 1), disable IPs prohibited
// for the repo (point 2), disable repos prohibited for the chosen IP (point 3).
//
// Pure functions: no bridge, no React. Run via `node renderer/apps/elma/test/run.mjs`
// (esbuild bundles policy.ts — which has no runtime imports — then node --test).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  prohibitedIpsForRepo,
  defaultIpsForRepo,
  prohibitedReposForIp,
  repoDefaultIp,
  newChatIp,
  repoPathsEquivalent,
  type Ip,
  type RepoPolicy,
} from '../src/policy'

const ip = (name: string, extra: Partial<Ip> = {}): Ip => ({
  name,
  provider: 'claude',
  version: '1',
  deprecated: 0,
  default_for_provider: 0,
  subscription_name: `${name}-sub`,
  ...extra,
})

const ARBOL = '/Users/example/repo/sylvan-stack/Arbol'
const WIDGET = '/Users/example/repo/widget'

// Mirrors the live shape: Arbol routes to glm (codex prohibited), widget
// routes to codex (glm prohibited). global default = codex.
const POLICY: RepoPolicy = {
  global_default: 'codex',
  rules: [
    { ip_name: 'glm', repo_path: ARBOL, rule: 'default' },
    { ip_name: 'codex', repo_path: ARBOL, rule: 'prohibited' },
    { ip_name: 'codex', repo_path: WIDGET, rule: 'default' },
    { ip_name: 'glm', repo_path: WIDGET, rule: 'prohibited' },
  ],
}

const IPS: Ip[] = [
  ip('glm', { default_for_provider: 1 }),
  ip('universe'),
  ip('codex'),
]
// Everyone logged in unless a test says otherwise.
const ALL_LOGGED = new Set(IPS.map((i) => `${i.name}-sub`))

test('prohibitedIpsForRepo folds the prohibited rules for a repo', () => {
  assert.deepEqual(prohibitedIpsForRepo(POLICY, ARBOL), new Set(['codex']))
  assert.deepEqual(prohibitedIpsForRepo(POLICY, WIDGET), new Set(['glm']))
})

test('defaultIpsForRepo folds the default rules for a repo', () => {
  assert.deepEqual(defaultIpsForRepo(POLICY, ARBOL), ['glm'])
  assert.deepEqual(defaultIpsForRepo(POLICY, WIDGET), ['codex'])
})

test('a repo with no rules has no prohibitions or defaults', () => {
  assert.equal(prohibitedIpsForRepo(POLICY, '/Users/example/repo/unknown').size, 0)
  assert.deepEqual(defaultIpsForRepo(POLICY, '/Users/example/repo/unknown'), [])
})

test('prohibitedReposForIp folds the prohibited rules for an IP', () => {
  assert.deepEqual(prohibitedReposForIp(POLICY, 'codex'), new Set([ARBOL]))
  assert.deepEqual(prohibitedReposForIp(POLICY, 'glm'), new Set([WIDGET]))
})

test('repoDefaultIp: point 1 — opens a repo with its repo default', () => {
  assert.equal(repoDefaultIp(POLICY, ARBOL, IPS, ALL_LOGGED), 'glm')
  assert.equal(repoDefaultIp(POLICY, WIDGET, IPS, ALL_LOGGED), 'codex')
})

test('repoDefaultIp: falls back to the global default when the repo has none', () => {
  assert.equal(repoDefaultIp(POLICY, '/Users/example/repo/unknown', IPS, ALL_LOGGED), 'codex')
})

test('repoDefaultIp: never picks a prohibited IP, even one that is logged in', () => {
  // widget: default = codex (logged out here), prohibited = glm
  // (logged in here). The repo default and global default are both codex
  // (unusable, logged out), glm is logged in but prohibited — so the
  // fallback must land on the one usable, non-prohibited IP: universe.
  const logged = new Set(['glm-sub', 'universe-sub'])
  const picked = repoDefaultIp(POLICY, WIDGET, IPS, logged)
  assert.equal(picked, 'universe')
  assert.notEqual(picked, 'glm') // prohibited here — must never be chosen
})

test('repoDefaultIp: returns "" when nothing is usable', () => {
  assert.equal(repoDefaultIp(POLICY, ARBOL, IPS, new Set()), '')
})


test('newChatIp does not inherit the IP remembered by a previous session', () => {
  assert.equal(newChatIp(POLICY, ARBOL, IPS, ALL_LOGGED, 'codex', false), 'glm')
})

test('newChatIp preserves an explicit choice made for the empty new chat', () => {
  assert.equal(newChatIp(POLICY, ARBOL, IPS, ALL_LOGGED, 'universe', true), 'universe')
})


test('legacy Arbol paths match the canonical grouped policy path', () => {
  assert.equal(repoPathsEquivalent('/~/repo/Arbol', ARBOL), true)
  assert.equal(repoPathsEquivalent('~/repo/Arbol', ARBOL), true)
  assert.deepEqual(defaultIpsForRepo(POLICY, '/~/repo/Arbol'), ['glm'])
  assert.equal(repoDefaultIp(POLICY, '~/repo/Arbol', IPS, ALL_LOGGED), 'glm')
})

test('path aliases do not match unrelated repositories', () => {
  assert.equal(repoPathsEquivalent('/work/repo/Arbol', '/work/repo/other/Arbol'), false)
  assert.equal(repoPathsEquivalent('/Users/example/repo/widget', ARBOL), false)
})
