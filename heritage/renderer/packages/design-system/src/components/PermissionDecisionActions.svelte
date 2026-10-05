<script lang="ts">
  /** One permission-decision surface shared by Elma approval cards and Willo
   * Comunicados. The optional details are submitted with the chosen decision. */
  let {
    busy = false,
    primaryLabel = 'Run',
    allowAlways = true,
    allowStop = false,
    compact = false,
    onApprove,
    onApproveAlways,
    onReject,
    onStop,
  }: {
    busy?: boolean
    primaryLabel?: string
    allowAlways?: boolean
    allowStop?: boolean
    compact?: boolean
    onApprove: (details?: string) => void
    onApproveAlways?: (details?: string) => void
    onReject: (details?: string) => void
    onStop?: () => void
  } = $props()

  let details = $state('')
  const submittedDetails = () => details.trim() || undefined
</script>

<div class:compact class="permission-decision-actions">
  <label>
    <span>Additional details <em>optional</em></span>
    <textarea
      bind:value={details}
      disabled={busy}
      rows={compact ? 2 : 3}
      maxlength="4000"
      placeholder="Context or instructions for the agent…"
    ></textarea>
  </label>
  <div class="decision-buttons">
    <button class="primary" type="button" disabled={busy} onclick={() => onApprove(submittedDetails())}>{primaryLabel}</button>
    {#if allowAlways && onApproveAlways}
      <button type="button" disabled={busy} onclick={() => onApproveAlways?.(submittedDetails())}>Always allow</button>
    {/if}
    <span></span>
    <button class="danger" type="button" disabled={busy} onclick={() => onReject(submittedDetails())}>Reject</button>
    {#if allowStop && onStop}
      <button class="danger" type="button" disabled={busy} onclick={onStop}>Stop</button>
    {/if}
  </div>
</div>

<style>
  .permission-decision-actions { display:grid;gap:var(--arbol-space-2);width:100%; }
  label { display:grid;gap:5px; }
  label > span { color:var(--arbol-color-text-muted);font:600 var(--arbol-type-label)/1.2 var(--arbol-font-ui); }
  em { font-style:normal;font-weight:500;opacity:.75; }
  textarea { box-sizing:border-box;width:100%;resize:vertical;padding:8px 10px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface);color:var(--arbol-color-text);font:500 var(--arbol-type-label)/1.4 var(--arbol-font-ui); }
  textarea:focus { outline:2px solid color-mix(in srgb,var(--arbol-color-accent) 35%,transparent);border-color:var(--arbol-color-accent); }
  .decision-buttons { display:flex;align-items:center;gap:var(--arbol-space-2); }
  .decision-buttons > span { flex:1; }
  button { box-sizing:border-box;cursor:pointer;padding:var(--arbol-space-2) var(--arbol-space-4);border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:transparent;color:var(--arbol-color-text);font:600 var(--arbol-type-label)/1 var(--arbol-font-ui); }
  button.primary { border-color:transparent;background:var(--arbol-color-accent);color:var(--arbol-color-on-accent,#fff); }
  button.danger { color:var(--arbol-color-danger,var(--arbol-color-err,#c0392b)); }
  button:disabled, textarea:disabled { cursor:default;opacity:.55; }
  .compact { gap:6px; }
  .compact label > span { font-size:10px; }
  .compact textarea { padding:6px 8px;font-size:10px; }
  .compact button { padding:5px 8px;font-size:10px; }
</style>
