<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '../components/Button.svelte';
  import Tabs from '../components/Tabs.svelte';
  import Badge from '../components/Badge.svelte';
  import EntityEditor from '../patterns/EntityEditor.svelte';
  let {
    empty = false,
    compact = false,
    initialView = 'Timeline',
  }: { empty?: boolean; compact?: boolean; initialView?: string } = $props();
  let view = $state(untrack(() => initialView));
  let zoom = $state(100);
  let adding = $state(false);
  let selected = $state('');
  let lanes = $state(
    untrack(() =>
      empty
        ? []
        : [
            { title: 'Design system', kind: 'Estimated', time: '16:00', height: 180 },
            { title: 'Chat continuity', kind: 'Due', time: '14:00', height: 120 },
            { title: 'Review', kind: 'Deadline', time: '17:00', height: 85 },
          ],
    ),
  );
</script>

<section class="stack">
  <div class="row spread">
    <Tabs label="Planning view" items={['Timeline', 'Agenda']} bind:value={view} />
    <div class="row">
      <Button label="−" title="Zoom out" disabled={zoom <= 50} onclick={() => (zoom -= 25)} /><span
        class="mono">{zoom}%</span
      ><Button
        label="+"
        title="Zoom in"
        disabled={zoom >= 200}
        onclick={() => (zoom += 25)}
      /><Button
        label="Today"
        onclick={() => {
          zoom = 100;
          selected = 'Today · 5 October 2026';
        }}
      /><Button label="New swimlane" tone="primary" onclick={() => (adding = true)} />
    </div>
  </div>
  <div class="row spread small muted">
    <span>Future ↑ · Monday, 5 October 2026</span><span
      >Working hours 09:00–18:00 · Europe/Madrid</span
    >
  </div>
  {#if view === 'Agenda'}<div class="panel stack">
      {#each [...lanes].sort((a, b) => a.time.localeCompare(b.time)) as lane}<div
          class="row spread"
        >
          <strong>{lane.time} · {lane.title}</strong><Badge label={lane.kind} /><Button
            label="Open lane"
            onclick={() => (selected = lane.title)}
          />
        </div>{:else}<p>No planned work. Create a swimlane to get started.</p>{/each}
    </div>{:else}<div class="board-scroll">
      <div class="timeline" style:height={((compact ? 300 : 440) * zoom) / 100 + 'px'}>
        <div class="axis">
          <span>18:00</span><span>15:00</span><span>12:00</span><span>09:00</span>
        </div>
        <div class="lanes">
          {#each lanes as lane}<div class="lane">
              <button class="lane-title" onclick={() => (selected = lane.title)}
                >{lane.title}</button
              >
              <div class="spine" style:height={(lane.height * zoom) / 100 + 'px'}></div>
              <button
                class="wall"
                style:top={((18 - Number(lane.time.split(':')[0])) / 9) * 80 + 10 + '%'}
                onclick={() => (selected = lane.title + ' · ' + lane.kind + ' ' + lane.time)}
                >{lane.kind === 'Estimated' ? '≈' : lane.kind === 'Due' ? '⚑' : '!'}
                {lane.kind}
                {lane.time}</button
              ><span class="lane-state small"
                >{lane.title === 'Review' ? 'Planned' : 'Running'}</span
              >
            </div>{:else}<div class="empty">
              <h3>Your planning space</h3>
              <p>Create a swimlane for related work.</p>
            </div>{/each}
        </div>
        <div class="now"><span>NOW 13:30</span></div>
      </div>
    </div>{/if}{#if selected}<div class="notice" role="status">{selected}</div>{/if}
</section>
{#if adding}<EntityEditor
    entity="swimlane"
    fields={[{ key: 'title', label: 'Name', required: true }]}
    onsave={(v) =>
      (lanes = [...lanes, { title: v.title, kind: 'Estimated', time: '16:00', height: 80 }])}
    onclose={() => (adding = false)}
  />{/if}

<style>
  .timeline {
    position: relative;
    min-width: 640px;
    padding: 0 16px 0 64px;
    background: repeating-linear-gradient(
      to top,
      transparent 0,
      transparent calc(33.33% - 1px),
      var(--border) 33.33%
    );
  }
  .axis {
    position: absolute;
    inset: 10px auto 10px 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: var(--muted);
    font: 12px var(--font-mono);
  }
  .lanes {
    display: flex;
    gap: 12px;
    height: 100%;
  }
  .lane {
    width: 180px;
    flex: 1;
    min-width: 140px;
    position: relative;
    border-inline: 1px solid var(--border);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .lane-title {
    position: relative;
    z-index: 2;
    width: 100%;
    padding: 10px;
    background: var(--panel);
    color: var(--text);
    border: 0;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
  }
  .spine {
    position: absolute;
    bottom: 24px;
    left: 50%;
    width: 10px;
    border-radius: 8px;
    background: var(--accent);
  }
  .wall {
    position: absolute;
    left: 5%;
    width: 90%;
    background: var(--panel);
    color: var(--warning);
    border: 0;
    border-top: 2px solid var(--warning);
    text-align: left;
    padding: 4px;
    font: 11px var(--font-mono);
  }
  .lane-state {
    position: absolute;
    bottom: 4px;
    left: 8px;
    color: var(--muted);
  }
  .now {
    pointer-events: none;
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    border-top: 2px solid var(--accent);
  }
  .now span {
    background: var(--canvas);
    color: var(--text);
    font: 10px var(--font-mono);
    padding: 4px;
  }
</style>
