import { describe, expect, it, vi } from 'vitest'

vi.mock('@arbol/design-system', () => ({ call: vi.fn() }))

import { archiveJiraItem, fetchJiraItem, fetchMyJiraTickets } from '../src/tasks/jira'

describe('Fetch my tickets', () => {
  it('uses the bulk Jira fetch RPC and maps its result', async () => {
    const rpc = vi.fn().mockResolvedValue({
      matched: 3,
      archived: 1,
      fetched: 2,
      failed: 1,
      failures: [{ key: 'ARB-3', error: 'forbidden' }],
      message: 'Fetched and normalized 2 Jira tickets',
    })

    await expect(fetchMyJiraTickets(rpc)).resolves.toEqual({
      matched: 3,
      archived: 1,
      fetched: 2,
      failed: 1,
      failures: [{ key: 'ARB-3', error: 'forbidden' }],
      logs: [],
      message: 'Fetched and normalized 2 Jira tickets',
    })
    expect(rpc).toHaveBeenCalledWith('jira.fetch_my_tickets', {})
  })
})


describe('Archive Jira ticket', () => {
  it('uses the archive RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ ok: true })
    const item = { key: 'ARB-7' } as any
    await archiveJiraItem(item, rpc)
    expect(rpc).toHaveBeenCalledWith('jira.archive_ticket', { key: 'ARB-7' })
  })

  it('refuses to fetch an archived item', async () => {
    const rpc = vi.fn()
    await expect(fetchJiraItem({ key: 'ARB-7', archived: true, url: 'https://jira/ARB-7' } as any, rpc))
      .rejects.toThrow('ARB-7 is archived')
    expect(rpc).not.toHaveBeenCalled()
  })
})
