import type { NativeToolCallView } from '@arbol/events'
import type { MessageImage } from './app/message-attachments'

/* Elma Chat — shared types, conversation model, and the few deterministic
 * helpers the UI needs (repo glyph tint/initials). The seed turns + mock answer
 * live here too: they are the dev/standalone fallback used when the Swift host
 * bridge is absent, mirroring the real `repos.list` / `ip.list` / `session.*`
 * shapes the app wires to in `api.ts`. */

/* AnswerBlock + the pure markdown parser now live in @arbol/design-system
 * (Elma chat + Elma View Page + Seqoya share one renderer). Re-exported so
 * existing `from '../constants'` imports keep working; the arbol-aware
 * `parseMarkdown` below wraps the shared pure parser (`parseProse`). */
import { parseMarkdown as parseProse } from '@arbol/design-system'
import type { AnswerBlock } from '@arbol/design-system'
export type { AnswerBlock }

/* A turn (tree node): the user's prompt + the agent's response. The chat area
 * shows exactly one of these at a time. The full backlog is a TREE — every turn
 * has a `parentId` and an ordered list of `children` (its alternative branches);
 * the chat renders ONE linear sequence, the active root→leaf path. */
export type ImageAttachment = { type: 'image'; mime_type: string; data: string; name?: string; size?: number }

export type Turn = {
  id: string
  parentId: string | null // null ⇒ this is the root turn
  message: string // the user's prompt
  submissionId?: string // stable command identity reused after an uncertain send result
  attachments?: MessageImage[] // inline composer images or persisted transcript references
  answer: AnswerBlock[] // agent response, empty while responding; may include inline thinking blocks
  thinking?: string | string[] // legacy/fallback reasoning chunks; new turns store thinking inline in `answer`
  sentAt: number // epoch ms
  startedAt: number // agent began responding
  respondedAt: number | null // null ⇒ still responding
  children: string[] // ordered child turn ids = the branches forked after this turn
}

/* The whole conversation tree, keyed by turn id. */
export type TurnMap = Record<string, Turn>

/* The local view selection at each fork (which child branch is "followed"). */
export type ActiveChild = Record<string, number>

/* The seeded/loaded conversation, as App owns it. */
export type SeededTree = {
  nodes: TurnMap
  rootId: string | null
  activeChild: ActiveChild
  viewIndex: number
}

/* Thinking levels in cycle order (⌃⇥ steps through these). */
export const THINKING_LEVELS = ['none', 'minimum', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const
export type ThinkingLevel = (typeof THINKING_LEVELS)[number]
export const DEFAULT_THINKING: ThinkingLevel = 'high'


/* Per-turn model override (⌃M). Seqoya stores a per-IP `enabled_models`
 * allow-list. Elma cycles only through that enabled list for the current IP,
 * falling back to the IP default/static first model for older settings. */
export type ModelOption = { value: string; label: string }
export type ModelId = string
export const DEFAULT_MODEL: ModelId = ''

const PROVIDER_DEFAULT: ModelOption = { value: '', label: 'IP default' }

export const CLAUDE_AVAILABLE_MODELS: ModelOption[] = [
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
]

export const CODEX_AVAILABLE_MODELS: ModelOption[] = [
  { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
  { value: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
  { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { value: 'gpt-5.1', label: 'GPT-5.1' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
]

export const ZAI_AVAILABLE_MODELS: ModelOption[] = [
  // z.ai (GLM Coding Plan) family — mirrors Seqoya's static fallback. A z.ai
  // gateway runs only GLM models; never fall back to the Claude catalog.
  { value: 'glm-5.3', label: 'GLM 5.3' },
  { value: 'glm-5.3-flash[1m]', label: 'GLM 5.3 Flash (1M)' },
]

export const MODELS: ModelOption[] = [PROVIDER_DEFAULT, ...CLAUDE_AVAILABLE_MODELS]

function providerKey(provider: string | null | undefined): 'claude' | 'codex' | 'zai' {
  switch ((provider || '').toLowerCase()) {
    case 'codex':
      return 'codex'
    case 'zai':
    case 'z.ai':
    case 'glm':
      return 'zai'
    case 'claude':
    default:
      return 'claude'
  }
}

export function availableModelOptions(provider: string | null | undefined): ModelOption[] {
  switch (providerKey(provider)) {
    case 'codex':
      return CODEX_AVAILABLE_MODELS
    case 'zai':
      return ZAI_AVAILABLE_MODELS
    case 'claude':
      return CLAUDE_AVAILABLE_MODELS
  }
}

export function allModelOptions(provider: string | null | undefined): ModelOption[] {
  return [PROVIDER_DEFAULT, ...availableModelOptions(provider)]
}

export function enabledModelOptions(provider: string | null | undefined, enabledModels?: string[] | null, defaultModel?: string | null): ModelOption[] {
  const all = availableModelOptions(provider)
  const enabled = (enabledModels || []).filter(Boolean)
  const ids = enabled.length ? enabled : (defaultModel ? [defaultModel] : all.slice(0, 1).map((m) => m.value))
  const options = ids.map((id) => all.find((m) => m.value === id) || { value: id, label: id })
  const seen = new Set<string>()
  return options.filter((m) => {
    if (!m.value || seen.has(m.value)) return false
    seen.add(m.value)
    return true
  })
}

export function modelLabel(value: string, provider?: string | null): string {
  if (!value) return 'IP default'
  return allModelOptions(provider).find((m) => m.value === value)?.label || value
}

/* Theme persistence — Elma keeps its own key (so each UI remembers its schema). */
export const ELMA_THEME_KEY = 'arbol-theme:elma'
export const ELMA_UI_SCALE_KEY = 'arbol-ui-font-scale:elma'
export const ELMA_CONTENT_SCALE_KEY = 'arbol-content-font-scale:elma'
export const ELMA_DEFAULT_THEME = 'redwood'

/* Font-size bounds (px). The agent response (content) may grow larger than UI. */
export const BASE_FONT = 13.5
const MAX_UI_FONT = 23
const MAX_CONTENT_FONT = 32
const MIN_FONT = 11.5
export const UI_MAX = MAX_UI_FONT / BASE_FONT
export const CONTENT_MAX = MAX_CONTENT_FONT / BASE_FONT
export const SCALE_MIN = MIN_FONT / BASE_FONT
export const FONT_STEP = 0.1
export const round2 = (v: number) => Math.round(v * 100) / 100

/* Two-column breakpoint: the chat column (max-chat-area-width ≈ 820px) plus ≥50%
 * more room for a reserved side column. */
export const MAX_CHAT_AREA_WIDTH = 820
export const TWO_COL_AT = MAX_CHAT_AREA_WIDTH * 1.5

/* Repos pinned to ⌘1…⌘N in fixed order. The rest of the number hotkeys fill
 * from recency (excluding these); ⌘0 is the "Other…" folder picker. */
import { PINNED_REPOS } from './nav/repoNavigation'
export { PINNED_REPOS }

/* Deterministic muted hue per repo name → unique repo glyph tint (GitHub-style
 * repo avatars). Low chroma so it sits inside the themed palette. */
export function repoHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

export function repoInitials(name: string): string {
  const clean = name.replace(/^[^a-z0-9]+/i, '')
  const parts = clean.split(/[-_ ]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}

/* A 32-bit FNV-1a hash of the repo name — seeds the fallback icon + tile tint. */
function repoHash(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/* Semantic icon per repo, derived from the name. Known words map to a fitting
 * glyph (arbol → 🌳, hyperkey → 🔑, …); anything else gets a
 * stable, distinct object glyph picked by hash — a real icon, never noise.
 * Keyword list is ordered: first substring match wins. */
const REPO_KEYWORD_ICONS: [RegExp, string][] = [
  [/\b(arbol|arbor)\b|arbol/, '🌳'],
  [/oaken|\boak/, '🌳'],
  [/seqoya|sequoia|redwood/, '🌲'],
  [/willo|willow/, '🌿'],
  [/\belm|elma/, '🍃'],
  [/hyperkey|hotkey|\bkey/, '🔑'],
  [/cursor/, '🖱️'],
  [/\barco|arch|rainbow/, '🌈'],
  [/integration/, '🔌'],
  [/effector|effect|spark|bolt|flash/, '⚡'],
  [/scratch|note|draft/, '📝'],
  [/design|theme|paint|color/, '🎨'],
  [/amuse|play|fun|game/, '🎮'],
  [/quiz|broquiz|card/, '🃏'],
  [/bridge/, '🌉'],
  [/slack|chat|message/, '💬'],
  [/\bapi|gateway|server|backend/, '🛰️'],
  [/web|site|front|render|\bui\b/, '🌐'],
  [/mobile|\bapp\b|ios|android/, '📱'],
  [/\bbot|agent|\bai\b|\bml\b|brain/, '🤖'],
  [/\bdata|\bdb\b|sql|store|warehouse/, '🗄️'],
  [/auth|secure|security|vault|crypto/, '🔐'],
  [/test|spec|\bqa\b/, '🧪'],
  [/doc|guide|wiki|book/, '📚'],
  [/finance|pay|bank|money|billing/, '💳'],
  [/config|setting|infra|ops|deploy/, '⚙️'],
]

const FALLBACK_ICONS = ['📦', '🧩', '🔧', '🧱', '📁', '🗂️', '🛠️', '🔩', '📐', '💠', '🔭', '🧭', '📊', '🪵', '🌱', '🍂']

export function repoEmoji(name: string): string {
  const n = name.toLowerCase()
  for (const [re, icon] of REPO_KEYWORD_ICONS) if (re.test(n)) return icon
  return FALLBACK_ICONS[repoHash(name) % FALLBACK_ICONS.length]
}

/* ── Recently-accessed repos (Elma-local MRU) ──────────────────────────────
 * Tracks repos opened in Elma, most-recent first, so the number hotkeys after
 * the pinned slots reflect true access order (and a repo picked via "Other…"
 * shows up immediately). Pinned repos are never stored here. Persisted across
 * launches. */
export const ELMA_RECENTS_KEY = 'arbol-recents:elma'
const RECENTS_CAP = 16

export type RecentRepo = { name: string; path: string }

export function loadRecents(): RecentRepo[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ELMA_RECENTS_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((r): r is RecentRepo => !!r && typeof r.name === 'string' && typeof r.path === 'string')
      .filter((r) => !(PINNED_REPOS as readonly string[]).includes(r.name))
      .slice(0, RECENTS_CAP)
  } catch {
    return []
  }
}

/* Return the new MRU list with `repo` promoted to the front (deduped by name).
 * Pinned repos are not tracked. Caller persists + sets state. */
export function withRecent(prev: RecentRepo[], repo: RecentRepo): RecentRepo[] {
  if ((PINNED_REPOS as readonly string[]).includes(repo.name)) return prev
  const next = [repo, ...prev.filter((r) => r.name !== repo.name)].slice(0, RECENTS_CAP)
  try {
    localStorage.setItem(ELMA_RECENTS_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / disabled storage */
  }
  return next
}

export type AssistantCycle = { content?: string; thinking?: string; ts?: number; seq?: number }
export type ArbolRequestResult = {
  request_id?: string
  requestId?: string
  turn_id?: string
  ok: boolean
  kind?: string
  params?: Record<string, unknown>
  opened_ts?: number
  result?: Record<string, unknown>
  error?: string
  ts?: number
}
export type ArbolRequestStatus = {
  request_id?: string
  requestId?: string
  kind?: string
  params?: Record<string, unknown>
  ts?: number
  phase?: string
  decision?: string | null
  ok?: boolean | null
}

export function assistantBlocks(
  cycles: AssistantCycle[] = [],
  results: ArbolRequestResult[] = [],
  statuses: ArbolRequestStatus[] = [],
  nativeToolCalls: NativeToolCallView[] = [],
): AnswerBlock[] {
  // Interleave assistant prose cycles and native tool calls in event order.
  // Durable items share the canonical `session_seq`; prefer it even when their
  // millisecond timestamps are skewed, otherwise a tool invocation can render
  // after the prose produced by its result and push the Answer Threshold below
  // the final answer. Live streaming cycles do not have a sequence yet, so mixed
  // durable/live items continue to use timestamps until both sides are durable.
  const MAX = Number.MAX_SAFE_INTEGER
  const items: { seq?: number; ts: number; order: number; blocks: AnswerBlock[] }[] = []
  cycles.forEach((cycle, i) => {
    const bs: AnswerBlock[] = []
    const thinking = cycle.thinking || ''
    if (thinking.trim()) bs.push({ t: 'thinking', v: thinking })
    const content = cycle.content || ''
    if (content.trim()) bs.push(...parseMarkdown(content))
    if (bs.length) items.push({ seq: cycle.seq, ts: cycle.ts ?? MAX, order: i * 2, blocks: bs })
  })
  nativeToolCalls.forEach((call, i) => {
    items.push({ seq: call.seq, ts: call.invoked_ts ?? MAX, order: i * 2 + 1, blocks: [{ t: 'native', call }] })
  })
  // Request statuses/results intentionally do not create answer blocks. Provider-native
  // executions arrive through nativeToolCalls and become `native`.
  void results
  void statuses
  // Keep live/legacy items in timestamp positions, then canonically reorder
  // durable items within the slots they occupy. A pairwise comparator that
  // sometimes uses seq and sometimes timestamp is non-transitive; slotting gives
  // us one deterministic order while preventing one unsequenced historical row
  // from disabling sequence order for every durable item in the response.
  const ordered = items.sort((a, b) => (a.ts - b.ts)
    || ((a.seq ?? MAX) - (b.seq ?? MAX))
    || (a.order - b.order))
  const durable = ordered
    .filter((item) => item.seq !== undefined)
    .sort((a, b) => (a.seq! - b.seq!) || (a.ts - b.ts) || (a.order - b.order))
  let durableIndex = 0
  const blocks = ordered
    .map((item) => item.seq === undefined ? item : durable[durableIndex++])
    .flatMap((item) => item.blocks)
  // Tool stdout/stderr is shown by the live/final `output` row rendered next to
  // each request. Do not inject the old durable result envelope.
  return blocks
}

export const parseMarkdown = parseProse



/* A plausible, scrollable agent answer so the response region has real content
 * in dev/standalone (mirrors the `session.send` stream the real app appends). */
export function mockAnswer(repo: string, _prompt: string): AnswerBlock[] {
  return [
    { t: 'p', v: `Looking at \`${repo}\` — here's the shape of what you're asking for and how I'd approach it.` },
    {
      t: 'p',
      v: 'First, the entry point. The session is created against the repo’s default Intelligence, so credentials and model selection are already resolved before the first turn runs — you don’t need to wire any of that yourself.',
    },
    { t: 'h', v: 'Plan' },
    {
      t: 'ol',
      v: [
        'Resolve the working directory and load the repo rules for the bound subscription.',
        'Open a streaming turn against the selected provider with the current thinking level.',
        'Render incremental output as it arrives; keep the composer collapsed until the turn settles.',
      ],
    },
    {
      t: 'p',
      v: 'The trickiest part is keeping the pinned question in sync with the scroll region without duplicating state. The pin owns the prompt; the scroll region owns the answer. Clicking the pin just resets the answer’s scrollTop.',
    },
    {
      t: 'code',
      v: 'async function runTurn(session, prompt, opts) {\n  const stream = await session.turn({\n    prompt,\n    thinking: opts.thinking,   // none … ultra\n    ip: opts.intelligence,     // ⌃1…⌃N\n  });\n  for await (const chunk of stream) {\n    appendToAnswer(chunk.delta);\n  }\n}',
    },
    {
      t: 'p',
      v: 'A few things worth deciding before this hardens: whether follow-up turns replace the pinned prompt or stack into a thread, and whether Arbol-initiated sessions land in this same view or a sibling tab. Both are reversible, but they change the navigation model.',
    },
    { t: 'h', v: 'Next steps' },
    {
      t: 'ul',
      v: [
        'Confirm the single-turn vs. threaded model for follow-ups.',
        'Decide where agent-initiated chats surface (here vs. Willo handoff).',
        'Wire the real repos.list timestamps so ⌘1…⌘N reflect true recency.',
      ],
    },
    { t: 'p', v: 'Press Enter to start a new message whenever you want to refine any of this.' },
  ]
}

/* seedTree — a plausible backlog, as a conversation TREE, so branch navigation
 * has something to work with in dev/standalone (no Swift host bridge). It is the
 * old four-turn linear seed PLUS one pre-existing bifurcation: turn 3 (`seed-2`)
 * has a second child, an alternative continuation. The active path follows the
 * original branch, so on load the turn after the fork shows "Branch 1/2" and the
 * ⌘P overlay shows a "branch point" group — making the branch UI visible at
 * once. Real builds start empty (the tree is the session transcript). */
export function seedTree(): SeededTree {
  const now = Date.now()
  const min = 60 * 1000
  const seedAnswer = (lead: string, body: string): AnswerBlock[] => [
    { t: 'p', v: lead },
    { t: 'p', v: body },
  ]
  const mk = (
    id: string,
    parentId: string | null,
    ago: number,
    message: string,
    a: [string, string],
    children: string[]
  ): Turn => {
    const sent = now - ago * min
    return {
      id,
      parentId,
      message,
      answer: seedAnswer(a[0], a[1]),
      sentAt: sent,
      startedAt: sent + 900,
      respondedAt: sent + 4200,
      children,
    }
  }

  const nodes: TurnMap = {}
  const add = (n: Turn) => {
    nodes[n.id] = n
  }

  add(
    mk('seed-0', null, 41,
      'Where does the session credential resolution actually happen when I open a repo with default Intelligence?',
      [
        'Credential + model selection resolve at session.create — before the first turn runs.',
        'So the binding for the repo’s default Intelligence is already in place by the time you start typing; you never wire it per-turn.',
      ],
      ['seed-1'])
  )
  add(
    mk('seed-1', 'seed-0', 33,
      'Can a follow-up turn keep the same streaming connection or does each turn reopen one?',
      [
        'Each turn opens its own streaming handle against the selected provider, but the session (and its resolved credentials) is reused.',
        'Reopening the stream is cheap; the cost you’d actually feel is re-resolving the IP, which the session already cached.',
      ],
      ['seed-2'])
  )
  // ── bifurcation: seed-2 forks into two children (two ways it continued) ──
  add(
    mk('seed-2', 'seed-1', 18,
      "What's the cleanest way to keep the pinned question and the scroll region from fighting over state?",
      [
        'Let the pin own the prompt and the scroll region own the answer — they never share state, they just sit in the same turn record.',
        'Clicking the pin is then a pure view action: it resets the answer’s scrollTop, nothing else.',
      ],
      ['seed-3', 'seed-3b'])
  )
  // branch 1 (original / active)
  add(
    mk('seed-3', 'seed-2', 6,
      'If Arbol kicks off a chat on its own, should it land in this same view or somewhere else?',
      [
        'Agent-initiated sessions can surface here as just another turn, or hand off to Willo — both are reversible.',
        'The deciding factor is whether the user expects to find machine-started work in the same backlog they navigate by hand.',
      ],
      [])
  )
  // branch 2 (the alternative the user is exploring)
  add(
    mk('seed-3b', 'seed-2', 9,
      'Different tack — if two people drive the same session at once, how do we stop their turns from colliding?',
      [
        'Treat the session as single-writer: turns are serialized, so a second sender is queued behind the in-flight turn rather than interleaved.',
        'Presence is separate from authorship — you can show both people live, but only one turn streams into the backlog at a time.',
      ],
      [])
  )

  return {
    nodes,
    rootId: 'seed-0',
    activeChild: { 'seed-2': 0 }, // follow branch 1 by default
    viewIndex: 3, // land on the turn after the fork (shows Branch 1/2)
  }
}

/* ── Viewed-branch persistence ──────────────────────────────────────────────
 * `activeChild` (which branch the user is looking at) + the on-screen turn are
 * client *view* state, not part of the conversation tree (which is server-side
 * in the real app). Persist them per repo so a UI restart reopens the SAME
 * branch + turn rather than snapping to the default (newest) leaf. */
export const ELMA_BRANCH_VIEW_PREFIX = 'arbol-branch-view:elma:'

export type BranchView = { activeChild: ActiveChild; currentId: string | null }

export function loadBranchView(repo: string): BranchView | null {
  try {
    const raw = JSON.parse(localStorage.getItem(ELMA_BRANCH_VIEW_PREFIX + repo) || 'null')
    if (raw && typeof raw === 'object' && raw.activeChild && typeof raw.activeChild === 'object') {
      return { activeChild: raw.activeChild as ActiveChild, currentId: (raw.currentId as string) || null }
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null
}

export function saveBranchView(repo: string, view: BranchView): void {
  try {
    localStorage.setItem(ELMA_BRANCH_VIEW_PREFIX + repo, JSON.stringify(view))
  } catch {
    /* ignore quota / disabled storage */
  }
}

/* The live Core session id bound to a repo, persisted so a reload re-attaches to
 * the SAME session (the fold then replays its log and the conversation tree is
 * reconstructed) instead of starting empty. Keyed per repo, like the branch
 * view. Cleared if the session turns out stale (deleted / daemon DB reset). */
export const ELMA_SESSION_PREFIX = 'arbol-core-session:elma:'

export function loadSessionId(repo: string): string | null {
  try {
    return localStorage.getItem(ELMA_SESSION_PREFIX + repo) || null
  } catch {
    return null
  }
}

export function saveSessionId(repo: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(ELMA_SESSION_PREFIX + repo, id)
    else localStorage.removeItem(ELMA_SESSION_PREFIX + repo)
  } catch {
    /* ignore quota / disabled storage */
  }
}

/* A display session id for the "Copy session ID" quick action before the real
 * `session.create` id is known (dev/standalone, or pre-first-send). Crockford-ish. */
export function mkSessionId(repo: string): string {
  const a = '0123456789abcdefghjkmnpqrstvwxyz'
  let h = 0x811c9dc5
  for (let i = 0; i < repo.length; i++) {
    h ^= repo.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let s = ''
  let x = (h >>> 0) ^ (Date.now() & 0xffffff)
  for (let i = 0; i < 16; i++) {
    s += a[x % a.length]
    x = Math.imul(x ^ (x >>> 5), 0x01000193) >>> 0
  }
  return `sesh_${s}`
}
