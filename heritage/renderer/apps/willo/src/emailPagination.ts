import { mailMessageKey, type MailMessageSummary } from './mailApi'

export const EMAIL_ARCHIVE_PAGE_SIZE = 30

export type EmailDayGroup = {
  key: string
  label: string
  messages: MailMessageSummary[]
}

export type EmailPagination = {
  page: number
  pageCount: number
  messages: MailMessageSummary[]
  groups: EmailDayGroup[]
  recentCount: number
  olderCount: number
}

function localDayStart(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** The first page starts at the beginning of yesterday in the user's locale. */
export function recentEmailCutoff(now = Date.now()): number {
  const cutoff = new Date(now)
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - 1)
  return cutoff.getTime()
}

export function emailDayLabel(timestamp: number, now = Date.now()): string {
  const day = localDayStart(timestamp)
  const today = localDayStart(now)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (day === today) return 'Today'
  if (day === yesterday.getTime()) return 'Yesterday'
  if (day === tomorrow.getTime()) return 'Tomorrow'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
    ...(new Date(timestamp).getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  }).format(new Date(timestamp))
}

function sortMessages(messages: readonly MailMessageSummary[], pinnedKeys: readonly string[]): MailMessageSummary[] {
  const pinnedRank = new Map(pinnedKeys.map((key, index) => [key, index]))
  return [...messages].sort((a, b) => {
    // Keep every calendar day contiguous so day separators remain meaningful.
    const dayDifference = localDayStart(b.date_received) - localDayStart(a.date_received)
    if (dayDifference) return dayDifference
    const aRank = pinnedRank.get(mailMessageKey(a))
    const bRank = pinnedRank.get(mailMessageKey(b))
    if (aRank !== undefined || bRank !== undefined) {
      if (aRank === undefined) return 1
      if (bRank === undefined) return -1
      if (aRank !== bRank) return aRank - bRank
    }
    return b.date_received - a.date_received || mailMessageKey(a).localeCompare(mailMessageKey(b))
  })
}

export function groupEmailsByDay(messages: readonly MailMessageSummary[], now = Date.now()): EmailDayGroup[] {
  const groups: EmailDayGroup[] = []
  for (const message of messages) {
    const key = new Date(localDayStart(message.date_received)).toISOString()
    const previous = groups.at(-1)
    if (previous?.key === key) {
      previous.messages.push(message)
    } else {
      groups.push({ key, label: emailDayLabel(message.date_received, now), messages: [message] })
    }
  }
  return groups
}

/**
 * Page 1 is a live two-calendar-day view (today and yesterday). Older mail is
 * split into fixed 30-thread pages beginning at page 2.
 */
export function paginateEmails(
  messages: readonly MailMessageSummary[],
  pinnedKeys: readonly string[],
  requestedPage = 1,
  now = Date.now(),
  archivePageSize = EMAIL_ARCHIVE_PAGE_SIZE,
): EmailPagination {
  const sorted = sortMessages(messages, pinnedKeys)
  const cutoff = recentEmailCutoff(now)
  const recent = sorted.filter((message) => message.date_received >= cutoff)
  const older = sorted.filter((message) => message.date_received < cutoff)
  const size = Math.max(1, Math.floor(archivePageSize))
  const pageCount = 1 + Math.ceil(older.length / size)
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1))
  const pageMessages = page === 1
    ? recent
    : older.slice((page - 2) * size, (page - 1) * size)
  return {
    page,
    pageCount,
    messages: pageMessages,
    groups: groupEmailsByDay(pageMessages, now),
    recentCount: recent.length,
    olderCount: older.length,
  }
}

export type EmailPageLink = number | 'gap'

export function emailPageLinks(page: number, pageCount: number): EmailPageLink[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const pages = [...new Set([1, 2, page - 1, page, page + 1, pageCount])]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b)
  const links: EmailPageLink[] = []
  for (const value of pages) {
    const previous = links.at(-1)
    if (typeof previous === 'number' && value - previous > 1) links.push('gap')
    links.push(value)
  }
  return links
}
