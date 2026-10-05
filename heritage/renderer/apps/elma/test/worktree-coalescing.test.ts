import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('worktree requests share an in-flight promise by session and repository', () => {
  const source = readFileSync(join(process.cwd(), 'renderer/apps/elma/src/api.ts'), 'utf8')
  assert.match(source, /const worktreeRequests = new Map<string, Promise<WorktreeList>>\(\)/)
  assert.match(source, /const existing = worktreeRequests\.get\(key\)[\s\S]*if \(existing\) return existing/)
  assert.match(source, /worktrees: coalescedWorktrees/)
})
