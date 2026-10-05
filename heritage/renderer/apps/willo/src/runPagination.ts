export type RunEvent = {
  id: string
  seq?: number
  ts?: string
  kind: string
  role: 'user' | 'assistant' | 'system'
  text: string
  session_id?: string | null
  cell?: number | null
}

/** Approximate rendered lines without measuring the DOM. Pagination is a
 * reading aid, so a long response is deliberately allowed to exceed the target
 * rather than ever being cut in half. */
export function eventLines(event: RunEvent, columns = 92): number {
  return event.text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / columns)), 0) + 2
}

/** Split only immediately before a user message. Each user prompt and every
 * following agent/tool/system event therefore stay together until the next
 * prompt. A single oversized exchange remains intact on one page. */
export function paginateRunEvents(events: readonly RunEvent[], maxLines = 120): RunEvent[][] {
  if (!events.length) return []
  const pages: RunEvent[][] = []
  let page: RunEvent[] = []
  let lines = 0
  for (const event of events) {
    const size = eventLines(event)
    if (event.role === 'user' && page.length > 0 && lines + size > maxLines) {
      pages.push(page)
      page = []
      lines = 0
    }
    page.push(event)
    lines += size
  }
  if (page.length) pages.push(page)
  return pages
}
