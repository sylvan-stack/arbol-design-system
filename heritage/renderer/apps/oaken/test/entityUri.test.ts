import { describe, expect, it } from 'vitest'

import {
  entityIdentityKey,
  formatEntityUri,
  parseEntityUri,
  splitEntityUris,
} from '../../../packages/design-system/src/entities/entityUri'

describe('Entity URI', () => {
  it('round-trips configured repository tags emitted by Core', () => {
    for (const repo of ['repo-636f7265', 'repo-2e676974687562'] as const) {
      const uri = formatEntityUri({ repo, kind: 'artifact', entityId: 'id', title: 'Repository research' })
      expect(parseEntityUri(uri)).toMatchObject({ ok: true, value: { repo, kind: 'artifact' } })
      expect(splitEntityUris(`Read ${uri}`).some((part) => part.kind === 'entity')).toBe(true)
    }
    for (const repo of ['repo-', 'repo-z1', 'repo-123']) {
      expect(parseEntityUri(`[${repo}:arf:id:VGl0bGU=]`).ok).toBe(false)
    }
  })
  it('parses the registered examples and decodes UTF-8 titles', () => {
    const parsed = parseEntityUri('[myc:arf:9b6984cc-db34-4a84-b948-0eaefbea916a:VG9vbCBDYWxscw==]')
    expect(parsed).toEqual({
      ok: true,
      value: {
        uri: '[myc:arf:9b6984cc-db34-4a84-b948-0eaefbea916a:VG9vbCBDYWxscw==]',
        repo: 'myc',
        kind: 'artifact',
        entityId: '9b6984cc-db34-4a84-b948-0eaefbea916a',
        title: 'Tool Calls',
      },
    })

    const unicode = formatEntityUri({ repo: 'Mycel', kind: 'ticket', entityId: 'db-id', title: 'Fix café 🌳' })
    expect(parseEntityUri(unicode)).toMatchObject({ ok: true, value: { title: 'Fix café 🌳' } })
  })

  it('supports repo-less Prompt and Response URIs as well as explicit any Repo', () => {
    const prompt = formatEntityUri({ kind: 'prompt', entityId: 'message-1', title: 'Please inspect this' })
    const response = formatEntityUri({ repo: 'any', kind: 'response', entityId: 'turn-1', title: 'Inspection complete' })
    expect(prompt).toMatch(/^\[pmt:message-1:/)
    expect(parseEntityUri(prompt)).toMatchObject({ ok: true, value: { repo: 'any', kind: 'prompt', entityId: 'message-1' } })
    expect(response).toMatch(/^\[any:rsp:turn-1:/)
    expect(parseEntityUri(response)).toMatchObject({ ok: true, value: { repo: 'any', kind: 'response', entityId: 'turn-1' } })
  })

  it('round-trips Telegram conversation chips in message text', () => {
    const uri = formatEntityUri({ repo: 'Any', kind: 'telegram_conversation', entityId: 'conversation-id', title: 'Alice' })
    expect(uri).toMatch(/^\[any:tlc:/)
    expect(parseEntityUri(uri)).toMatchObject({ ok: true, value: { kind: 'telegram_conversation', entityId: 'conversation-id', title: 'Alice' } })
    expect(splitEntityUris(`Read ${uri}`).some((part) => part.kind === 'entity')).toBe(true)
  })

  it('supports the Confluence Entity kind', () => {
    const page = formatEntityUri({ repo: 'Any', kind: 'confluence', entityId: 'page-id', title: 'Page' })
    expect(page).toMatch(/^\[any:cnf:/)
    expect(parseEntityUri(page)).toMatchObject({ ok: true, value: { kind: 'confluence', entityId: 'page-id' } })
  })

  it('uses only kind and database ID for identity', () => {
    const first = parseEntityUri(formatEntityUri({ repo: 'Arbol', kind: 'artifact', entityId: 'same', title: 'Old' }))
    const second = parseEntityUri(formatEntityUri({ repo: 'Mycel', kind: 'artifact', entityId: 'same', title: 'New' }))
    expect(first.ok && second.ok && entityIdentityKey(first.value)).toBe(entityIdentityKey(second.ok ? second.value : '' as never))
  })

  it.each([
    'arb:arf:id:VGl0bGU=',
    '[arb:arf:id]',
    '[unknown:arf:id:VGl0bGU=]',
    '[arb:art:id:VGl0bGU=]',
    '[arb:arf:id:not base64]',
    '[arb:arf::VGl0bGU=]',
  ])('rejects malformed input %s', (uri) => {
    expect(parseEntityUri(uri).ok).toBe(false)
  })

  it('enforces the registered tag length contract', () => {
    const kinds = ['ticket', 'graft', 'mr', 'commit', 'slack', 'email', 'confluence', 'chat', 'artifact', 'requirement', 'invariant', 'glossary', 'secret', 'flyer', 'branch', 'mandate', 'prompt', 'response'] as const
    for (const kind of kinds) {
      const uri = formatEntityUri({ repo: 'Arbol', kind, entityId: 'id', title: 'Title' })
      const tag = uri.slice(1, -1).split(':')[1]
      expect(tag.length).toBeLessThanOrEqual(3)
    }
    expect(formatEntityUri({ repo: 'Blueprint', kind: 'artifact', entityId: 'id', title: 'Title' })).toMatch(/^\[blue:arf:/)
  })
  it('lifts valid Entity URIs from prose without changing the source text', () => {
    const uri = formatEntityUri({ repo: 'Arbol', kind: 'ticket', entityId: 'db-id', title: 'A ticket' })
    const text = `Please inspect ${uri} and [ordinary brackets].`
    const segments = splitEntityUris(text)
    expect(segments.map((segment) => segment.kind === 'entity' ? segment.uri : segment.text).join('')).toBe(text)
    expect(segments).toMatchObject([
      { kind: 'text', text: 'Please inspect ' },
      { kind: 'entity', uri, entity: { kind: 'ticket', entityId: 'db-id', title: 'A ticket' } },
      { kind: 'text', text: ' and [ordinary brackets].' },
    ])
  })

})
