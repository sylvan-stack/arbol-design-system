import { callNative } from '@arbol/design-system'
import type { Swimlane } from './data'
import { translateSwimlanesToDashboardTimeline, type CompactDashboardTimeline } from './dashboardTimeline'

export type DashboardSubmissionResult = {
  ok?: boolean
  status?: string
  error?: string
  taskCount?: number
}

type NativeSubmit = (method: string, params: Record<string, unknown>) => Promise<DashboardSubmissionResult>

export class OakenDashboardSync {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private latestLanes: readonly Swimlane[] = []
  private lastAcceptedJSON: string | null = null
  private pendingJSON: string | null = null
  private evaluationSequence = 0

  constructor(
    private readonly submitNative: NativeSubmit = callNative,
    private readonly debounceMilliseconds = 300,
  ) {}

  evaluateSoon(lanes: readonly Swimlane[]): void {
    this.latestLanes = lanes
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.submit(this.latestLanes, false)
    }, this.debounceMilliseconds)
  }

  async submit(lanes: readonly Swimlane[], manual: boolean): Promise<DashboardSubmissionResult & { taskCount: number }> {
    const sequence = ++this.evaluationSequence
    const timeline = await translateSwimlanesToDashboardTimeline(lanes)
    if (!manual && (timeline.json === this.lastAcceptedJSON || timeline.json === this.pendingJSON)) {
      return { ok: true, status: 'unchanged', taskCount: timeline.taskCount }
    }

    this.pendingJSON = timeline.json
    const result = await this.post(timeline, manual)
    // A newer complete snapshot owns the pending state now; an older result must
    // never overwrite its deduplication state.
    if (sequence === this.evaluationSequence) {
      if (result.ok && (result.status === 'accepted' || result.status === 'unchanged')) {
        this.lastAcceptedJSON = timeline.json
      }
      this.pendingJSON = null
    }
    return { ...result, taskCount: timeline.taskCount }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
  }

  private post(timeline: CompactDashboardTimeline, manual: boolean): Promise<DashboardSubmissionResult> {
    return this.submitNative('app.dashboard.submitOakenTimeline', {
      generation: crypto.randomUUID(),
      snapshotJSON: timeline.json,
      taskCount: timeline.taskCount,
      launchIfNeeded: true,
      activate: manual,
      force: manual,
    })
  }
}
