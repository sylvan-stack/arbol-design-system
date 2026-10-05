import { describe, expect, it, vi } from 'vitest'

vi.mock('@arbol/design-system', () => ({ call: vi.fn() }))

import { loadJiraItems } from '../src/tasks/jira'

type Node = { name: string; path: string; type: 'dir' | 'file'; children?: Node[] }
const file = (path: string): Node => ({ name: path.split('/').at(-1)!, path, type: 'file' })

const ticket = `---
key: ARB-1
summary: Parsed ticket
updated: 2026-01-01
---
# ARB-1: Parsed ticket

## Description

Already normalized.
`

describe('Jira item loading', () => {
  it('loads parsed ticket artifacts with one bulk read and never accesses raw mirrors', async () => {
    const storedPath = 'tickets/ARB-1/ticket.md'
    const rpc = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'artifacts.tree' && params?.repo === 'jira') {
        return { root: '/artifacts/jira', tree: [file(storedPath)] }
      }
      if (method === 'artifacts.read_many' && params?.repo === 'jira') {
        return { files: [{ path: storedPath, exists: true, content: ticket }] }
      }
      throw new Error(`Unexpected RPC ${method}`)
    })

    const result = await loadJiraItems(rpc)

    expect(result.items.map((item) => item.key)).toEqual(['ARB-1'])
    expect(result.converted).toBe(0)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith('artifacts.tree', { repo: 'jira' })
    expect(rpc).toHaveBeenCalledWith('artifacts.read_many', { repo: 'jira', paths: [storedPath] })
    expect(rpc).not.toHaveBeenCalledWith('artifacts.tree', { repo: 'mirrors/jira' })
    expect(rpc).not.toHaveBeenCalledWith('artifacts.read_many', expect.objectContaining({ repo: 'mirrors/jira' }))
  })

  it('does not read a corpus when no parsed tickets exist', async () => {
    const rpc = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'artifacts.tree' && params?.repo === 'jira') return { root: '', tree: [] }
      throw new Error(`Unexpected RPC ${method}`)
    })

    await expect(loadJiraItems(rpc)).resolves.toMatchObject({ items: [], converted: 0 })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
