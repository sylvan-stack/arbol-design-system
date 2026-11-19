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

  let exchange = $state<MockExchange>({ id: '', prompt, currentPhase: null, messages: [] });
  let phaseRuns = $state<Partial<Record<Phase['id'], PhaseRun>>>({});
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

  onDestroy(() => clearTimeout(timer));
</script>

<ElmaFrame title="Markdown export" trunk="steady" repository="Demo workspace" hasChat turn={1} total={1}
  working={running} fitted>
  <PinnedMessage text={prompt} />

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can scroll the phase transcript.) -->
  <div class="transcript" aria-label="Assistant response" role="region" tabindex="0" bind:this={transcript}>
    {#each transcriptGroups as { phase, messages } (phase.id)}
      <div class="phase" data-phase={phase.id} style:--phase-color={phase.color}>
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
</ElmaFrame>

<style>
  .preview-action {
    display: flex;
    justify-content: flex-end;
    padding: 8px 16px;
    border-top: 1px solid var(--border);
  }

  .transcript { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding-block: 12px 24px; }
  .transcript:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
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
  @media (max-width: 600px) { .phase-text { padding-inline: 12px; } }
</style>
