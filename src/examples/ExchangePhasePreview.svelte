<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Button from '../components/Button.svelte';
  import ElmaFrame from '../sections/ElmaFrame.svelte';
  import PinnedMessage from '../sections/PinnedMessage.svelte';

  const prompt = 'What should we check before adding Markdown export to chat?';
  const phases = [
    {
      id: 'intake', label: 'Intake', color: '#cba15e',
      start: 'Reading the request and gathering the relevant chat context.',
      finish: 'The request is a design review for Markdown export.',
      work: { contextSources: ['Pinned message'], classification: 'Design review' },
    },
    {
      id: 'planning', label: 'Planning', color: '#9b93db',
      start: 'Choosing which parts of the export to review.',
      finish: 'I’ll look at transcript order, formatting, and private details.',
      work: { candidateChecks: ['Message order', 'Markdown formatting', 'Privacy'], approach: 'Review a sample transcript' },
    },
    {
      id: 'execution', label: 'Execution', color: '#75b5d8',
      start: 'Walking through a sample conversation with tool activity and a final answer.',
      finish: 'Preserve message order and code fences. Let the user choose whether to include tool output.',
      work: { examples: [
        { input: 'Assistant reply with a fenced code block', check: 'Retain code fences and language' },
        { input: 'Conversation containing tool output', check: 'Follow the export privacy setting' },
      ] },
    },
    {
      id: 'finalization', label: 'Finalization', color: '#82be9c',
      start: 'Reviewing the recommendation against the export request.',
      finish: 'The export checklist is ready to share.',
      work: { review: 'Check against the original request', deliverable: 'Export checklist' },
    },
  ] as const;

  type Phase = (typeof phases)[number];
  type PhaseMessage = { phase: Phase['id']; boundary: 'start' | 'finish'; text: string };
  type MockExchange = { id: string; prompt: string; currentPhase: Phase['id'] | null; messages: PhaseMessage[] };
  type PhaseRun = { startedAt: string; finishedAt?: string; delaySeconds: number; work: Phase['work'] };
  type JsonObject = { [key: string]: JsonValue };
  type JsonValue = null | boolean | number | string | JsonObject | readonly JsonValue[];

  let exchange = $state<MockExchange>({ id: '', prompt, currentPhase: null, messages: [] });
  let phaseRuns = $state<Partial<Record<Phase['id'], PhaseRun>>>({});
  let inspection = $state<JsonObject | null>(null);
  let dialog = $state<HTMLDialogElement>();
  let transcript = $state<HTMLDivElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const running = $derived(exchange.currentPhase !== null);
  const transcriptGroups = $derived(phases
    .map((phase) => ({ phase, messages: exchange.messages.filter((message) => message.phase === phase.id) }))
    .filter((group) => group.messages.length));

  function appendMessage(phase: Phase, boundary: PhaseMessage['boundary']) {
    const area = transcript;
    const following = area && area.scrollHeight - area.scrollTop - area.clientHeight <= 20;
    exchange.messages.push({ phase: phase.id, boundary, text: phase[boundary] });
    if (following) void tick().then(() => { area.scrollTop = area.scrollHeight; });
  }

  function startPhase(index: number) {
    const phase = phases[index];
    const delaySeconds = 5 + Math.floor(Math.random() * 16);
    const run = { startedAt: new Date().toISOString(), delaySeconds, work: phase.work };
    phaseRuns[phase.id] = run;
    exchange.currentPhase = phase.id;
    appendMessage(phase, 'start');
    timer = setTimeout(() => {
      phaseRuns[phase.id] = { ...run, finishedAt: new Date().toISOString() };
      appendMessage(phase, 'finish');
      if (index + 1 < phases.length) {
        startPhase(index + 1);
      } else {
        exchange.currentPhase = null;
        timer = undefined;
      }
    }, delaySeconds * 1000);
  }

  function replay() {
    if (exchange.currentPhase) return;
    exchange = { id: crypto.randomUUID(), prompt, currentPhase: null, messages: [] };
    phaseRuns = {};
    if (transcript) transcript.scrollTop = 0;
    startPhase(0);
  }

  function inspect(phase: Phase, target: HTMLElement) {
    const privateData = phaseRuns[phase.id];
    if (!privateData) return;
    target.focus({ preventScroll: true });
    inspection = {
      publicExchange: { ...$state.snapshot(exchange), status: running ? 'running' : 'complete' },
      privatePhase: { phase: phase.label, status: privateData.finishedAt ? 'finished' : 'running', ...$state.snapshot(privateData) },
    };
  }

  $effect(() => { dialog?.showModal(); });
  onDestroy(() => clearTimeout(timer));
</script>

{#snippet jsonKey(name: string | number)}
  <span class="json-key">{JSON.stringify(name)}</span>{': '}
{/snippet}

{#snippet jsonNode(name: string | number, value: JsonValue, depth: number)}
  {#if value !== null && typeof value === 'object'}
    {@const entries = Object.entries(value) as [string, JsonValue][]}
    {@const array = Array.isArray(value)}
    {@const opening = array ? '[' : '{'}
    {@const closing = array ? ']' : '}'}
    {#if entries.length}
      <details class="json-branch" open={depth === 0}>
        <summary>
          {@render jsonKey(name)}{opening}<span class="json-fold">…{closing}
            <span class="json-count">({entries.length})</span>
          </span>
        </summary>
        <div class="json-children">
          {#each entries as [key, child] (key)}
            {@render jsonNode(array ? Number(key) : key, child, depth + 1)}
          {/each}
        </div>
        <div>{closing}</div>
      </details>
    {:else}
      <div>{@render jsonKey(name)}{opening}{closing}</div>
    {/if}
  {:else}
    <div>{@render jsonKey(name)}{JSON.stringify(value)}</div>
  {/if}
{/snippet}

<ElmaFrame title="Markdown export" trunk="steady" repository="Demo workspace" hasChat turn={1} total={1}
  working={running} fitted>
  <PinnedMessage text={prompt} />

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can scroll the phase transcript.) -->
  <div class="transcript" aria-label="Assistant response" role="region" tabindex="0" bind:this={transcript}>
    {#each transcriptGroups as { phase, messages } (phase.id)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The transcript remains readable and a focused phase also supports Cmd+Enter.) -->
      <div class="phase" data-phase={phase.id} style:--phase-color={phase.color} role="group" tabindex="0"
        aria-label={phase.label + ' phase'} aria-keyshortcuts="Meta+Enter"
        onclick={(event) => {
          if (!event.metaKey) return;
          event.preventDefault();
          inspect(phase, event.currentTarget);
        }}
        onkeydown={(event) => {
          if (!event.metaKey || event.key !== 'Enter') return;
          event.preventDefault();
          inspect(phase, event.currentTarget);
        }}>
        <div class="phase-text">
          {#each messages as message (message.boundary)}
            <p>{message.text}</p>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="preview-action">
    <Button label={running ? 'Responding…' : exchange.messages.length ? 'Replay' : 'Run mock Exchange'}
      disabled={running} onclick={replay} />
  </div>

  {#if inspection}
    <dialog class="inspector" aria-label="Exchange phase data" bind:this={dialog}
      onclose={() => { inspection = null; }}>
      <button type="button" class="inspector-close" aria-label="Close inspector" onclick={() => dialog?.close()}>×</button>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Long data stays keyboard scrollable.) -->
      <div class="json-data" tabindex="0" role="region" aria-label="Exchange and phase JSON">
        {#each Object.entries(inspection) as [key, value] (key)}
          {@render jsonNode(key, value, 0)}
        {/each}
      </div>
    </dialog>
  {/if}
</ElmaFrame>

<style>
  .preview-action {
    display: flex;
    justify-content: flex-end;
    padding: 8px 16px;
    border-top: 1px solid var(--border);
  }

  .transcript { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding-block: 12px 24px; }
  .transcript:focus-visible, .phase:focus-visible, .json-data:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .phase { background: color-mix(in srgb, var(--phase-color) 6%, var(--canvas)); }

  .phase-text {
    max-width: var(--elma-reading-width, 720px);
    margin: 0 auto;
    padding: 10px 24px;
    font: calc(13.5px * var(--elma-content-scale, var(--font-scale)))/1.6 var(--font-ui);
    overflow-wrap: anywhere;
  }

  .phase-text p { margin: 0; }
  .phase-text p + p { margin-top: 8px; }

  .inspector {
    width: min(560px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    margin: auto;
    padding: 0;
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
  }

  .inspector::backdrop { background: #08060555; }
  .inspector-close {
    position: absolute;
    inset-block-start: 4px;
    inset-inline-end: 4px;
    width: 26px;
    height: 26px;
    padding: 0;
    background: var(--panel);
    color: var(--muted);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
  }
  .inspector-close:hover { border-color: var(--border); color: var(--text); }
  .json-data {
    max-height: min(70dvh, calc(100dvh - 26px));
    padding: 7px 32px 7px 9px;
    overflow: auto;
    overflow-wrap: anywhere;
    font: calc(12px * var(--font-scale))/1.55 var(--font-mono);
  }
  .json-branch summary { cursor: pointer; }
  .json-children { margin-inline-start: 5px; padding-inline-start: 10px; border-inline-start: 1px solid var(--border); }
  .json-branch[open] > summary > .json-fold { display: none; }
  .json-key { color: var(--link); }
  .json-count { color: var(--muted); font-size: 0.9em; }

  @media (max-width: 600px) { .phase-text { padding-inline: 12px; } }
</style>
