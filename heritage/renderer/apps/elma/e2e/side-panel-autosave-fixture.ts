import { mount } from 'svelte'

declare global {
  interface Window {
    __sidePanelAutosaveWrites?: Array<{ path: string; content: string }>
  }
}

const writes: Array<{ path: string; content: string }> = []

// SidePanel uses the same native bridge as the hosted app. A successful write
// acknowledgement reproduces the reactive file.content update that used to
// terminate the edit session.
window.webkit = {
  messageHandlers: {
    arbol: {
      postMessage(message: { kind: string; callbackId: string; method: string; params: { path: string; content: string } }) {
        if (message.kind !== 'native' || message.method !== 'file.write') return
        writes.push(message.params)
        window.setTimeout(() => {
          window.__arbolReply?.(message.callbackId, {
            ok: true,
            result: { ok: true, path: message.params.path, size: message.params.content.length },
          })
        }, 0)
      },
    },
  },
}

const { default: SidePanel } = await import('../src/chat/SidePanel.svelte')
const file = {
  ok: true,
  path: '/tmp/autosave-regression.txt',
  name: 'autosave-regression.txt',
  content: 'before',
  size: 6,
  mime: 'text/plain',
}

mount(SidePanel, {
  target: document.getElementById('root')!,
  props: { file },
})

Object.assign(window, { __sidePanelAutosaveWrites: writes })
