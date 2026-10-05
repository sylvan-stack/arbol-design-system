import { describe, expect, it, vi } from 'vitest'

vi.mock('@arbol/design-system', () => ({ call: vi.fn() }))
import { fetchMyOpenMergeRequests } from '../src/tasks/mergeRequests'

describe('fetchMyOpenMergeRequests', () => {
  it('calls the bulk GitLab refresh RPC and returns its summary', async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = []
    const result = await fetchMyOpenMergeRequests(async (method, params) => {
      calls.push([method, params])
      return { projects: ['platform/widget'], matched: 2, fetched: 2, failed: 0, failures: [], message: 'Fetched 2' }
    })

    expect(calls).toEqual([['gitlab.fetch_my_open_merge_requests', {}]])
    expect(result.fetched).toBe(2)
  })
})
