/* Shared pull/push job runner: start a job, then poll the daemon until it
 * drains. The daemon runs one git job at a time, so concurrent starters get
 * a clean error instead of interleaved output. */
import { api, type GitJobStatus } from './api'

export async function runGitJob(
  start: Promise<{ started: boolean; total?: number }>,
  onProgress?: (status: GitJobStatus) => void,
): Promise<GitJobStatus> {
  const s = await start
  if (!s.started) throw new Error('Another git operation is already running — wait for it to finish.')
  for (;;) {
    const status = await api.organizations.gitStatus()
    onProgress?.(status)
    if (!status.running) return status
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}
