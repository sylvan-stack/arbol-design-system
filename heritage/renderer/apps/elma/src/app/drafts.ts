/* Content-only Draft helpers. Composer-to-Draft association is renderer state;
 * it is deliberately not a field of the Draft entity. Attachment bytes remain
 * content-addressed blobs in Core. */
import { api, type DraftAttachment } from '../api'
import type { ImageAttachment } from '../constants'

export {
  bindDraftToComposer,
  draftIdForComposer,
  forgetComposerDraftBinding,
  resetProcessDraftBindingsForTests,
} from './draft-bindings'

export async function composerToDraftAttachments(atts: ImageAttachment[]): Promise<DraftAttachment[]> {
  const out: DraftAttachment[] = []
  for (const a of atts) {
    // Never turn a transient blob-upload failure into a successful partial
    // draft save: leaving the previous draft intact lets the next edit retry.
    const r = await api.draft.attachBlob(a.mime_type, a.data)
    out.push({ sha256: r.sha256, filename: a.name, mime: a.mime_type, byte_len: r.byte_len })
  }
  return out
}

export async function draftToComposerAttachments(atts: DraftAttachment[]): Promise<ImageAttachment[]> {
  // Blob reads are independent. Fetch them concurrently so a draft with several
  // images costs one RPC round trip rather than one round trip per attachment.
  // Promise.all preserves composer order; a missing blob only removes itself.
  const hydrated = await Promise.all(atts.map(async (a): Promise<ImageAttachment | null> => {
    try {
      const b = await api.draft.getBlob(a.sha256)
      return { type: 'image', mime_type: b.mime_type, data: b.data, name: a.filename, size: b.byte_len }
    } catch {
      return null
    }
  }))
  return hydrated.filter((a): a is ImageAttachment => a !== null)
}
