import { beforeEach, describe, expect, it, vi } from 'vitest'

const { call, callNative } = vi.hoisted(() => ({ call: vi.fn(), callNative: vi.fn() }))
vi.mock('@arbol/design-system', () => ({
  call,
  callNative,
  ENTITY_REPOS: { Arbol: 'arb', Mycel: 'myc', Any: 'any', BRO: 'cor' },
}))

import type { EntityUri } from '@arbol/design-system'
import type { Swimlane } from '../src/data'
import { createSwimlaneChat, swimlaneChatNote, swimlaneEntityUris } from '../src/swimlaneChat'

const arbolUri = '[arb:tkt:ticket-id:VGlja2V0]' as EntityUri
const mycelUri = '[myc:arf:artifact-id:QXJ0aWZhY3Q=]' as EntityUri

const lane: Swimlane = {
  n: 4,
  sid: 'sl-4',
  tkt: 'Marketing Preferences Review',
  swimmers: [
    {
      id: 'sw-ticket', nm: 'Ticket work', src: 'JIRA', rootKind: 'ticket', rootRef: 'DEMO-10016',
      start: [0, 9], startMs: 1_000, type: 'deadline', due: [0, 17], dueMs: 2_000,
      items: [
        { entityId: 'ticket-id', uri: arbolUri, kind: 'ticket', title: 'Ticket', t: [0, 10] },
        { entityId: 'artifact-id', uri: mycelUri, kind: 'artifact', title: 'Artifact', t: [0, 11] },
      ],
    },
    {
      id: 'sw-focus', nm: 'Focus', src: 'FOCUS', rootKind: 'focus_area', rootRef: '',
      start: [0, 12], startMs: 1_500,
      items: [
        { entityId: 'ticket-id', uri: arbolUri, kind: 'ticket', title: 'Ticket again', t: [0, 13] },
        { kind: 'commit', title: 'Legacy item without URI', t: [0, 14] },
      ],
    },
  ],
}

describe('Swimlane Chat', () => {
  beforeEach(() => {
    call.mockReset()
    callNative.mockReset()
  })

  it('collects attached Entity URIs in board order without duplicates', () => {
    expect(swimlaneEntityUris(lane)).toEqual([arbolUri, mycelUri])
  })

  it('builds a Chat Note with Entity URIs and Swimlane information', () => {
    const note = swimlaneChatNote(lane)
    expect(note).toContain('# Swimlane 4: Marketing Preferences Review')
    expect(note).toContain(`- ${arbolUri}`)
    expect(note).toContain(`- ${mycelUri}`)
    const uriList = note.slice(note.indexOf('## Attached Entity URIs'), note.indexOf('## Swimlane information'))
    expect(uriList.match(new RegExp(arbolUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1)
    expect(note).toContain('"swimlane_id": "sl-4"')
    expect(note).toContain('"root"')
    expect(note).toContain('"due_at": 2000')
  })

  it('creates a new session, attaches the Chat Note, and opens its Composer', async () => {
    call
      .mockResolvedValueOnce({ repos: [
        { name: 'Arbol', path: '/repo/arbol' },
        { name: 'Mycel', path: '/repo/mycel' },
        { name: 'Other', path: '/repo/other' },
      ] })
      .mockResolvedValueOnce({ chat_session_id: 'chat-new' })
      .mockResolvedValueOnce({ ok: true })
    callNative.mockResolvedValue({ ok: true })

    await expect(createSwimlaneChat(lane)).resolves.toBe('chat-new')

    expect(call.mock.calls[0]).toEqual(['repos.list', {}])
    expect(call.mock.calls[1]).toEqual(['chat_session.create', {
      provider: 'claude',
      workspace_dirs: ['/repo/arbol', '/repo/mycel'],
      title: 'Swimlane 4 · Marketing Preferences Review',
    }])
    expect(call.mock.calls[2][0]).toBe('chat_session.add_chat_note')
    expect(call.mock.calls[2][1]).toMatchObject({
      id: 'chat-new',
      surface: { kind: 'ui', name: 'oaken.swimlane' },
    })
    expect(call.mock.calls[2][1].text).toContain(arbolUri)
    expect(callNative).toHaveBeenCalledWith('app.open', {
      ui: 'elma', query: { session_id: 'chat-new' },
    })
  })
})
