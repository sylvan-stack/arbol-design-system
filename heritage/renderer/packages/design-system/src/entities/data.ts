/* @arbol/design-system — Entity kit data (ux-ui-guide.md §1.11). Framework-
 * agnostic: types + the ENTITIES registry + self-injecting chip styles. The
 * Svelte EntityChip/EntityCard render from this. (Ported from entities/index.tsx.) */

export type EntityKind =
  | 'ticket' | 'graft' | 'mr' | 'commit' | 'slack' | 'telegram' | 'telegram_conversation' | 'email' | 'confluence' | 'comunicado' | 'chat'
  | 'artifact' | 'requirement' | 'invariant' | 'glossary' | 'secret'
  | 'flyer' | 'branch' | 'hunk' | 'living_topic' | 'mandate' | 'prompt' | 'response'

export type EntityShape = 'span' | 'mark' | 'note'

export type EntityKindMeta = { tag: string; label: string; shape: EntityShape; hue: number; glyph: string }

export type Entity = { kind: EntityKind; title: string; meta?: string; state?: string; live?: boolean }

const KINDS: Record<EntityKind, EntityKindMeta> = {
  ticket: { tag: 'tic', label: 'Ticket', shape: 'mark', hue: 256, glyph: '▣' },
  graft: { tag: 'grf', label: 'Graft', shape: 'note', hue: 84, glyph: '⋎' },
  mr: { tag: 'mr', label: 'Merge request', shape: 'mark', hue: 150, glyph: '⇄' },
  commit: { tag: 'cmt', label: 'Commit', shape: 'mark', hue: 200, glyph: '●' },
  slack: { tag: 'slk', label: 'Slack message', shape: 'mark', hue: 285, glyph: '#' },
  telegram_conversation: { tag: 'tlc', label: 'Telegram conversation', shape: 'mark', hue: 220, glyph: '➤' },
  telegram: { tag: 'tel', label: 'Telegram message', shape: 'mark', hue: 220, glyph: '➤' },
  email: { tag: 'eml', label: 'Email', shape: 'mark', hue: 180, glyph: '✉' },
  confluence: { tag: 'cnf', label: 'Confluence page', shape: 'note', hue: 215, glyph: '◧' },
  comunicado: { tag: 'com', label: 'Comunicado', shape: 'mark', hue: 45, glyph: '!' },
  chat: { tag: 'cht', label: 'Chat session', shape: 'span', hue: 34, glyph: '❝' },
  artifact: { tag: 'arf', label: 'Artifact', shape: 'note', hue: 210, glyph: '◫' },
  requirement: { tag: 'req', label: 'Requirement', shape: 'note', hue: 95, glyph: '§' },
  invariant: { tag: 'inv', label: 'Invariant', shape: 'note', hue: 322, glyph: '∎' },
  glossary: { tag: 'glo', label: 'Glossary term', shape: 'note', hue: 122, glyph: '≝' },
  secret: { tag: 'sec', label: 'Arbol secret', shape: 'note', hue: 0, glyph: '⚷' },
  flyer: { tag: 'fly', label: 'Flyer', shape: 'note', hue: 68, glyph: '▤' },
  branch: { tag: 'brn', label: 'Branch', shape: 'note', hue: 270, glyph: '⎇' },
  hunk: { tag: 'hun', label: 'Hunk', shape: 'note', hue: 12, glyph: '≋' },
  living_topic: { tag: 'liv', label: 'Living Topic', shape: 'note', hue: 172, glyph: '◉' },
  mandate: { tag: 'mnd', label: 'Mandate', shape: 'note', hue: 48, glyph: '✦' },
  prompt: { tag: 'pmt', label: 'Prompt', shape: 'mark', hue: 264, glyph: '›' },
  response: { tag: 'rsp', label: 'Response', shape: 'mark', hue: 156, glyph: '‹' },
}

const STATE_HUE: Record<string, number> = {
  open: 64, merged: 150, closed: 28, started: 200, blocked: 25, finished: 150, review: 256,
}

export const ENTITIES = {
  KINDS,
  ORDER: [
    'ticket', 'graft', 'mr', 'commit', 'slack', 'telegram', 'telegram_conversation', 'email', 'confluence', 'comunicado', 'chat', 'artifact',
    'requirement', 'invariant', 'glossary', 'secret', 'flyer', 'branch', 'hunk', 'living_topic', 'mandate', 'prompt', 'response',
  ] as EntityKind[],
  STATE_HUE,
  meta(kind: EntityKind): EntityKindMeta { return KINDS[kind] || KINDS.chat },
  shapeOf(kind: EntityKind): EntityShape { return this.meta(kind).shape },
  hueOf(kind: EntityKind, state?: string): number {
    return state != null && STATE_HUE[state] != null ? STATE_HUE[state] : this.meta(kind).hue
  },
  line(kind: EntityKind, state?: string): string { return `oklch(0.70 0.13 ${this.hueOf(kind, state)})` },
  soft(kind: EntityKind, a = 22, state?: string): string {
    return `color-mix(in oklch, oklch(0.72 0.12 ${this.hueOf(kind, state)}) ${a}%, var(--arbol-color-surface))`
  },
}

/* Self-injecting styles (ec- prefix) so a chip is portable into any UI. Every
 * literal px is scaled by --arbol-font-scale so the Header's A−/A+ scales them. */
const ENTITY_STYLE_ID = 'arbol-entity-styles'
if (typeof document !== 'undefined' && !document.getElementById(ENTITY_STYLE_ID)) {
  const s = document.createElement('style')
  s.id = ENTITY_STYLE_ID
  s.textContent = `
    @keyframes ec-breathe { 0%,100% { opacity: .4; } 50% { opacity: 1; } }
    .ec { display: flex; align-items: flex-start; gap: 7px; max-width: 100%; min-width: 0;
      background: var(--arbol-color-surface); border: 1px solid var(--arbol-color-border);
      border-left: 2px solid var(--ec-line); border-radius: 8px; padding: 6px 9px; box-shadow: var(--arbol-shadow-1); }
    .ec.live { border-left-width: 3px; }
    .ec-glyph { font-size: calc(12px * var(--arbol-font-scale)); line-height: 1.1; flex-shrink: 0; }
    .ec-body { min-width: 0; }
    .ec-title { font: 600 calc(11px * var(--arbol-font-scale))/1.2 var(--arbol-font-ui); color: var(--arbol-color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ec-meta { margin-top: 2px; font: 500 calc(8.5px * var(--arbol-font-scale))/1 var(--arbol-font-mono); color: var(--arbol-color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ec-tag { letter-spacing: .5px; }
    .ec-live { display: inline-block; width: 6px; height: 6px; border-radius: 99px; margin-right: 5px; vertical-align: middle; animation: ec-breathe 1.8s ease-in-out infinite; }
    .ec-card { display: block; background: var(--arbol-color-surface); border: 1px solid var(--arbol-color-border);
      border-left: 3px solid var(--ec-line); border-radius: 10px; padding: 10px 12px; box-shadow: var(--arbol-shadow-1); }
    .ec-card .ec-card-head { display: flex; align-items: center; gap: 7px; }
    .ec-card .ec-card-glyph { font-size: calc(13px * var(--arbol-font-scale)); }
    .ec-card .ec-card-kind { font: 600 calc(9px * var(--arbol-font-scale))/1 var(--arbol-font-mono); letter-spacing: .6px; }
    .ec-card .ec-card-title { margin-top: 7px; font: 600 calc(13px * var(--arbol-font-scale))/1.3 var(--arbol-font-ui); color: var(--arbol-color-text); }
    .ec-card .ec-card-meta { margin-top: 4px; font: 500 calc(9.5px * var(--arbol-font-scale))/1 var(--arbol-font-mono); color: var(--arbol-color-text-muted); }
    @media (prefers-reduced-motion: reduce) { .ec-live { animation: none; opacity: 1; } }
  `
  document.head.appendChild(s)
}
