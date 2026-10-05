/* Small formatting + DOM helpers shared by the chat surface. */

export const fmtTime = (t: number | null | undefined) =>
  t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''

export const firstLine = (s: string | null | undefined) => (s || '').trim().split('\n')[0]

export function fmtAgo(t: number | null | undefined): string {
  if (!t) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}

/* Grow a textarea to fit its content, never below `minPx`. */
export function autoGrow(el: HTMLTextAreaElement | null, minPx: number) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(minPx || 0, el.scrollHeight) + 'px'
}
