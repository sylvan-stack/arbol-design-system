/* Storybook-only fixtures for the Oaken Swimlanes board. The app entry never imports this
 * module, so the catalogue cannot leak into the shipping renderer bundle. */
import type { EntityKind } from '@arbol/design-system'
import type { EntityItem, Swimlane, Swimmer, SwimlaneRootKind } from './data'
import type { HourPoint, WallType } from './time'

/** A mid-workday reference keeps every timeline state visible and deterministic. */
export const BOARD_REFERENCE_NOW_MS = (() => {
  const d = new Date()
  d.setHours(13, 30, 0, 0)
  return d.getTime()
})()

const ROOTS: Array<{ kind: SwimlaneRootKind; src: string; ref: string }> = [
  { kind: 'ticket', src: 'JIRA', ref: 'ARB-1842' },
  { kind: 'graft', src: 'GRAFT', ref: 'swimlanes-board' },
  { kind: 'mr', src: 'GIT', ref: '!428' },
  { kind: 'commit', src: 'GIT', ref: '9f0a1b2' },
  { kind: 'slack', src: 'SLACK', ref: 'C04PLANNING:1710' },
  { kind: 'email', src: 'EMAIL', ref: 'message-442' },
  { kind: 'chat', src: 'CHAT', ref: 'chat-ux-review' },
  { kind: 'artifact', src: 'ARTF', ref: 'ux-ui-guide.md' },
  { kind: 'requirement', src: 'REQ', ref: 'board-requirement-12' },
  { kind: 'invariant', src: 'INV', ref: 'board-invariant-4' },
  { kind: 'glossary', src: 'TERM', ref: 'swimmer' },
  { kind: 'secret', src: 'SECRET', ref: 'jira-api-token' },
  { kind: 'flyer', src: 'FLYER', ref: 'planning-update' },
  { kind: 'branch', src: 'BRANCH', ref: 'feature/swimlanes-board' },
]

const ENTITY_KINDS: EntityKind[] = [
  'ticket', 'graft', 'mr', 'commit', 'slack', 'email', 'chat',
  'artifact', 'requirement', 'invariant', 'glossary', 'secret', 'flyer',
  'branch',
]

const laneTitles = [
  'Board information architecture',
  'Swimmer interaction model',
  'Timeline geometry and navigation',
  'Urgency and wall semantics',
  'Cross-source planning intake',
  'Long-running work visibility',
  'Accessibility and keyboard flow',
  'Release readiness and polish',
]

const swimmerNames = [
  ['Audit the current planning surface', 'Prototype hierarchy options'],
  ['Clarify swimmer actions', 'Validate multi-source grouping'],
  ['Tune pan, zoom, and fit', 'Stress-test multi-day tracks'],
  ['Calibrate estimated work', 'Escalate a hard deadline'],
  ['Triage incoming requests', 'Turn signals into planned work'],
  ['Observe a live agent session', 'Document hand-off boundaries'],
  ['Complete keyboard walkthrough', 'Review contrast and labels'],
  ['Run final acceptance pass', 'Prepare release notes'],
]

function mark(kind: EntityKind, t: HourPoint, title: string, meta: string, state?: string): EntityItem {
  return { kind, t, title, meta, state }
}

function span(kind: EntityKind, s: HourPoint, e: HourPoint, title: string, meta: string, live = false): EntityItem {
  return { kind, s, e, title, meta, live }
}

function swimmer(
  laneIndex: number,
  swimmerIndex: number,
  state: 'active' | 'overdue' | 'planned' | 'blocked' | 'unwalled' | 'multiDay',
  wallType?: WallType,
): Swimmer {
  const root = ROOTS[(laneIndex * 2 + swimmerIndex) % ROOTS.length]
  const id = `board-l${laneIndex + 1}-s${swimmerIndex + 1}`
  const start: HourPoint =
    state === 'planned' ? [0, 15 + swimmerIndex * 0.25]
      : state === 'multiDay' ? [0, 9.25]
        : [0, 8.5 + ((laneIndex + swimmerIndex) % 4) * 0.75]
  const due: HourPoint | undefined =
    state === 'unwalled' ? undefined
      : state === 'overdue' || state === 'blocked' ? [0, 11.25 + swimmerIndex * 0.5]
        : state === 'planned' ? [0, 18.25 + swimmerIndex * 0.5]
          : state === 'multiDay' ? [1, 16]
            : [0, 15 + ((laneIndex + swimmerIndex) % 4) * 0.75]
  const entityOffset = (laneIndex * 2 + swimmerIndex) % ENTITY_KINDS.length
  const kinds = [0, 1, 2].map((n) => ENTITY_KINDS[(entityOffset + n) % ENTITY_KINDS.length])
  const items: EntityItem[] = [
    mark(kinds[0], [0, Math.max(8.75, start[1] + 0.35)], `${kinds[0]} signal attached`, root.ref, swimmerIndex ? 'review' : 'started'),
    span(kinds[1], [0, Math.max(9, start[1] + 0.7)], [0, Math.max(9.5, start[1] + 1.35)], `${kinds[1]} investigation`, '42 min'),
    mark(kinds[2], [0, Math.max(10, start[1] + 1.7)], `${kinds[2]} follow-up`, `lane ${laneIndex + 1}`),
  ]
  if (laneIndex === 5 && swimmerIndex === 0) {
    items.push(span('chat', [0, 12.5], [0, 13.5], 'Live implementation session', 'Claude · live', true))
  }

  return {
    id,
    nm: swimmerNames[laneIndex][swimmerIndex],
    src: root.src,
    rootKind: root.kind,
    rootRef: root.ref,
    start,
    startMs: BOARD_REFERENCE_NOW_MS,
    ...(due ? { due, dueMs: BOARD_REFERENCE_NOW_MS, type: wallType ?? 'estimated' } : { dueMs: null }),
    ...(state === 'blocked' ? { blocked: true } : {}),
    items,
  }
}

/**
 * Coverage catalogue for the Swimlanes board itself:
 * - all eight occupied Swimlane slots, in their importance order;
 * - two swimmers per lane, covering every Entity-root/source kind and badge;
 * - estimated, due, and deadline walls;
 * - active, overdue, blocked, planned, unwalled, and cross-day tracks;
 * - all Entity kinds in child data (visible when drilling into a Swimlane).
 */
export function allElementsBoard(): Swimlane[] {
  const states: Array<['active' | 'overdue' | 'planned' | 'blocked' | 'unwalled' | 'multiDay', WallType | undefined]> = [
    ['active', 'estimated'], ['active', 'due'],
    ['overdue', 'deadline'], ['blocked', 'due'],
    ['planned', 'estimated'], ['planned', 'deadline'],
    ['unwalled', undefined], ['multiDay', 'due'],
  ]

  return laneTitles.map((tkt, laneIndex) => {
    const first = states[(laneIndex * 2) % states.length]
    const second = states[(laneIndex * 2 + 1) % states.length]
    return {
      n: laneIndex + 1,
      sid: `story-swimlane-${laneIndex + 1}`,
      tkt,
      hue: [256, 302, 34, 18, 150, 202, 84, 235][laneIndex],
      swimmers: [
        swimmer(laneIndex, 0, first[0], first[1]),
        swimmer(laneIndex, 1, second[0], second[1]),
      ],
    }
  })
}

/** A persisted empty lane plus seven placeholders covers both empty-slot menus. */
export function emptyStatesBoard(): Swimlane[] {
  return [{ n: 4, sid: 'story-empty-swimlane', tkt: 'Named lane awaiting its first swimmer', hue: 256, swimmers: [] }]
}
