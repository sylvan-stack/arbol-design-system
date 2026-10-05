<script lang="ts">
  import ActivityGraphPanel from './ActivityGraphPanel.svelte'
  let {
    onClose,
    sessionId,
    exchangeId,
    repo,
    ip,
    model,
    worktree,
  }: {
    sessionId?: string | null
    exchangeId?: string | null
    onClose: () => void
    repo?: string
    ip?: string
    model?: string
    worktree?: string | null
  } = $props()

  const context = $derived([
    { label: 'Repo', value: repo || 'Not selected' },
    { label: 'IP', value: ip || 'Not selected' },
    { label: 'Model', value: model || 'Not selected' },
    { label: 'Working directory', value: worktree || 'Not selected' },
  ])
</script>

<aside
  aria-label="Thread Inspector"
  style="border-left:1px solid var(--arbol-color-border);background:color-mix(in oklch, var(--arbol-color-surface) 30%, var(--arbol-color-bg));min-width:0;min-height:0;height:100%;display:grid;grid-template-rows:auto 1fr"
>
  <header
    style="display:flex;align-items:center;gap:var(--arbol-space-3);min-width:0;padding:var(--arbol-space-3) var(--arbol-space-4);border-bottom:1px solid var(--arbol-color-border);background:var(--arbol-color-surface)"
  >
    <div style="min-width:0;flex:1">
      <div style="color:var(--arbol-color-text);font:700 var(--arbol-type-body)/1.2 var(--arbol-font-ui)">
        Thread Inspector
      </div>
      <div style="margin-top:3px;color:var(--arbol-color-text-muted);font:400 var(--arbol-type-label)/1.25 var(--arbol-font-ui)">
        Conversation lifecycle
      </div>
    </div>
    <button
      type="button"
      onclick={onClose}
      aria-label="Close Thread Inspector"
      title="Close"
      style="all:unset;box-sizing:border-box;width:28px;height:28px;display:grid;place-items:center;cursor:pointer;border-radius:var(--arbol-radius-s);border:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2);color:var(--arbol-color-text-muted);font:700 16px/1 var(--arbol-font-ui)"
    >
      ×
    </button>
  </header>

  <div style="min-height:0;overflow:auto;padding:var(--arbol-space-4)">
    <section
      aria-labelledby="thread-context-title"
      style="border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface);overflow:hidden"
    >
      <h2
        id="thread-context-title"
        style="margin:0;padding:var(--arbol-space-3) var(--arbol-space-4);border-bottom:1px solid var(--arbol-color-border);color:var(--arbol-color-text-muted);font:700 var(--arbol-type-label)/1 var(--arbol-font-ui);letter-spacing:.04em;text-transform:uppercase"
      >
        Initial context
      </h2>
      <dl style="margin:0">
        {#each context as item}
          <div style="display:grid;grid-template-columns:88px minmax(0,1fr);gap:var(--arbol-space-3);padding:var(--arbol-space-3) var(--arbol-space-4);border-bottom:1px solid var(--arbol-color-border)">
            <dt style="color:var(--arbol-color-text-muted);font:600 var(--arbol-type-label)/1.3 var(--arbol-font-ui)">{item.label}</dt>
            <dd title={item.value} style="min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--arbol-color-text);font:500 var(--arbol-type-label)/1.3 var(--arbol-font-mono)">{item.value}</dd>
          </div>
        {/each}
      </dl>
    </section>

    <ActivityGraphPanel {sessionId} {exchangeId} />
  </div>
</aside>
