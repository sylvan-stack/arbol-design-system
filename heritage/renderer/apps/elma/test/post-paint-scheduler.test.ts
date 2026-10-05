import assert from 'node:assert/strict'
import test from 'node:test'
import { PostPaintScheduler } from '../src/app/post-paint-scheduler'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('deferred refreshes wait for the explicit paint gate and run once', async () => {
  const scheduler = new PostPaintScheduler()
  const generation = scheduler.begin()
  const calls: string[] = []
  scheduler.defer('inventory', generation, () => { calls.push('old inventory') })
  scheduler.defer('inventory', generation, () => { calls.push('inventory') })
  scheduler.defer('tags', generation, () => { calls.push('tags') })
  await tick()
  assert.deepEqual(calls, [])

  scheduler.markPainted(generation)
  scheduler.markPainted(generation)
  await tick()
  assert.deepEqual(calls, ['inventory', 'tags'])
})

test('refreshes registered after paint still run without a timer', async () => {
  const scheduler = new PostPaintScheduler()
  const generation = scheduler.begin()
  const calls: string[] = []
  scheduler.markPainted(generation)
  scheduler.defer('worktrees', generation, () => { calls.push('worktrees') })
  await tick()
  assert.deepEqual(calls, ['worktrees'])
})

test('one failed refresh does not suppress later work', async () => {
  const scheduler = new PostPaintScheduler()
  const generation = scheduler.begin()
  const calls: string[] = []
  scheduler.defer('broken', generation, async () => { calls.push('broken'); throw new Error('optional failure') })
  scheduler.defer('healthy', generation, () => { calls.push('healthy') })
  scheduler.markPainted(generation)
  await tick()
  assert.deepEqual(calls, ['broken', 'healthy'])
})

test('rapid session switching cancels stale queued work', async () => {
  const scheduler = new PostPaintScheduler()
  const first = scheduler.begin()
  const calls: string[] = []
  scheduler.defer('inventory', first, () => { calls.push('stale') })

  const second = scheduler.begin()
  scheduler.defer('inventory', second, () => { calls.push('current') })
  scheduler.markPainted(first)
  scheduler.markPainted(second)
  await tick()
  assert.deepEqual(calls, ['current'])
})
