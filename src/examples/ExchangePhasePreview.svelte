<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Button from '../components/Button.svelte';
  import ElmaFrame from '../sections/ElmaFrame.svelte';
  import PinnedMessage from '../sections/PinnedMessage.svelte';
  import ExchangeDetails from '../sections/ExchangeDetails.svelte';
  import '../styles/elma-phase-backgrounds.css';

  const prompt = 'What should we check before adding Markdown export to chat?';
  const systemPrompt = '## Glossary\n\nThe following terms are used in this conversation.\n\n### Export\n\n'
    + 'An Export carries the selected conversation into a file that preserves its order and readable text. '.repeat(13);
  const driver = '/demo/bin/arbol-codex-driver';
  const workingDirectory = '/demo/workspace';
  const phases = [
    {
      id: 'intake', label: 'Intake',
      start: 'Reading the request and gathering the relevant chat context.',
      finish: 'The request is a design review for Markdown export.',
      work: { contextSources: ['Pinned message'], classification: 'Design review' },
      commands: [{ kind: 'subprocess', command: '/demo/bin/forester',
        arguments: ['cues', 'prepare', '--overflow-file', '/demo/exchange/cues.md', '--exchange-json'],
        workingDirectory, input: { message: prompt, earlierMessages: [] } }],
    },
    {
      id: 'planning', label: 'Planning',
      start: 'Choosing which parts of the export to review.',
      finish: 'I’ll look at transcript order, formatting, and private details.',
      work: { candidateChecks: ['Message order', 'Markdown formatting', 'Privacy'], approach: 'Review a sample transcript' },
      commands: [],
    },
    {
      id: 'execution', label: 'Execution',
      start: 'Walking through a sample conversation with tool activity and a final answer.',
      finish: 'Preserve message order and code fences. Let the user choose whether to include tool output.',
      commands: [
        { kind: 'subprocess', command: driver, arguments: ['info'], workingDirectory },
        { kind: 'provider', command: driver,
          arguments: ['run', '--control', '--request', '/demo/exchange/run-1.json'], workingDirectory,
          parameters: { runId: 'example.1', workingDirectory, subscriptionId: 'chatgpt', model: 'gpt-5.6',
            effort: 'medium', input: { role: 'user', text: prompt }, history: [], systemPrompt } },
        { kind: 'tool', command: 'shell', parameters: { command: 'printf "%s" "' + 'literal '.repeat(135) + '"' },
          runId: 'example.1', callId: 'example-tool' },
      ],
      work: { examples: [
        { input: 'Assistant reply with a fenced code block', check: 'Retain code fences and language' },
        { input: 'Conversation containing tool output', check: 'Follow the export privacy setting' },
      ] },
    },
    {
      id: 'finalization', label: 'Finalization',
      start: 'Reviewing the recommendation against the export request.',
      finish: 'The export checklist is ready to share.',
      work: { review: 'Check against the original request', deliverable: 'Export checklist' },
      commands: [],
    },
  ] as const;

  type Phase = (typeof phases)[number];
  type PhaseMessage = { phase: Phase['id']; boundary: 'start' | 'finish'; text: string };
  type MockExchange = { id: string; prompt: string; currentPhase: Phase['id'] | null; messages: PhaseMessage[];
    systemPrompt: string | null };
  type PhaseRun = { startedAt: string; finishedAt?: string; delaySeconds: number; work: Phase['work'];
    commands: Phase['commands']; systemPrompt?: string | null };

  let exchange = $state<MockExchange>({ id: '', prompt, currentPhase: null, messages: [], systemPrompt: null });
  let phaseRuns = $state<Partial<Record<Phase['id'], PhaseRun>>>({});
  let inspection = $state<Record<string, unknown> | null>(null);
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
    const run: PhaseRun = { startedAt: new Date().toISOString(), delaySeconds, work: phase.work, commands: phase.commands,
      ...(phase.id === 'intake' ? { systemPrompt: null } : {}) };
    phaseRuns[phase.id] = run;
    exchange.currentPhase = phase.id;
    appendMessage(phase, 'start');
    timer = setTimeout(() => {
      if (phase.id === 'intake') exchange.systemPrompt = systemPrompt;
      phaseRuns[phase.id] = { ...run, finishedAt: new Date().toISOString(),
        ...(phase.id === 'intake' ? { systemPrompt } : {}) };
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
    exchange = { id: crypto.randomUUID(), prompt, currentPhase: null, messages: [], systemPrompt: null };
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

  onDestroy(() => clearTimeout(timer));
</script>

<ElmaFrame title="Markdown export" trunk="steady" repository="Demo workspace" hasChat turn={1} total={1}
  working={running} fitted>
  <PinnedMessage text={prompt} />

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can scroll the phase transcript.) -->
  <div class="transcript" aria-label="Assistant response" role="region" tabindex="0" bind:this={transcript}>
    {#each transcriptGroups as { phase, messages } (phase.id)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The transcript remains readable and a focused phase also supports Cmd+Enter.) -->
      <div class="phase" data-phase={phase.id} data-exchange-phase={phase.id} role="group" tabindex="0"
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
    <ExchangeDetails data={inspection} onclose={() => { inspection = null; }} />
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
  .transcript:focus-visible, .phase:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

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
