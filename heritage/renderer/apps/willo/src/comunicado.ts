export const AGENT_RESPONSE_COMUNICADO_FALLBACK = 'The agent finished its turn.'
export const AGENT_RESPONSE_COMUNICADO_MAX_LENGTH = 240
export const NOTIFICATION_COMUNICADO_VOLUME_STORAGE_KEY = 'arbol.willo.comunicado.notification.volume'
const LEGACY_NOTIFICATION_COMUNICADO_VOLUME_STORAGE_KEY = 'arbol.willo.comunicado.macos.volume'
export const DEFAULT_NOTIFICATION_COMUNICADO_VOLUME = 0.7

export function normalizeNotificationComunicadoVolume(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_NOTIFICATION_COMUNICADO_VOLUME
  return Math.min(1, Math.max(0, parsed))
}

export function loadNotificationComunicadoVolume(storage: Pick<Storage, 'getItem'> = localStorage): number {
  const value = storage.getItem(NOTIFICATION_COMUNICADO_VOLUME_STORAGE_KEY)
    ?? storage.getItem(LEGACY_NOTIFICATION_COMUNICADO_VOLUME_STORAGE_KEY)
  return value === null ? DEFAULT_NOTIFICATION_COMUNICADO_VOLUME : normalizeNotificationComunicadoVolume(value)
}

export function saveNotificationComunicadoVolume(
  volume: number,
  storage: Pick<Storage, 'setItem'> = localStorage,
): number {
  const normalized = normalizeNotificationComunicadoVolume(volume)
  storage.setItem(NOTIFICATION_COMUNICADO_VOLUME_STORAGE_KEY, String(normalized))
  return normalized
}

export function comunicadoTextPreview(
  value: string,
  maxLength = AGENT_RESPONSE_COMUNICADO_MAX_LENGTH,
): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return AGENT_RESPONSE_COMUNICADO_FALLBACK
  if (maxLength <= 0) return ''
  if (maxLength === 1) return '…'
  if (text.length <= maxLength) return text

  const available = maxLength - 1
  const candidate = text.slice(0, available).trimEnd()
  const lastSpace = candidate.lastIndexOf(' ')
  const cut = lastSpace >= Math.floor(available * 0.6)
    ? candidate.slice(0, lastSpace)
    : candidate
  return `${cut.trimEnd()}…`
}
