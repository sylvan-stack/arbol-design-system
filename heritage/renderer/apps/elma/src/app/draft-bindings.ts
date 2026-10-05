const BINDING_PREFIX = 'arbol:elma:composer-draft-binding:v1:'
const DRAFT_ID_NAMESPACE = 'arbol:elma:composer-draft-id:v2\0'
const processDraftBindings = new Map<string, string>()

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits))

/** Synchronous SHA-256 for the small composer-identity input used below.
 * Web Crypto's digest API is asynchronous, while Draft identity must exist in
 * the same input event that writes the crash-recovery snapshot. */
function sha256(input: string): Uint8Array {
  const source = new TextEncoder().encode(input)
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64
  const message = new Uint8Array(paddedLength)
  message.set(source)
  message[source.length] = 0x80
  const view = new DataView(message.buffer)
  const bitLength = source.length * 8
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i += 1) {
      const w15 = words[i - 15]
      const w2 = words[i - 2]
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = state
    for (let i = 0; i < 64; i += 1) {
      const sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const choose = (e & f) ^ (~e & g)
      const t1 = (h + sum1 + choose + SHA256_K[i] + words[i]) >>> 0
      const sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }

  const digest = new Uint8Array(32)
  const digestView = new DataView(digest.buffer)
  for (let i = 0; i < state.length; i += 1) digestView.setUint32(i * 4, state[i], false)
  return digest
}

/** A namespaced deterministic UUID. Custom UUID version 8 identifies the
 * SHA-256-derived layout. The value reveals neither session IDs nor repo paths,
 * but every Elma process converges on one Draft ID for one composer even when
 * WebKit localStorage is denied or two processes race to create the binding. */
export function deterministicDraftId(composerIdentity: string): string {
  const bytes = sha256(`${DRAFT_ID_NAMESPACE}${composerIdentity}`).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function draftIdForComposer(storage: Storage, composerIdentity: string): string {
  const key = `${BINDING_PREFIX}${composerIdentity}`
  const processExisting = processDraftBindings.get(composerIdentity)
  try {
    // Persistent state must win on every read. Another Elma process may have
    // replaced a binding after this process cached it (for example when opening
    // a Willo Draft card). Returning process memory first split one composer
    // across multiple durable Draft rows.
    const persistent = storage.getItem(key)
    if (persistent) {
      processDraftBindings.set(composerIdentity, persistent)
      return persistent
    }
    const created = processExisting || deterministicDraftId(composerIdentity)
    processDraftBindings.set(composerIdentity, created)
    storage.setItem(key, created)
    return created
  } catch {
    // Process memory avoids repeated work, while deterministic derivation makes
    // separate renderer processes converge when persistent storage is denied.
    const created = processExisting || deterministicDraftId(composerIdentity)
    processDraftBindings.set(composerIdentity, created)
    return created
  }
}

export function bindDraftToComposer(storage: Storage, composerIdentity: string, draftId: string): void {
  if (!draftId) return
  processDraftBindings.set(composerIdentity, draftId)
  try {
    const target = `${BINDING_PREFIX}${composerIdentity}`
    // A renderer may previously have associated this content with another
    // composer. Opening from Willo moves that UI binding; the Draft itself still
    // contains no destination or Chat Session identity.
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i)
      if (key?.startsWith(BINDING_PREFIX) && key !== target && storage.getItem(key) === draftId) {
        processDraftBindings.delete(key.slice(BINDING_PREFIX.length))
        storage.removeItem(key)
      }
    }
    storage.setItem(target, draftId)
  } catch {}
}

export function forgetComposerDraftBinding(storage: Storage, composerIdentity: string, expectedDraftId?: string): boolean {
  const key = `${BINDING_PREFIX}${composerIdentity}`
  try {
    const persistent = storage.getItem(key)
    const current = persistent || processDraftBindings.get(composerIdentity) || null
    if (expectedDraftId && current !== expectedDraftId) return false
    processDraftBindings.delete(composerIdentity)
    if (persistent) storage.removeItem(key)
    return true
  } catch {
    const current = processDraftBindings.get(composerIdentity) || null
    if (expectedDraftId && current !== expectedDraftId) return false
    processDraftBindings.delete(composerIdentity)
    return true
  }
}

/** Test-only reset for the process fallback used when WebKit storage is denied. */
export function resetProcessDraftBindingsForTests(): void {
  processDraftBindings.clear()
}
