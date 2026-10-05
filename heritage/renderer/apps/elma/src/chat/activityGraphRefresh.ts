import type { ArbolBridge } from '@arbol/events'
import { onRenderInvalidation } from '@arbol/events'

export type Binding = { name: string; value_id: string; kind: string }
export type Execution = {
  execution_id: string; activity_id: string; phase: string
  caused_by_execution_ids: string[]; inputs: Binding[]; outputs: Binding[]
  timestamps: Record<string, number>
}
export type Graph = {
  status: 'observed' | 'unavailable'; chat_session_id: string; exchange_id: string
  runtime_id?: string; observed_head?: number; range_start?: number; range_end?: number
  storage_generation?: string; observed_revision?: number
  executions?: Execution[]
  edges?: { from: string; to: string; kind: string; value_id?: string }[]
  reason?: string
}
export type GraphState = { result: Graph | null; loading: boolean; error: boolean; stale: boolean }
export const GRAPH_REFRESH_DELAY_MS = 250

/** One in-flight read and one dirty bit per mounted inspector, including selection
 * changes. No timer polls; only a new hint/selection/manual refresh schedules work.
 * A bridge call is not cancellable here: let it settle, ignore obsolete results,
 * then fetch the newest selection. Never pretend a timeout joined server work.
 */
export class ActivityGraphRefresh {
  private session: string | null = null
  private exchange: string | null = null
  private lastObserved: Graph | null = null
  private revision = 0
  private dirty = false
  private running = false
  private disposed = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private off: (() => void) | null = null

  constructor(private bridge: ArbolBridge, private publish: (state: GraphState) => void) {}

  select(session?: string | null, exchange?: string | null): void {
    if (this.disposed || (session === this.session && exchange === this.exchange)) return
    this.off?.()
    this.off = null
    this.clearTimer()
    this.session = session || null
    this.exchange = exchange || null
    this.lastObserved = null
    ++this.revision
    this.dirty = Boolean(this.session && this.exchange)
    this.publish({ result: null, loading: this.dirty, error: false, stale: false })
    if (!this.dirty) return
    this.off = onRenderInvalidation(this.bridge, this.session!, () => this.invalidate())
    this.schedule(0)
  }

  refresh(): void { this.invalidate(0) }

  private invalidate(delay = GRAPH_REFRESH_DELAY_MS): void {
    if (this.disposed || !this.session || !this.exchange) return
    ++this.revision
    this.dirty = true
    // Keep only an accepted observation of this selection, explicitly stale.
    // Invalidated IO still cannot replace it. One trailing read covers a burst.
    this.publish({ result: this.lastObserved, loading: true, error: false,
      stale: this.lastObserved !== null })
    this.schedule(delay)
  }

  private schedule(delay: number): void {
    if (this.disposed || this.running || this.timer !== null || !this.dirty) return
    this.timer = setTimeout(() => { this.timer = null; void this.read() }, delay)
  }

  private async read(): Promise<void> {
    if (this.disposed || this.running || !this.dirty || !this.session || !this.exchange) return
    const session = this.session, exchange = this.exchange, revision = this.revision
    this.running = true
    this.dirty = false
    try {
      const result: Graph = await this.bridge.call('activity_graph.get', {
        chat_session_id: session, exchange_id: exchange,
      })
      if (!result || result.chat_session_id !== session || result.exchange_id !== exchange
          || !['observed', 'unavailable'].includes(result.status)) throw new Error('Mismatched graph')
      if (!this.disposed && revision === this.revision) {
        if (result.status === 'observed') {
          this.lastObserved = result
          this.publish({ result, loading: false, error: false, stale: false })
        } else {
          this.publish({ result: this.lastObserved ?? result, loading: false,
            error: true, stale: this.lastObserved !== null })
        }
      }
    } catch {
      if (!this.disposed && revision === this.revision) {
        this.publish({ result: this.lastObserved, loading: false, error: true,
          stale: this.lastObserved !== null })
      }
    } finally {
      this.running = false
      // Failure alone never schedules a retry. A hint received during IO does.
      this.schedule(GRAPH_REFRESH_DELAY_MS)
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  dispose(): void {
    this.disposed = true
    this.lastObserved = null
    ++this.revision
    this.dirty = false
    this.clearTimer()
    this.off?.()
    this.off = null
  }
}
