// Parity CLI for tests/integration/test_fold_parity.py (Step 6.1).
//
// Reads `{ "scenarios": { name: ArbolEvent[] } }` from stdin, replays each
// scenario through the shared `projectChatSession` fold, and writes
// `{ name: <comparable view> }` to stdout. The Python test folds the SAME
// scenarios through `chat_session.fold` and asserts the comparable views agree on the
// shared aggregate fields (event-sourcing.md §17 — UI ⇄ Core fold parity).
//
// "Comparable" = the aggregate surface both folds compute (status / title /
// turn / toolRequests). The UI-only `messages` projection is excluded (the Core
// aggregate doesn't track it).

import { replayChatSession, type ChatSessionView } from '../src/project'
import type { ArbolEvent } from '../src/catalog.gen'

function comparable(v: ChatSessionView) {
  return {
    chat_session_id: v.chat_session_id,
    status: v.status,
    title: v.title,
    turn:
      v.turn === null
        ? null
        : {
            turn_id: v.turn.turn_id,
            phase: v.turn.phase,
            ip_name: v.turn.ip_name,
            attempt: v.turn.attempt,
            excluded_ips: v.turn.excluded_ips,
            batches: v.turn.batches.map((b) => ({
              batch_id: b.batch_id,
              expected: b.expected,
              resolved: b.resolved,
            })),
            cycles: v.turn.cycles,
            stop_reason: v.turn.stop_reason,
            error: v.turn.error,
          },
    toolRequests: v.toolRequests,
    // The branching tree — parity with the Core aggregate's turns/removed.
    turns: v.turns,
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

async function main(): Promise<void> {
  const input = JSON.parse(await readStdin()) as {
    scenarios: Record<string, ArbolEvent[]>
  }
  const out: Record<string, unknown> = {}
  for (const [name, events] of Object.entries(input.scenarios)) {
    out[name] = comparable(replayChatSession('S', events))
  }
  process.stdout.write(JSON.stringify(out))
}

void main()
