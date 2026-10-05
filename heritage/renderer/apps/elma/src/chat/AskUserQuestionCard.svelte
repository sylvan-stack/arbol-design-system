<script lang="ts">
  /* AskUserQuestionCard — Claude's native AskUserQuestion as a first-class Q&A
   * card. Answer payload Claude reads is { "<question text>": "<label>" } with
   * multi-select labels comma-joined (matches the CLI's tool_result builder). */
  import type { PendingApproval } from './usePendingApprovals'
  import { askUserQuestionPayload, NATIVE_ACCENT, NATIVE_ACCENT_SOFT } from './ToolApprovalCard.helpers'
  import ActionButton from './ActionButton.svelte'

  let {
    approval,
    busy,
    onSubmit,
    onCancel,
  }: {
    approval: PendingApproval
    busy: boolean
    onSubmit: (answers: Record<string, string>) => void
    onCancel: () => void
  } = $props()

  const questions = $derived(askUserQuestionPayload(approval.params).questions)
  const anyOptions = $derived(questions.some((q) => q.options.length > 0))

  // One selection set per question (indices into q.options). Single-select
  // questions hold at most one; multiSelect questions accumulate.
  let selected = $state<Record<number, Set<number>>>({})

  const buildAnswers = (): Record<string, string> => {
    const out: Record<string, string> = {}
    questions.forEach((q, qi) => {
      const labels = [...(selected[qi] ?? [])]
        .sort((a, b) => a - b)
        .map((oi) => q.options[oi]?.label)
        .filter((l): l is string => Boolean(l))
      if (q.question && labels.length) out[q.question] = labels.join(', ')
    })
    return out
  }

  const toggle = (qi: number, oi: number, multi: boolean) => {
    const next = { ...selected }
    const cur = new Set(next[qi] ?? [])
    if (multi) {
      if (cur.has(oi)) cur.delete(oi)
      else cur.add(oi)
    } else {
      cur.clear()
      cur.add(oi)
    }
    next[qi] = cur
    selected = next
  }

  const answered = $derived(questions.every((q, qi) => q.options.length === 0 || (selected[qi]?.size ?? 0) > 0))
  const canSubmit = $derived(anyOptions && answered)
</script>

<div
  style="border:1px solid color-mix(in srgb, {NATIVE_ACCENT} 52%, var(--arbol-color-border));border-left:3px solid {NATIVE_ACCENT};border-radius:var(--arbol-radius-m);background:{NATIVE_ACCENT_SOFT};overflow:hidden"
>
  <div
    style="display:flex;align-items:center;gap:var(--arbol-space-2);padding:var(--arbol-space-2) var(--arbol-space-3);font:600 0.84em/1.5 var(--arbol-font-mono);color:var(--arbol-color-text)"
  >
    <span aria-hidden="true" style="color:{NATIVE_ACCENT};flex-shrink:0">?</span>
    <span style="color:{NATIVE_ACCENT};flex-shrink:0">Claude asks</span>
    <span style="color:var(--arbol-color-text-muted);font-weight:500;flex-shrink:0">choose how to continue</span>
    <span style="flex:1"></span>
    <span
      title="Asked by Claude's native AskUserQuestion tool"
      style="color:{NATIVE_ACCENT};font-weight:600;flex-shrink:0;font-size:0.82em;letter-spacing:0.02em;border:1px solid color-mix(in srgb, {NATIVE_ACCENT} 45%, var(--arbol-color-border));background:{NATIVE_ACCENT_SOFT};border-radius:999px;padding:1px 7px"
    >
      native
    </span>
  </div>

  <!-- Questions scroll; the header above and the Submit/Cancel footer below stay
       visible even when many questions/options exceed the viewport. -->
  <div
    style="display:grid;gap:var(--arbol-space-4);padding:var(--arbol-space-3);border-top:1px solid var(--arbol-color-border);background:var(--arbol-color-surface);max-height:min(55vh, 560px);overflow-y:auto;overscroll-behavior:contain"
  >
    {#each questions as q, qi (qi)}
      <div style="display:grid;gap:var(--arbol-space-2)">
        {#if q.header}
          <span
            style="justify-self:start;font:600 0.72em/1.3 var(--arbol-font-mono);letter-spacing:0.04em;text-transform:uppercase;color:{NATIVE_ACCENT};border:1px solid color-mix(in srgb, {NATIVE_ACCENT} 38%, var(--arbol-color-border));background:{NATIVE_ACCENT_SOFT};border-radius:999px;padding:1px 8px"
          >
            {q.header}
          </span>
        {/if}
        <div style="font:600 var(--arbol-type-body)/1.45 var(--arbol-font-ui);color:var(--arbol-color-text);white-space:pre-wrap">
          {q.question}
        </div>
        {#if q.multiSelect}
          <div style="font:400 var(--arbol-type-label)/1.3 var(--arbol-font-ui);color:var(--arbol-color-text-muted)">
            You can pick more than one.
          </div>
        {/if}
        {#if q.options.length > 0}
          <div style="display:grid;gap:var(--arbol-space-2)">
            {#each q.options as o, i (`${o.label}-${i}`)}
              {@const isSelected = selected[qi]?.has(i) ?? false}
              <button
                type="button"
                disabled={busy}
                aria-pressed={isSelected}
                onclick={() => toggle(qi, i, q.multiSelect)}
                title={isSelected ? 'Selected' : 'Select this option'}
                style="all:unset;box-sizing:border-box;cursor:{busy
                  ? 'default'
                  : 'pointer'};opacity:{busy
                  ? 0.5
                  : 1};display:grid;grid-template-columns:auto 1fr;align-items:start;column-gap:var(--arbol-space-2);row-gap:3px;padding:var(--arbol-space-3);border-radius:var(--arbol-radius-s);border:{isSelected
                  ? `1px solid ${NATIVE_ACCENT}`
                  : `1px solid color-mix(in srgb, ${NATIVE_ACCENT} 38%, var(--arbol-color-border))`};background:{isSelected
                  ? `color-mix(in srgb, ${NATIVE_ACCENT} 16%, var(--arbol-color-surface-2))`
                  : 'color-mix(in srgb, var(--arbol-color-surface-2) 82%, transparent)'};color:var(--arbol-color-text)"
              >
                <span
                  aria-hidden="true"
                  style="{o.description ? 'grid-row:span 2;' : ''}color:{isSelected
                    ? NATIVE_ACCENT
                    : 'var(--arbol-color-text-muted)'};font:700 var(--arbol-type-label)/1.25 var(--arbol-font-mono)"
                >
                  {isSelected ? '◉' : '○'}
                </span>
                <span style="font:700 var(--arbol-type-label)/1.25 var(--arbol-font-ui)">{o.label}</span>
                {#if o.description}
                  <span style="grid-column:2;font:400 var(--arbol-type-label)/1.35 var(--arbol-font-ui);color:var(--arbol-color-text-muted)">
                    {o.description}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div style="display:flex;gap:var(--arbol-space-2);padding:var(--arbol-space-3);border-top:1px solid var(--arbol-color-border)">
    {#if anyOptions}
      <ActionButton variant="primary" disabled={busy || !canSubmit} onClick={() => onSubmit(buildAnswers())}>
        {#snippet children()}Submit{/snippet}
      </ActionButton>
    {:else}
      <ActionButton variant="primary" disabled={busy} onClick={() => onSubmit({})}>
        {#snippet children()}Continue{/snippet}
      </ActionButton>
    {/if}
    <span style="flex:1"></span>
    <ActionButton variant="ghost" disabled={busy} onClick={onCancel}>
      {#snippet children()}Cancel{/snippet}
    </ActionButton>
  </div>
</div>
