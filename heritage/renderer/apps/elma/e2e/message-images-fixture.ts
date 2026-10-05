import { mount } from 'svelte'
import { api } from '../src/api'
import PinnedMessage from '../src/chat/PinnedMessage.svelte'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
mount(PinnedMessage, {
  target: document.getElementById('root')!,
  props: { text: 'Attached screenshot', attachments: [{ type: 'image', mime_type: 'image/png', data: png, name: 'screenshot.png' }] },
})

api.draft.getBlob = async () => ({ sha256: 'stored', mime_type: 'image/png', data: png, byte_len: 68 })
mount(PinnedMessage, {
  target: document.getElementById('root')!,
  props: { text: '', attachments: [{ sha256: 'stored', mime_type: 'image/png', filename: 'saved.png' }] as any },
})
