import { describe, expect, it, vi } from 'vitest'

vi.mock('@arbol/design-system', () => ({
  call: vi.fn(), callNative: vi.fn(),
}))

import { clearJiraFetchLogs, createJiraChat, editableJiraFields, fetchJiraItem, jiraFetchLogSnapshot, jiraItemFromRaw, jiraTicketChatNote, loadJiraItems, rememberJiraFetchLogs, saveJiraOverrides } from '../src/tasks/jira'

type Node = { name: string; path: string; type: 'dir' | 'file'; children?: Node[] }
const file = (path: string): Node => ({ name: path.split('/').at(-1)!, path, type: 'file' })

function rawTicket() {
  return jiraItemFromRaw(JSON.stringify({
    key: 'ARB-42',
    self: 'https://jira.example/rest/api/2/issue/42',
    fields: {
      summary: 'Jira summary', description: 'Jira description',
      assignee: { displayName: 'Jira Person' }, status: { name: 'Backlog' },
      issuetype: { name: 'Story' }, updated: '2026-01-01T10:00:00Z',
    },
  }), 'ARB-42.json')
}

describe('Jira normalized overrides', () => {
  it('does not mistake a Jira project name for a code repository', () => {
    const item = jiraItemFromRaw(JSON.stringify({
      key: 'DEMO-10010',
      fields: {
        project: { key: 'V3', name: 'Core V3' },
        summary: 'Jira summary',
      },
    }), 'DEMO-10010.json')

    expect(item.repository).toBe('')
    expect(item.jiraValues.repository).toBe('')
    expect(item.overrides).toEqual({})
  })

  it('infers mycel from nested team metadata in the complete raw payload', () => {
    const item = jiraItemFromRaw(JSON.stringify({
      key: 'ARB-44',
      fields: {
        project: { key: 'MYC', name: 'Playground' },
        summary: 'Sync the corpus',
        customfield_35933: [{ value: 'mycel' }],
      },
    }), 'ARB-44.json')

    expect(item.repository).toBe('mycel')
    expect(item.jiraValues.repository).toBe('mycel')
  })

  it('lets a payload signal in the description outrank the title', () => {
    const item = jiraItemFromRaw(JSON.stringify({
      key: 'ARB-45',
      fields: {
        summary: 'Limits cannot be saved',
        description: 'Fix lives in platform/mycel.',
      },
    }), 'ARB-45.json')

    expect(item.repository).toBe('mycel')
  })

  it('prefers a Jira Repository custom field over the Jira project', () => {
    const item = jiraItemFromRaw(JSON.stringify({
      key: 'ARB-43',
      names: { customfield_12345: 'Repository' },
      fields: {
        project: { key: 'MYC', name: 'Playground' },
        customfield_12345: { value: 'mycel' },
      },
    }), 'ARB-43.json')

    expect(item.repository).toBe('mycel')
  })


  it('returns and retains fetch and parser diagnostics in memory', async () => {
    clearJiraFetchLogs()
    const item = rawTicket()
    const rpc = vi.fn(async () => ({
      handled: true,
      status: 'completed',
      handler_result: {
        repository: '',
        message: 'Fetched and normalized ARB-42',
        logs: [
          { at: '2026-01-01T10:00:00Z', stage: 'mirror', level: 'info', message: 'Saved the durable raw Jira mirror for ARB-42', file_path: '/Artifacts/mirrors/jira/ARB-42.json' },
          { at: '2026-01-01T10:00:01Z', stage: 'repository', level: 'warning', message: 'No alias matched' },
        ],
      },
    }))

    const result = await fetchJiraItem(item, rpc)
    rememberJiraFetchLogs(result.logs)

    expect(result.repository).toBe('')
    expect(result.logs).toHaveLength(2)
    expect(result.logs[0]).toMatchObject({ stage: 'mirror', filePath: '/Artifacts/mirrors/jira/ARB-42.json' })
    expect(jiraFetchLogSnapshot().at(-1)).toMatchObject({ stage: 'repository', level: 'warning' })
  })

  it('persists only values that differ from the latest Jira snapshot', async () => {
    const item = rawTicket()
    const fields = { ...editableJiraFields(item), repository: 'mycel', title: 'User summary', assignee: 'User Person' }
    const rpc = vi.fn(async () => ({ ok: true }))

    const saved = await saveJiraOverrides(item, fields, rpc)

    expect(saved.title).toBe('User summary')
    expect(saved.jiraValues.title).toBe('Jira summary')
    expect(saved.overrides).toEqual({ repository: 'mycel', title: 'User summary', assignee: 'User Person' })
    expect(rpc).toHaveBeenCalledWith('artifacts.write', expect.objectContaining({
      repo: 'jira', path: '_arbol-internals/ARB-42/overrides.json',
      content: expect.stringContaining('User summary'),
    }))
  })

  it('saves ticket field overrides before a repository is selected', async () => {
    const item = rawTicket()
    const fields = { ...editableJiraFields(item), assignee: 'User Person' }
    const rpc = vi.fn(async () => ({ ok: true }))

    const saved = await saveJiraOverrides(item, fields, rpc)

    expect(saved.repository).toBe('')
    expect(saved.overrides).toEqual({ assignee: 'User Person' })
    expect(rpc).toHaveBeenCalledWith('artifacts.write', expect.objectContaining({
      repo: 'jira', path: '_arbol-internals/ARB-42/overrides.json',
    }))
  })

  it('loads user overrides after fresh Jira data so they retain priority', async () => {
    const ticketPath = 'tickets/ARB-42/ticket.md'
    const overridePath = '_arbol-internals/ARB-42/overrides.json'
    const rpc = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'artifacts.tree' && params?.repo === 'jira') return { root: '', tree: [file(ticketPath), file(overridePath)] }
      if (method === 'artifacts.read_many' && params?.repo === 'jira') return { files: [
        { path: ticketPath, exists: true, content: '---\nkey: ARB-42\nsummary: New Jira summary\n---\n# ARB-42: New Jira summary' },
        { path: overridePath, exists: true, content: JSON.stringify({ overrides: { title: 'User summary' } }) },
      ] }
      throw new Error(`Unexpected RPC ${method}`)
    })

    const item = (await loadJiraItems(rpc)).items[0]
    expect(item.title).toBe('User summary')
    expect(item.jiraValues.title).toBe('New Jira summary')
    expect(rpc).not.toHaveBeenCalledWith('artifacts.tree', { repo: 'mirrors/jira' })
  })


  it('requires a repository and creates chat in the ticket repository', async () => {
    const item = rawTicket()
    await expect(createJiraChat(item, vi.fn())).rejects.toThrow('requires a repository')

    item.repository = 'mycel'
    item.overrides = { repository: 'mycel' }
    const rpc = vi.fn(async (method: string) => {
      if (method === 'repos.list') return { repos: [
        { name: 'Arbol', path: '/repo/Arbol' },
        { name: 'mycel', path: '/repo/mycel' },
      ] }
      if (method === 'chat_session.create') return { chat_session_id: 'session-1' }
      if (method === 'chat_session.add_chat_note') return { ok: true }
      throw new Error(`Unexpected RPC ${method}`)
    })
    await createJiraChat(item, rpc)
    expect(rpc).toHaveBeenCalledWith('chat_session.create', expect.objectContaining({
      workspace_dirs: ['/repo/mycel'],
    }))
  })

  it('includes effective, Jira-source, and override data in the Chat Note', () => {
    const item = rawTicket()
    item.title = 'User summary'
    item.overrides = { title: 'User summary' }
    const note = jiraTicketChatNote(item)
    expect(note).toContain('# Jira ticket ARB-42')
    expect(note).toContain('User summary')
    expect(note).toContain('Jira summary')
    expect(note).toContain('User overrides')
  })
})
