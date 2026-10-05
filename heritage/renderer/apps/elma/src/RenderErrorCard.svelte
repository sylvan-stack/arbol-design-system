<script lang="ts">
  /* A presentational error card: a title, the error message, an optional set of
   * diagnostic key/values (session id, status, turn, …), and a retry button.
   * Generic on purpose — the caller supplies the Elma-specific `details`. */
  let { error, onRetry, title = 'Something went wrong', details }:
    {
      error: Error
      onRetry?: () => void
      title?: string
      details?: Record<string, string | number | null | undefined>
    } = $props()

  const rows = $derived(Object.entries(details ?? {}))

  const cardWrap =
    'display:flex;align-items:center;justify-content:center;height:100%;min-height:0;' +
    'padding:var(--arbol-space-6, 24px);box-sizing:border-box'
  const card =
    'max-width:560px;width:100%;' +
    'border:1px solid color-mix(in oklch, var(--arbol-color-danger, #d05c5c) 40%, var(--arbol-color-border));' +
    'border-radius:var(--arbol-radius-l, 12px);' +
    'background:color-mix(in oklch, var(--arbol-color-danger, #d05c5c) 7%, var(--arbol-color-surface));' +
    'padding:var(--arbol-space-5, 20px);color:var(--arbol-color-text)'
</script>

<div style={cardWrap}>
  <div style={card} role="alert">
    <div style="display:flex;align-items:center;gap:var(--arbol-space-2, 8px);margin-bottom:var(--arbol-space-3, 12px)">
      <span aria-hidden="true" style="color:var(--arbol-color-danger, #d05c5c);font-size:1.1em;font-weight:700">!</span>
      <h2 style="margin:0;font-size:1.05em;font-weight:700">{title}</h2>
    </div>
    <p style="margin:0 0 var(--arbol-space-3, 12px);color:var(--arbol-color-text-muted);line-height:1.5">
      The conversation log is safe — this is a display error in Elma, not lost data. Switching repo or
      navigating to another message often recovers; the full stack is in the developer console.
    </p>
    <pre
      style="margin:0 0 var(--arbol-space-3, 12px);padding:var(--arbol-space-3, 12px);border-radius:var(--arbol-radius-m, 8px);
             background:var(--arbol-color-surface-2, rgba(0,0,0,0.04));font:400 0.82em/1.5 var(--arbol-font-mono);
             white-space:pre-wrap;word-break:break-word;color:var(--arbol-color-danger, #d05c5c)"
    >{error.message || String(error)}</pre>
    {#if rows.length > 0}
      <dl
        style="display:grid;grid-template-columns:auto 1fr;gap:0.25em 0.75em;margin:0 0 var(--arbol-space-4, 16px);
               font:400 0.82em/1.5 var(--arbol-font-mono);color:var(--arbol-color-text-muted)"
      >
        {#each rows as [k, v] (k)}
          <div style="display:contents">
            <dt style="opacity:0.7">{k}</dt>
            <dd style="margin:0;word-break:break-word;color:var(--arbol-color-text)">{v ?? '—'}</dd>
          </div>
        {/each}
      </dl>
    {/if}
    {#if onRetry}
      <button
        type="button"
        onclick={onRetry}
        style="all:unset;cursor:pointer;padding:var(--arbol-space-2, 8px) var(--arbol-space-4, 16px);
               border-radius:var(--arbol-radius-m, 8px);background:var(--arbol-color-accent);
               color:var(--arbol-color-on-accent, #fff);font-weight:600;font-size:0.9em"
      >
        Try again
      </button>
    {/if}
  </div>
</div>
