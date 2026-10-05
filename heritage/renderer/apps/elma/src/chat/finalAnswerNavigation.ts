export const ANSWER_THRESHOLD_SELECTOR = '[data-answer-threshold]'

export type ScrollDirection = 'up' | 'down'

/** True when at least one pixel of the Answer Threshold overlaps the scroller's
 * viewport. Merely touching an edge does not count as visible. */
export function isAnswerThresholdVisible(scroller: HTMLElement): boolean {
  const marker = scroller.querySelector<HTMLElement>(ANSWER_THRESHOLD_SELECTOR)
  if (!marker) return false
  const threshold = marker.getBoundingClientRect()
  const viewport = scroller.getBoundingClientRect()
  return threshold.bottom > viewport.top && threshold.top < viewport.bottom
}

/** True only while the Answer Threshold is still below the viewport. Once the
 * reader reaches or passes the threshold, the Answer Beacon stays hidden. */
export function isAnswerThresholdBelowViewport(scroller: HTMLElement): boolean {
  const marker = scroller.querySelector<HTMLElement>(ANSWER_THRESHOLD_SELECTOR)
  if (!marker) return false
  const threshold = marker.getBoundingClientRect()
  const viewport = scroller.getBoundingClientRect()
  return threshold.top >= viewport.bottom
}

/** Resolve the answer threshold to scroll-container coordinates, independent of
 * which inner response wrapper is its offset parent. */
export function finalAnswerScrollTop(scroller: HTMLElement): number | null {
  const marker = scroller.querySelector<HTMLElement>(ANSWER_THRESHOLD_SELECTOR)
  if (!marker) return null
  const top = marker.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  return Math.max(0, Math.min(top, Math.max(0, scroller.scrollHeight - scroller.clientHeight)))
}

/** Move among the three semantic reading stops: activity start, final answer,
 * and response end. A threshold that coincides with an edge is de-duplicated. */
export function nextResponseScrollTop(scroller: HTMLElement, direction: ScrollDirection): number {
  const current = scroller.scrollTop
  const bottom = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const answer = finalAnswerScrollTop(scroller)
  const stops = [0, answer, bottom]
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 1)
  const tolerance = 2

  if (direction === 'down') return stops.find((stop) => stop > current + tolerance) ?? bottom
  return [...stops].reverse().find((stop) => stop < current - tolerance) ?? 0
}

export function scrollResponse(scroller: HTMLElement | null, direction: ScrollDirection): void {
  if (!scroller) return
  scroller.scrollTo({ top: nextResponseScrollTop(scroller, direction), behavior: 'smooth' })
}
