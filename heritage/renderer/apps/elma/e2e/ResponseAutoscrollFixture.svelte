<script lang="ts">
  import type { AnswerBlock } from '../src/constants'
  import ResponseView from '../src/chat/ResponseView.svelte'

  const filler = (label: string, count: number): AnswerBlock[] =>
    Array.from({ length: count }, (_, index) => ({
      t: 'p' as const,
      v: `${label} ${index + 1}: ${'context '.repeat(18)}`,
    }))

  const completedBlocks: AnswerBlock[] = [
    ...filler('Early activity', 6),
    { t: 'thinking', v: 'Inspecting the relevant implementation.' },
    ...filler('Intermediate activity', 5),
    {
      t: 'native',
      call: {
        tool_use_id: 'autoscroll-call', turn_id: 'autoscroll-turn', tool_name: 'Read',
        input: { file_path: '/tmp/example' }, ok: true, invoked_ts: Date.now() - 2_000,
      },
    },
    { t: 'h', v: 'Final answer' },
    { t: 'p', v: 'This is the first line of the final answer.' },
    { t: 'p', v: 'This short answer requires trailing room for its separator to reach the top.' },
  ]
  let blocks = $state<AnswerBlock[]>([])
  let historyHydrated = $state(false)
  let sessionId = $state('autoscroll-session')
  let turnId = $state('autoscroll-turn')
  let respondedAt = $state<number | null>(Date.now())
  const scrollRef = { current: null as HTMLDivElement | null }

  export function scroller() { return scrollRef.current }
  export function hydrateFastResponse() { blocks = completedBlocks }
  export function hydrateFullHistory() {
    blocks = [...filler('Hydrated earlier history', 8), ...completedBlocks]
    historyHydrated = true
  }
  export function prependLateContent() {
    blocks = [...filler('Later layout', 8), ...blocks]
  }
  export function openDirectCompletedResponse() {
    sessionId = 'direct-session'
    turnId = 'direct-turn'
    respondedAt = Date.now()
    blocks = [
      ...filler('Direct response', 8),
      { t: 'h', v: 'Direct final answer' },
      { t: 'p', v: 'This response has no thinking or tool blocks.' },
    ]
    historyHydrated = true
  }
  export function openFastResponseThatLooksLive() {
    sessionId = 'fast-live-looking-session'
    turnId = 'fast-live-looking-turn'
    respondedAt = null
    blocks = completedBlocks
    historyHydrated = false
  }
  export function finishLiveLookingHistoryHydration() {
    blocks = [...filler('Earlier hydrated history', 7), ...completedBlocks]
    respondedAt = Date.now()
    historyHydrated = true
  }
</script>

<ResponseView
  {scrollRef}
  {historyHydrated}
  {sessionId}
  {turnId}
  {blocks}
  sentAt={Date.now() - 4_000}
  startedAt={Date.now() - 3_000}
  {respondedAt}
/>
