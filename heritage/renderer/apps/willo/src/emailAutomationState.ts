import type { MailMessageSummary, MailSync } from './mailApi'

export type MenuPoint = { x: number; y: number }

export function clampContextMenu(
  point: MenuPoint,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
): MenuPoint {
  return {
    x: Math.max(margin, Math.min(point.x, viewport.width - size.width - margin)),
    y: Math.max(margin, Math.min(point.y, viewport.height - size.height - margin)),
  }
}

export function reconcileRemovedMessages(
  messages: MailMessageSummary[],
  removedIds: string[],
  selectedKey: string | null,
  pinnedKeys: string[],
  detailCache: Record<string, unknown>,
) {
  const removed = new Set(removedIds)
  const nextCache = Object.fromEntries(Object.entries(detailCache).filter(([key]) => !removed.has(key)))
  return {
    messages: messages.filter((message) => !removed.has(message.id)),
    selectedKey: selectedKey && removed.has(selectedKey) ? null : selectedKey,
    pinnedKeys: pinnedKeys.filter((key) => !removed.has(key)),
    detailCache: nextCache,
  }
}

export function emailSyncStatusText(
  sync: MailSync | null | undefined,
  formatTime: (timestamp: number) => string,
): string | null {
  if (!sync) return null
  if (sync.status === 'failed') return 'Email sync failed'
  if (sync.status === 'needs_login') return 'Email sync needs login'
  if (sync.status === 'running') return 'Email sync running'
  if (sync.status === 'completed' && sync.last_synced_at) {
    return `Email synced ${formatTime(sync.last_synced_at)}`
  }
  return null
}
