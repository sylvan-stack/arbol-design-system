<script lang="ts">
  import { entityLinkTarget, PermissionDecisionActions } from '@arbol/design-system'
  import type { ComunicadoItem, SpotlightItem } from './attentionApi'

  let {
    actionItems,
    spotlights,
    loading = false,
    error = null,
    removing = {},
    spotlighting = {},
    closing = {},
    deciding = {},
    activeElmaSessionId = '',
    onOpen,
    onRemoveSpotlight,
    onSpotlightComunicado,
    onCloseActionItem,
    onDecidePermission,
  }: {
    actionItems: ComunicadoItem[]
    spotlights: SpotlightItem[]
    loading?: boolean
    error?: string | null
    removing?: Record<string, boolean>
    spotlighting?: Record<string, boolean>
    closing?: Record<string, boolean>
    deciding?: Record<string, boolean>
    activeElmaSessionId?: string
    onOpen: (item: ComunicadoItem | SpotlightItem) => void
    onCloseActionItem: (item: ComunicadoItem) => void
    onRemoveSpotlight: (item: SpotlightItem) => void
    onSpotlightComunicado: (item: ComunicadoItem) => void
    onDecidePermission: (item: ComunicadoItem, action: 'approve' | 'reject' | 'stop', details?: string) => void
  } = $props()

  const spotlightKeys = $derived(new Set(spotlights.map((item) =>
    `${item.target.kind}:${item.target.entity_id}`,
  )))
  const actionSpotlighted = (item: ComunicadoItem) =>
    spotlightKeys.has(`comunicado:${item.comunicado_id}`)
  const isPermission = (item: ComunicadoItem) => item.species === 'permission-request' || item.species === 'tool-approval'
  const isInactivePermission = (item: ComunicadoItem) => isPermission(item)
    && String(item.payload.chat_session_id || '') !== activeElmaSessionId
  const isOneOff = (item: ComunicadoItem) => item.payload.approval_policy === 'every_time'
    || item.payload.canonical_kind === 'bash:protected-lifecycle'
    || String(item.payload.reason || '').startsWith('Changing the Working Directory to another Worktree')
  const permissionMessage = (item: ComunicadoItem) => isPermission(item)
    ? String(item.payload.request_message || item.content)
    : item.content
  const technicalDetails = (item: ComunicadoItem) => String(item.payload.technical_details || item.content || '')
  const time = (timestamp: number) => new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp))
</script>

<aside class="attention-column" aria-label="Action Items and Spotlight">
  {#if actionItems.length > 0}
    <section class="attention-section action-items" aria-labelledby="action-items-heading">
      <header>
        <h2 id="action-items-heading">Action Items</h2>
        <span>{actionItems.length}</span>
      </header>
      <p class="section-purpose">Comunicados that ask you to respond.</p>
      <div class="attention-list">
        {#each actionItems as item (item.comunicado_id)}
          <article class="attention-card action-card" use:entityLinkTarget={{ repo: item.entity.repo, kind: item.entity.kind, entityId: item.entity.entity_id, title: item.title }}>
            <button class="attention-card-main" type="button" onclick={() => onOpen(item)}>
              <span class="attention-kind">{item.species.replace(/-/g, ' ')}</span>
              <b>{item.title}</b>
              {#if permissionMessage(item)}<span class="attention-content">{permissionMessage(item)}</span>{/if}
              {#if isPermission(item) && technicalDetails(item)}
                <span class="technical-details">
                  Technical details
                  <pre>{technicalDetails(item)}</pre>
                </span>
              {/if}
              <time>{time(item.created_at)}</time>
            </button>
            {#if isInactivePermission(item)}
              <div class="permission-actions" aria-label={`Decide ${item.title}`}>
                <PermissionDecisionActions
                  compact
                  busy={!!deciding[item.comunicado_id]}
                  primaryLabel={isOneOff(item) ? 'Approve' : 'Run'}
                  allowStop={isOneOff(item)}
                  onApprove={(details) => onDecidePermission(item, 'approve', details)}
                  onReject={(details) => onDecidePermission(item, 'reject', details)}
                  onStop={() => onDecidePermission(item, 'stop')}
                />
              </div>
            {/if}
            <button
              class="close-action-item"
              type="button"
              disabled={!!closing[item.comunicado_id]}
              title="Close Action Item"
              aria-label={`Close ${item.title}`}
              onclick={(event) => { event.stopPropagation(); onCloseActionItem(item) }}
            >{closing[item.comunicado_id] ? '…' : '×'}</button>
            <button
              class:active={actionSpotlighted(item)}
              class="spotlight-toggle"
              type="button"
              disabled={actionSpotlighted(item) || !!spotlighting[item.comunicado_id]}
              title={actionSpotlighted(item) ? 'This Action Item is Spotlighted' : 'Add this Action Item to Spotlight'}
              onclick={() => onSpotlightComunicado(item)}
            >{actionSpotlighted(item) ? 'Spotlighted' : spotlighting[item.comunicado_id] ? 'Adding…' : 'Spotlight'}</button>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  {#if spotlights.length > 0}
    <section class="attention-section spotlights" aria-labelledby="spotlight-heading">
      <header>
        <h2 id="spotlight-heading">Spotlight</h2>
        <span>{spotlights.length}</span>
      </header>
      <p class="section-purpose">Entities you want to keep in focus.</p>
      <div class="attention-list">
        {#each spotlights as item (`${item.target.kind}:${item.target.entity_id}`)}
          <article class="attention-card spotlight-card" use:entityLinkTarget={{ repo: item.target.repo, kind: item.target.kind, entityId: item.target.entity_id, title: item.title, uri: item.target.uri }}>
            <button class="attention-card-main" type="button" onclick={() => onOpen(item)}>
              <span class="attention-kind">{item.target.kind.replace(/_/g, ' ')}</span>
              <b>{item.title}</b>
              <span class="attention-content">{item.meta}</span>
              {#if item.activity_at}<time>Active {time(item.activity_at)}</time>{/if}
            </button>
            <button
              class="remove-spotlight"
              type="button"
              disabled={!!removing[`${item.target.kind}:${item.target.entity_id}`]}
              title="Remove from Spotlight"
              aria-label={`Remove ${item.title} from Spotlight`}
              onclick={() => onRemoveSpotlight(item)}
            >{removing[`${item.target.kind}:${item.target.entity_id}`] ? '…' : '×'}</button>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  {#if error}<p class="attention-error" role="alert">{error}</p>{/if}
</aside>

<style>
  .attention-column {
    min-width:0;
    min-height:0;
    overflow:auto;
    border-left:1px solid var(--arbol-color-border);
    background:color-mix(in oklch, var(--arbol-color-bg) 93%, var(--arbol-color-surface-2));
    display:flex;
    flex-direction:column;
  }
  .attention-section { padding:var(--arbol-space-4); }
  .attention-section + .attention-section { border-top:1px solid var(--arbol-color-border); }
  .attention-section header { display:flex;align-items:center;gap:var(--arbol-space-2); }
  .attention-section h2 { flex:1;margin:0;font:650 var(--arbol-type-body)/1.2 var(--arbol-font-ui); }
  .attention-section header > span { min-width:22px;padding:2px 6px;border:1px solid var(--arbol-color-border);border-radius:99px;color:var(--arbol-color-text-muted);font:600 10px/1 var(--arbol-font-mono);text-align:center; }
  .action-items h2 { color:var(--arbol-color-warn); }
  .spotlights h2 { color:var(--arbol-color-accent); }
  .section-purpose { margin:5px 0 12px;color:var(--arbol-color-text-muted);font:500 var(--arbol-type-label)/1.35 var(--arbol-font-ui); }
  .attention-list { display:grid;gap:8px; }
  .attention-card { position:relative;display:flex;align-items:flex-start;border:1px solid var(--arbol-color-border);border-left:3px solid var(--arbol-color-accent);border-radius:var(--arbol-radius-m);background:var(--arbol-color-surface);box-shadow:var(--arbol-shadow-1);overflow:hidden; }
  .action-card { border-left-color:var(--arbol-color-warn); }
  .attention-card-main { min-width:0;flex:1;display:grid;gap:4px;padding:10px 104px 10px 11px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer; }
  .attention-card-main:hover b { color:var(--arbol-color-accent); }
  .attention-kind { color:var(--arbol-color-text-muted);font:650 9px/1 var(--arbol-font-mono);letter-spacing:.55px;text-transform:uppercase; }
  .attention-card b { overflow:hidden;text-overflow:ellipsis;font:650 var(--arbol-type-label)/1.3 var(--arbol-font-ui); }
  .attention-content { display:-webkit-box;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--arbol-color-text-muted);font:500 11px/1.35 var(--arbol-font-ui); }
  .technical-details { display:block;color:var(--arbol-color-text-muted);font:500 10px/1.35 var(--arbol-font-ui); }
  .technical-details pre { max-height:120px;margin:5px 0 0;overflow:auto;white-space:pre-wrap;word-break:break-word;font:400 9px/1.4 var(--arbol-font-mono); }
  .attention-card time { color:var(--arbol-color-text-muted);font:500 9px/1.2 var(--arbol-font-mono); }
  .permission-actions { width:100%;display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border-top:1px solid var(--arbol-color-border);background:var(--arbol-color-surface-2); }
  .action-card:has(.permission-actions) { flex-wrap:wrap; }
  .remove-spotlight { position:absolute;right:6px;top:6px;width:24px;height:24px;border:0;border-radius:99px;background:transparent;color:var(--arbol-color-text-muted);font:500 17px/1 var(--arbol-font-ui);cursor:pointer; }
  .remove-spotlight:hover { background:var(--arbol-color-surface-2);color:var(--arbol-color-err); }
  .close-action-item { position:absolute;right:6px;top:6px;width:24px;height:24px;border:0;border-radius:99px;background:transparent;color:var(--arbol-color-text-muted);font:500 17px/1 var(--arbol-font-ui);cursor:pointer; }
  .close-action-item:hover:not(:disabled) { background:var(--arbol-color-surface-2);color:var(--arbol-color-err); }
  .close-action-item:disabled { cursor:default;opacity:.65; }
  .spotlight-toggle { position:absolute;right:34px;top:6px;padding:4px 6px;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text-muted);font:600 9px/1 var(--arbol-font-ui);cursor:pointer; }
  .spotlight-toggle:hover:not(:disabled), .spotlight-toggle.active { color:var(--arbol-color-accent);border-color:var(--arbol-color-accent); }
  .spotlight-toggle:disabled { cursor:default;opacity:.75; }
  .attention-error { margin:auto var(--arbol-space-4) var(--arbol-space-4);padding:8px;border:1px solid color-mix(in oklch,var(--arbol-color-err) 45%,var(--arbol-color-border));border-radius:var(--arbol-radius-s);color:var(--arbol-color-err);font:500 10px/1.35 var(--arbol-font-ui); }
</style>
