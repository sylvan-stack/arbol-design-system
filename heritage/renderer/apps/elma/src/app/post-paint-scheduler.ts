export type DeferredRefresh = () => void | Promise<void>

/**
 * Session-scoped gate for work that is useful after, but not required for, the
 * first usable transcript paint. A new open cancels queued work from the old
 * session. Tasks are keyed so repeated attach/effect activity still runs each
 * refresh once. Failures are isolated because these refreshes are optional and
 * retain their own user-visible/retry behavior.
 */
export class PostPaintScheduler {
  private generation = 0
  private painted = false
  private tasks = new Map<string, DeferredRefresh>()

  begin(): number {
    this.generation += 1
    this.painted = false
    this.tasks.clear()
    return this.generation
  }

  currentGeneration(): number {
    return this.generation
  }

  defer(key: string, generation: number, task: DeferredRefresh): void {
    if (generation !== this.generation) return
    if (this.painted) {
      this.run(task)
      return
    }
    this.tasks.set(key, task)
  }

  markPainted(generation: number): void {
    if (generation !== this.generation || this.painted) return
    this.painted = true
    const pending = [...this.tasks.values()]
    this.tasks.clear()
    for (const task of pending) this.run(task)
  }

  cancel(): void {
    this.begin()
  }

  private run(task: DeferredRefresh): void {
    queueMicrotask(() => {
      try {
        void Promise.resolve(task()).catch(() => {})
      } catch {
        // Optional refresh failure must not suppress another queued refresh.
      }
    })
  }
}
