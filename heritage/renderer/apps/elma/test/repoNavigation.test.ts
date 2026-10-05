import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRepoSlots, navigationTargets, repoForWorkspacePath, repoNavigationAction } from '../src/nav/repoNavigation'

test('mouse selection changes the attached session working directory without detaching its composer', () => {
  assert.deepEqual(repoNavigationAction('mouse', true), {
    kind: 'change-current-session',
    detachComposer: false,
  })
})

test('mouse selection opens a new chat when no session exists yet', () => {
  assert.deepEqual(repoNavigationAction('mouse', false), { kind: 'new-chat', detachComposer: true })
})

test('hotkeys always open a new chat', () => {
  assert.deepEqual(repoNavigationAction('hotkey', true), { kind: 'new-chat', detachComposer: true })
  assert.deepEqual(repoNavigationAction('hotkey', false), { kind: 'new-chat', detachComposer: true })
})


test('resolves a branch worktree path to its owning repository', () => {
  const repos = [
    { name: 'Arbol', path: '/repo/sylvan-stack/Arbol', container: true },
    { name: 'widget', path: '/repo/widget' },
  ]
  assert.equal(repoForWorkspacePath(repos, '/repo/sylvan-stack/Arbol/main')?.name, 'Arbol')
  assert.equal(repoForWorkspacePath(repos, '/repo/widget')?.name, 'widget')
})

test('does not treat an arbitrary nested folder as a repository worktree', () => {
  const repos = [{ name: 'widget', path: '/repo/widget' }]
  assert.equal(repoForWorkspacePath(repos, '/repo/widget/packages/main'), undefined)
})

const arbol = { name: 'Arbol', path: '/repo/sylvan-stack/Arbol', container: true }
const organization = { name: 'Euro-Office', root: '/repo/Euro-Office' }
const core = { name: 'core', path: '/repo/Euro-Office/core' }

test('Euro Office owns Cmd+2 even when another organization is configured first', () => {
  const euroOffice = { name: 'Euro Office', root: '/Users/example/repos/euro-office' }
  const organizations = [{ name: 'Acme', root: '/repos/acme' }, euroOffice]
  const targets = navigationTargets([arbol, core], organizations)
  assert.deepEqual(buildRepoSlots(targets, [core])[1], {
    key: '⌘2', name: euroOffice.name, path: euroOffice.root,
  })
  assert.equal(organizations[0].name, 'Acme')
})

test('lowercase Arbol checkout owns Cmd+1 without a duplicate recent or placeholder', () => {
  const checkout = { name: 'arbol', path: '/repos/sylvan-stack/arbol' }
  const other = { name: 'arbol-rebuild-survival', path: '/repos/arbol-rebuild-survival' }
  assert.deepEqual(buildRepoSlots([checkout, other], [
    checkout,
    { name: 'Arbol', path: '/old/Arbol' },
    { name: 'old-alias', path: `${checkout.path}/` },
  ]), [
    { key: '⌘1', ...checkout },
    { key: '⌘2', ...other },
  ])
})

test('organization shortcuts stay unique and within nine slots', () => {
  const organizations = Array.from({ length: 12 }, (_, i) => ({ name: `Org-${i}`, root: `/repo/org-${i}` }))
  const targets = navigationTargets([arbol], [{ name: 'Arbol', root: arbol.path }, ...organizations])
  const slots = buildRepoSlots(targets, [core])
  assert.equal(slots.length, 9)
  assert.equal(new Set(slots.map((slot) => slot.name)).size, 9)
  assert.equal(slots[8].key, '⌘9')
})

test('Cmd+2 selects the configured organization by its name, while members keep their identity', () => {
  const targets = navigationTargets([core, arbol], [organization])
  assert.deepEqual(buildRepoSlots(targets, []), [
    { key: '⌘1', name: 'Arbol', path: arbol.path },
    { key: '⌘2', name: 'Euro-Office', path: organization.root },
    { key: '⌘3', name: 'core', path: core.path },
  ])
  assert.equal(repoForWorkspacePath(targets, core.path)?.name, 'core')
  assert.equal(repoForWorkspacePath(targets, organization.root)?.name, 'Euro-Office')
  assert.equal(repoForWorkspacePath(targets, `${organization.root}/unknown`), undefined)
})

test('recent targets reorder Cmd+3–9 without shifting or duplicating pinned targets', () => {
  const others = Array.from({ length: 10 }, (_, i) => ({ name: `repo-${i}`, path: `/repo/repo-${i}` }))
  const targets = navigationTargets([arbol, core, ...others], [organization])
  const recents = [
    { name: 'main', path: `${arbol.path}/main` },
    { name: 'Euro-Office', path: `${organization.root}/` },
    others[7], core, others[7],
  ]
  const slots = buildRepoSlots(targets, recents)
  assert.deepEqual(slots.map((slot) => slot.name), [
    'Arbol', 'Euro-Office', 'repo-7', 'core', 'repo-0', 'repo-1', 'repo-2', 'repo-3', 'repo-4',
  ])
  assert.deepEqual(slots.map((slot) => slot.key), Array.from({ length: 9 }, (_, i) => `⌘${i + 1}`))
  assert.equal(buildRepoSlots(targets, [core, ...recents])[2].name, 'core')
})

test('missing pinned targets reserve their keys and Other-folder recents remain usable', () => {
  const targets = navigationTargets([], [{ name: 'Euro-Office', root: '' }])
  assert.deepEqual(buildRepoSlots(targets, [{ name: 'scratch', path: '/tmp/scratch' }]), [
    { key: '⌘1', name: 'Arbol', path: '' },
    { key: '⌘2', name: 'Euro-Office', path: '' },
    { key: '⌘3', name: 'scratch', path: '/tmp/scratch' },
  ])
})
