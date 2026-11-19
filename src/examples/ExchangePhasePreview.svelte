<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Button from '../components/Button.svelte';
  import ElmaFrame from '../sections/ElmaFrame.svelte';
  import PinnedMessage from '../sections/PinnedMessage.svelte';

  const phases = [
    {
      id: 'intake', label: 'Intake', color: '#cba15e',
      start: 'Reading the request and gathering the relevant chat context.',
      finish: 'The request is a design review for Markdown export.',
    },
    {
      id: 'planning', label: 'Planning', color: '#9b93db',
      start: 'Choosing which parts of the export to review.',
      finish: 'I’ll look at transcript order, formatting, and private details.',
    },
    {
      id: 'execution', label: 'Execution', color: '#75b5d8',
      start: 'Walking through a sample conversation with tool activity and a final answer.',
      finish: 'Preserve message order and code fences. Let the user choose whether to include tool output.',
    },
    {
      id: 'finalization', label: 'Finalization', color: '#82be9c',
      start: 'Reviewing the recommendation against the export request.',
      finish: 'The export checklist is ready to share.',
    },
  ] as const;

  type Phase = (typeof phases)[number];
  type PhaseMessage = { phase: Phase['id']; boundary: 'start' | 'finish'; text: string };
  type MockExchange = { currentPhase: Phase['id'] | null; messages: PhaseMessage[] };

  let exchange = $state<MockExchange>({ currentPhase: null, messages: [] });
  let transcript = $state<HTMLDivElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const activePhase = $derived(phases.find((phase) => phase.id === exchange.currentPhase));
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
    exchange.currentPhase = phase.id;
    appendMessage(phase, 'start');
    const seconds = 5 + Math.floor(Math.random() * 16);
    timer = setTimeout(() => {
      appendMessage(phase, 'finish');
      if (index + 1 < phases.length) {
        startPhase(index + 1);
      } else {
        exchange.currentPhase = null;
        timer = undefined;
      }
    }, seconds * 1000);
  }

  function replay() {
    if (exchange.currentPhase) return;
    exchange.messages = [];
    if (transcript) transcript.scrollTop = 0;
    startPhase(0);
  }

  onDestroy(() => clearTimeout(timer));
</script>

<ElmaFrame title="Exchange phase preview" trunk="steady" repository="Demo workspace" hasChat turn={1} total={1}
  working={!!activePhase} fitted>
  <PinnedMessage text="What should we check before adding Markdown export to chat?" />
  <div class="demo-bar">
    <p class="status" role="status">
      {#if activePhase}
        <span class="status-dot" aria-hidden="true" style:--phase-color={activePhase.color}></span>
        Current phase · <strong>{activePhase.label}</strong>
      {:else if exchange.messages.length}
        Exchange complete
      {:else}
        Mock Exchange · 5–20 seconds per phase
      {/if}
    </p>
    <Button label={exchange.messages.length && !activePhase ? 'Replay' : 'Run mock Exchange'}
      tone="primary" disabled={!!activePhase} onclick={replay} />
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can scroll the phase transcript.) -->
  <div class="transcript" aria-label="Exchange phase transcript" role="region" tabindex="0" bind:this={transcript}>
    <div class="groups">
      {#each transcriptGroups as { phase, messages } (phase.id)}
        <section class="phase" aria-label={phase.label} style:--phase-color={phase.color}>
          <h2>{phase.label}</h2>
          {#each messages as message (message.boundary)}
            <p><span>{message.boundary === 'start' ? 'Started' : 'Finished'}</span>{message.text}</p>
          {/each}
        </section>
      {/each}
    </div>
  </div>
</ElmaFrame>

<style>
  .demo-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 10px 16px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }

  .status { display: flex; align-items: center; gap: 6px; margin: 0; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--phase-color); }
  .transcript { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .transcript:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  .groups { max-width: var(--elma-reading-width, 720px); margin: 0 auto; padding: 16px 24px 24px; }
  .phase {
    margin-bottom: 10px;
    padding: 10px 14px;
    border-inline-start: 2px solid color-mix(in srgb, var(--phase-color) 65%, var(--border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--phase-color) 12%, var(--canvas));
    overflow-wrap: anywhere;
  }

  .phase h2 { margin: 0 0 4px; font: 650 1em/1.5 var(--font-ui); }
  .phase p { margin: 3px 0; }
  .phase p span { margin-inline-end: 8px; color: var(--muted); font-size: 0.82em; }
  @media (max-width: 600px) { .groups { padding-inline: 12px; } }
</style>
