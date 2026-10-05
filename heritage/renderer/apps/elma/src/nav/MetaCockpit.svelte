<script lang="ts">
  import { onDestroy } from 'svelte'
  import { Dot, EntityChip, formatEntityUri } from '@arbol/design-system'
  import type { SessionTokenUsage } from '../api'
  import { decayTokenRate, tokenActivityLevel, TokenRateMeter } from './tokenActivity'
  import { COLLAPSED_TAG_LIMIT, cockpitTags, type ChatTag, type ChatTagDefinition } from '../chat/sessionTags'

  let {
    sessionOnGoing = false,
    parentChatSession = null,
    ongoingSaving = false,
    onToggleOnGoing,
    tags,
    definitions,
    usage = null,
    active = false,
    saving = false,
    onToggle,
    onEdit,
    onRemove,
    onAdd,
    onToggleVip,
  }: {
    sessionOnGoing?: boolean
    parentChatSession?: import('../api').ParentChatSession | null
    ongoingSaving?: boolean
    onToggleOnGoing?: () => void
    tags: ChatTag[]
    definitions: ChatTagDefinition[]
    usage?: SessionTokenUsage | null
    active?: boolean
    saving?: boolean
    onToggle: (tag: ChatTag, active: boolean) => void
    onEdit: (tag: ChatTag) => void
    onRemove: (tag: ChatTag) => void
    onAdd: () => void
    onToggleVip: (name: string, vip: boolean) => void
  } = $props()

  let expanded = $state(false)
  const items = $derived(cockpitTags(tags, definitions))
  const visible = $derived(expanded ? items : items.slice(0, COLLAPSED_TAG_LIMIT))
  const hiddenCount = $derived(Math.max(0, items.length - COLLAPSED_TAG_LIMIT))

  function formatTokenCount(value: number): string {
    const count = Math.max(0, Math.trunc(value))
    if (count < 1_000) return String(count)

    const units = count < 1_000_000
      ? { divisor: 1_000, suffix: 'k' }
      : { divisor: 1_000_000, suffix: 'm' }
    const scaled = count / units.divisor
    const fractionDigits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0
    const compact = scaled.toFixed(fractionDigits).replace(/\.0+$|(?<=\.[0-9])0$/, '')
    return `${compact.replace('.', ',')}${units.suffix}`
  }

  const tokensIn = $derived(Number.isFinite(usage?.tokens_in) && (usage?.tokens_in ?? 0) > 0 ? Math.trunc(usage!.tokens_in!) : 0)
  const tokensOut = $derived(Number.isFinite(usage?.tokens_out) && (usage?.tokens_out ?? 0) > 0 ? Math.trunc(usage!.tokens_out!) : 0)
  const hasUsage = $derived(active || tokensIn > 0 || tokensOut > 0)

  function formatTokenRate(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0/s'
    const digits = value < 10 ? 1 : 0
    return `${value.toFixed(digits).replace(/\.0$/, '').replace('.', ',')}/s`
  }

  let inputRate = $state(0)
  let outputRate = $state(0)
  let inputRateAt = $state(0)
  let outputRateAt = $state(0)
  let activityClock = $state(Date.now())
  const inputRateMeter = new TokenRateMeter()
  const outputRateMeter = new TokenRateMeter()

  $effect(() => {
    // Only token totals are reactive inputs. The meters deliberately keep their
    // baselines in plain fields so publishing a rate cannot retrigger this effect
    // and overwrite the observation timestamp with a zero-delta sample.
    const nextIn = tokensIn
    const nextOut = tokensOut
    const now = Date.now()
    const input = inputRateMeter.sample(nextIn, now)
    const output = outputRateMeter.sample(nextOut, now)
    inputRate = input.rate
    inputRateAt = input.measuredAt
    outputRate = output.rate
    outputRateAt = output.measuredAt
    activityClock = now
  })

  const activityTimer = setInterval(() => (activityClock = Date.now()), 250)
  onDestroy(() => clearInterval(activityTimer))

  const liveInputRate = $derived(inputRateAt ? decayTokenRate(inputRate, activityClock - inputRateAt) : 0)
  const liveOutputRate = $derived(outputRateAt ? decayTokenRate(outputRate, activityClock - outputRateAt) : 0)
  const inputActivity = $derived(tokenActivityLevel(liveInputRate, 'input'))
  const outputActivity = $derived(tokenActivityLevel(liveOutputRate, 'output'))
</script>

<section class="cockpit" aria-label="Meta Cockpit">
  <div class="body">
    {#if parentChatSession}
      <div class="parent-chat" aria-label="Parent Chat Session">
        <span>Parent Chat Session</span>
        <EntityChip uri={formatEntityUri({ repo: 'Arbol', kind: 'chat', entityId: parentChatSession.id, title: parentChatSession.title || 'Untitled Chat Session' })} />
      </div>
    {/if}
    {#if onToggleOnGoing}
    <button type="button" onclick={onToggleOnGoing} disabled={ongoingSaving}
      title={sessionOnGoing ? 'Ongoing: on — click or press ⌥0 to clear' : 'Ongoing: off — click or press ⌥0 to mark ongoing'}
      aria-pressed={sessionOnGoing}
      style="all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;
             border-radius:999px;cursor:{ongoingSaving ? 'default' : 'pointer'};opacity:{ongoingSaving ? 0.62 : 1};
             border:1px solid {sessionOnGoing ? 'color-mix(in oklch, var(--arbol-color-accent) 58%, var(--arbol-color-border))' : 'var(--arbol-color-border)'};
             background:{sessionOnGoing ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface-2)'};
             color:{sessionOnGoing ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text-muted)'};
             font:700 var(--arbol-type-label)/1 var(--arbol-font-ui);text-transform:uppercase;letter-spacing:.35px;white-space:nowrap">
      <Dot color={sessionOnGoing ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text-muted)'} pulse={sessionOnGoing} />
      {sessionOnGoing ? 'Ongoing' : 'Not ongoing'}
    </button>
    {/if}
    {#if hasUsage}
      <section class="usage" aria-label="Token usage">
        <dl class="usage-metrics">
          <div class="usage-row total" title="Total tokens">
            <dt aria-label="Total tokens"><span aria-hidden="true">∑</span></dt>
            <dd>{formatTokenCount(tokensIn + tokensOut)}</dd>
          </div>
          <div class="usage-row input" class:flowing={inputActivity > 0} title={`Input tokens · ${formatTokenRate(liveInputRate)} live speed`}>
            <dt aria-label="Input tokens"><span aria-hidden="true">↙</span></dt>
            <dd>
              <span class="activity level-{inputActivity}" aria-label={inputActivity ? `Input flow: level ${inputActivity} of 3` : 'No live input token flow'}>
                {#each Array(inputActivity) as _}<span aria-hidden="true">↓</span>{/each}
              </span>
              <span class="rate">{formatTokenRate(liveInputRate)}</span>
              <span class="token-count">{formatTokenCount(tokensIn)}</span>
            </dd>
          </div>
          <div class="usage-row output" class:flowing={outputActivity > 0} title={`Output tokens · ${formatTokenRate(liveOutputRate)} live speed`}>
            <dt aria-label="Output tokens"><span aria-hidden="true">↗</span></dt>
            <dd>
              <span class="activity level-{outputActivity}" aria-label={outputActivity ? `Output flow: level ${outputActivity} of 3` : 'No live output token flow'}>
                {#each Array(outputActivity) as _}<span aria-hidden="true">↑</span>{/each}
              </span>
              <span class="rate">{formatTokenRate(liveOutputRate)}</span>
              <span class="token-count">{formatTokenCount(tokensOut)}</span>
            </dd>
          </div>
        </dl>
      </section>
    {/if}

    <div class="body-heading">
      <span>Tags</span>
      <button class="add" type="button" onclick={onAdd} disabled={saving}>
        <span aria-hidden="true">＋</span> Add tag
      </button>
    </div>

    <div class="tags">
      {#each visible as item (`${item.tag.name}:${item.active}:${item.tag.value ?? ''}`)}
        <div class:active={item.active} class:vip={item.vip} class="tag">
          <button
            class="tag-main"
            type="button"
            disabled={saving}
            onclick={() => onToggle(item.tag, item.active)}
            aria-pressed={item.active}
            title={item.active ? `Deactivate ${item.tag.name}` : `Activate pinned tag ${item.tag.name}`}
          >
            <span class="status" aria-hidden="true"></span>
            <span class="tag-label">{item.tag.name}{item.tag.value !== undefined ? `=${item.tag.value}` : ''}</span>
          </button>
          {#if item.active}
            <button class="tag-action" type="button" onclick={() => onEdit(item.tag)} title={`Edit ${item.tag.name}`} aria-label={`Edit ${item.tag.name}`}>✎</button>
            <button class="tag-action remove" type="button" onclick={() => onRemove(item.tag)} title={`Remove ${item.tag.name}`} aria-label={`Remove ${item.tag.name}`}>×</button>
          {/if}
          <button
            class:engaged={item.vip}
            class="pin"
            type="button"
            onclick={() => onToggleVip(item.tag.name, !item.vip)}
            title={item.vip ? `Unpin ${item.tag.name}` : `Pin ${item.tag.name} so it is always visible`}
            aria-label={item.vip ? `Unmark ${item.tag.name} as VIP` : `Mark ${item.tag.name} as VIP`}
          >★</button>
        </div>
      {/each}

      {#if !items.length}
        <button class="empty" type="button" onclick={onAdd}>
          <span class="empty-icon" aria-hidden="true">＋</span>
          <span><strong>Add your first tag</strong><small>Organize this chat with metadata</small></span>
        </button>
      {/if}
    </div>

    {#if hiddenCount || expanded}
      <button class="more" type="button" onclick={() => (expanded = !expanded)}>
        {expanded ? 'Show less' : `See ${hiddenCount} more`}
        <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
      </button>
    {/if}
  </div>
</section>

<style>
  .cockpit {
    position: relative;
    margin: var(--arbol-space-2) var(--arbol-space-2) var(--arbol-space-3);
    overflow: hidden;
    border: 1px solid color-mix(in oklch, var(--arbol-color-accent) 34%, var(--arbol-color-border));
    border-radius: calc(var(--arbol-radius-m) + 2px);
    background: var(--arbol-color-surface);
    box-shadow: 0 5px 16px color-mix(in oklch, var(--arbol-color-text) 8%, transparent);
  }
  .cockpit::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--arbol-color-accent);
  }
  .parent-chat { display: grid; gap: 6px; margin-bottom: 10px; min-width: 0; }
  .parent-chat > span { color: var(--arbol-color-text-muted); font: 600 var(--arbol-type-label)/1.2 var(--arbol-font-ui); }
  .body { padding: 8px 9px 9px 12px; }
  .usage {
    margin-bottom: 13px;
    overflow: hidden;
    border: 1px solid color-mix(in oklch, var(--arbol-color-accent) 20%, var(--arbol-color-border));
    border-radius: var(--arbol-radius-m);
    background: color-mix(in oklch, var(--arbol-color-accent-soft) 22%, var(--arbol-color-bg));
  }
  .usage-metrics { margin: 0; }
  .usage-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    min-height: 32px;
    padding: 5px 9px;
    border-top: 1px solid color-mix(in oklch, var(--arbol-color-border) 72%, transparent);
  }
  .usage-row:first-child { border-top: 0; }
  .usage-row.total {
    min-height: 36px;
    background: linear-gradient(100deg, color-mix(in oklch, var(--arbol-color-accent-soft) 72%, transparent), transparent 82%);
  }
  .usage-row dt, .usage-row dd { margin: 0; }
  .usage-row dt {
    color: var(--arbol-color-text-muted);
    font: 700 calc(var(--arbol-type-label) * 1.05)/1 var(--arbol-font-mono);
    text-align: center;
  }
  .usage-row.total dt { color: var(--arbol-color-accent); }
  .usage-row dd {
    min-width: 0;
    color: var(--arbol-color-text);
    font: 700 calc(var(--arbol-type-label) * 1.08)/1 var(--arbol-font-mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .usage-row.total dd {
    color: var(--arbol-color-accent);
    font-size: calc(var(--arbol-type-label) * 1.28);
  }
  .usage-row:not(.total) dd {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
  .rate {
    width: 52px;
    flex: 0 0 52px;
    color: var(--arbol-color-text-muted);
    font-size: calc(var(--arbol-type-label) * .82);
    text-align: right;
    white-space: nowrap;
  }
  .token-count { min-width: 55px; text-align: right; }
  .usage-row.flowing {
    background: linear-gradient(90deg, transparent 20%, color-mix(in oklch, var(--arbol-color-accent-soft) 44%, transparent));
  }
  .activity {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    width: 31px;
    flex: 0 0 31px;
    min-height: 14px;
    color: var(--arbol-color-accent);
    font: 800 10px/.75 var(--arbol-font-mono);
    letter-spacing: -3px;
  }
  .activity.level-2 { color: color-mix(in oklch, var(--arbol-color-accent) 78%, var(--arbol-color-text)); }
  .activity.level-3 {
    color: var(--arbol-color-accent);
    filter: drop-shadow(0 0 3px color-mix(in oklch, var(--arbol-color-accent) 55%, transparent));
    animation: token-pulse 800ms ease-in-out infinite alternate;
  }
  @keyframes token-pulse { to { opacity: .62; transform: translateY(-1px); } }
  @media (prefers-reduced-motion: reduce) { .activity.level-3 { animation: none; } }
  .body-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .body-heading > span { color: var(--arbol-color-text-muted); font: 700 calc(var(--arbol-type-label) * .85)/1 var(--arbol-font-mono); letter-spacing: .65px; text-transform: uppercase; }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 4px 7px;
    border: 0;
    border-radius: var(--arbol-radius-s);
    background: transparent;
    color: var(--arbol-color-accent);
    font: 650 calc(var(--arbol-type-label) * .9)/1 var(--arbol-font-ui);
    cursor: pointer;
  }
  .add:hover { background: var(--arbol-color-accent-soft); }
  .add:disabled { opacity: .5; cursor: default; }
  .add span { font-size: 13px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: 26px;
    border: 1px dashed var(--arbol-color-border);
    border-radius: 999px;
    background: var(--arbol-color-bg);
    color: var(--arbol-color-text-muted);
    opacity: .68;
  }
  .tag.active { border-style: solid; background: var(--arbol-color-surface-2); color: var(--arbol-color-text); opacity: 1; }
  .tag.vip { border-color: color-mix(in oklch, var(--arbol-color-accent) 42%, var(--arbol-color-border)); }
  .tag.vip:not(.active) { background: color-mix(in oklch, var(--arbol-color-accent-soft) 45%, var(--arbol-color-bg)); }
  .tag-main {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 5px 3px 5px 8px;
    cursor: pointer;
    font: 600 calc(var(--arbol-type-label) * .9)/1 var(--arbol-font-mono);
  }
  .status { width: 6px; height: 6px; flex: 0 0 auto; border: 1px solid currentColor; border-radius: 50%; opacity: .55; }
  .active .status { border-color: var(--arbol-color-accent); background: var(--arbol-color-accent); opacity: 1; }
  .tag-label { overflow: hidden; max-width: 140px; text-overflow: ellipsis; white-space: nowrap; }
  .tag-action, .pin {
    all: unset;
    box-sizing: border-box;
    padding: 4px 3px;
    color: var(--arbol-color-text-muted);
    font: 600 10px/1 var(--arbol-font-ui);
    cursor: pointer;
    opacity: .65;
  }
  .tag-action:hover, .pin:hover { color: var(--arbol-color-text); opacity: 1; }
  .tag-action.remove { padding-right: 2px; font-size: 13px; }
  .pin { padding: 5px 7px 5px 3px; color: var(--arbol-color-text-muted); font-size: 10px; }
  .pin.engaged { color: var(--arbol-color-accent); opacity: 1; }
  .empty {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px;
    border: 1px dashed color-mix(in oklch, var(--arbol-color-accent) 38%, var(--arbol-color-border));
    border-radius: var(--arbol-radius-m);
    background: var(--arbol-color-bg);
    color: var(--arbol-color-text);
    text-align: left;
    cursor: pointer;
  }
  .empty:hover { background: var(--arbol-color-accent-soft); }
  .empty-icon { width: 25px; height: 25px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 7px; background: var(--arbol-color-accent-soft); color: var(--arbol-color-accent); font-size: 16px; }
  .empty strong, .empty small { display: block; }
  .empty strong { font: 650 calc(var(--arbol-type-label) * .95)/1.1 var(--arbol-font-ui); }
  .empty small { margin-top: 3px; color: var(--arbol-color-text-muted); font: 450 calc(var(--arbol-type-label) * .82)/1.1 var(--arbol-font-ui); }
  .more {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
    margin-top: 8px;
    padding: 5px;
    border: 0;
    border-radius: var(--arbol-radius-s);
    background: transparent;
    color: var(--arbol-color-text-muted);
    font: 600 calc(var(--arbol-type-label) * .88)/1 var(--arbol-font-ui);
    cursor: pointer;
  }
  .more:hover { background: var(--arbol-color-surface-2); color: var(--arbol-color-text); }
  .more span { color: var(--arbol-color-accent); }
</style>
