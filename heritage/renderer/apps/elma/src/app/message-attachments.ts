export type InlineMessageImage = {
  type: 'image'
  mime_type: string
  data: string
  name?: string
  size?: number
}

export type StoredMessageImage = {
  sha256: string
  mime_type: string
  filename?: string
  byte_len?: number
}

export type MessageImage = InlineMessageImage | StoredMessageImage

export type ImageBlob = {
  mime_type: string
  data: string
  byte_len: number
}

/** Transcripts keep blob references; submission RPCs require inline images. */
export async function resolveMessageAttachments(
  attachments: readonly unknown[] | undefined,
  getBlob: (sha256: string) => Promise<ImageBlob>,
): Promise<InlineMessageImage[]> {
  return Promise.all((attachments || []).map(async (raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Invalid image attachment ${index + 1}`)
    const attachment = raw as Partial<InlineMessageImage & StoredMessageImage>
    if (attachment.type === 'image' && attachment.data && attachment.mime_type) {
      return attachment as InlineMessageImage
    }
    if (!attachment.sha256) throw new Error(`Invalid image attachment ${index + 1}`)
    try {
      const blob = await getBlob(attachment.sha256)
      if (!blob.data || !blob.mime_type.startsWith('image/')) throw new Error('Image data is unavailable')
      return {
        type: 'image' as const,
        mime_type: blob.mime_type,
        data: blob.data,
        name: attachment.filename,
        size: blob.byte_len,
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Could not load attached image ${attachment.filename || index + 1}: ${detail}`)
    }
  }))
}
