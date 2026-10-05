import { mount } from 'svelte'
import type { NativeToolCallView } from '@arbol/events'
import NativeToolCallRow from '../src/chat/NativeToolCallRow.svelte'

const scenario = new URLSearchParams(location.search).get('scenario') || 'running-long'
const now = Date.now()
const durations: Record<string, { elapsed: number; settled: boolean; missingTimestamp?: boolean }> = {
  'running-short': { elapsed: 58_000, settled: false },
  'running-crossing': { elapsed: 59_500, settled: false },
  'running-long': { elapsed: 61_000, settled: false },
  'running-output': { elapsed: 10_000, settled: false },
  // A malformed/legacy projected DTO is normalized to receipt time by the
  // fixture, matching the UI's defensive timestamp behavior.
  'running-legacy-wire': { elapsed: 61_000, settled: false, missingTimestamp: true },
  'settled-short': { elapsed: 59_999, settled: true },
  'settled-long': { elapsed: 80_000, settled: true },
}
const selected = durations[scenario]
if (!selected) throw new Error(`Unknown scenario: ${scenario}`)

const invokedAt = selected.missingTimestamp ? now : now - selected.elapsed
const call: NativeToolCallView = {
  tool_use_id: `fixture-${scenario}`,
  turn_id: 'fixture-turn',
  tool_name: 'Bash',
  input: { command: 'sleep 80' },
  ok: selected.settled ? true : null,
  invoked_ts: invokedAt,
  seq: 3,
  ...(selected.settled ? { result: { content: 'done' }, settled_ts: now } : {}),
}

mount(NativeToolCallRow, {
  target: document.getElementById('root')!,
  props: {
    call,
    ...(scenario === 'running-long' ? { batchSize: 5, batchPosition: 2 } : {}),
    ...(scenario === 'running-output' ? {
      outputPreview: {
        status: 'running',
        stdout: 'tests/unit/test_alpha.py ... passed\ncollecting integration tests...\n',
        stderr: 'warning: slow test detected\n',
      },
    } : {}),
  },
})
