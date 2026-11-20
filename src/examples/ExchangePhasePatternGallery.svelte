<script lang="ts">
  import PinnedMessage from '../sections/PinnedMessage.svelte';
  import { phaseLabel, phaseOrder } from '../sections/ExchangeDetails.svelte';
  import { phaseBackground, phaseColor, phasePatterns } from './elma-phase-patterns';

  let selected = $state(0);
  const active = $derived(phasePatterns[selected]);
</script>

<main class="gallery">
  <header class="gallery-header">
    <div>
      <h1>Phase Backgrounds</h1>
      <p>Compare {phasePatterns.length} options for Elma Chat.</p>
    </div>
  </header>

  <div class="comparison">
    <section class="options" aria-label="Pattern options">
      <ul class="legend" aria-label="Swatch order">
        {#each phaseOrder as phase}
          <li>
            <span class="legend-dot" style:background={phaseColor[phase]}></span>
            {phaseLabel(phase)}
          </li>
        {/each}
      </ul>

      <div class="choices">
        {#each phasePatterns as pattern, index (pattern.name)}
          <button type="button" class="choice" aria-pressed={selected === index}
            onclick={() => { selected = index; }}>
            <span class="choice-name">{pattern.name}</span>
            <span class="swatches" aria-hidden="true">
              {#each phaseOrder as phase}
                <span class="phase-surface" style:--phase-color={phaseColor[phase]}
                  style:background={phaseBackground(pattern, phase)}></span>
              {/each}
            </span>
          </button>
        {/each}
      </div>
    </section>

    <section class="preview" aria-label="Transcript preview">
      <h2>{active.name}</h2>
      <div class="transcript">
        <PinnedMessage text="What should we check before adding Markdown export to chat?" />

        {#each phaseOrder as phase}
          <div class="phase-surface transcript-phase" style:--phase-color={phaseColor[phase]}
            style:background={phaseBackground(active, phase)}>
            <div class="phase-label">{phaseLabel(phase)}</div>
            {#if phase === 'intake'}
              <p class="update">Glossary terms found: Exchange Update, Cue Card</p>
              <p class="update">Operational artifacts included: Elma design contract</p>
            {:else if phase === 'planning'}
              <p class="update">Review message order, Markdown formatting, and export privacy.</p>
            {:else if phase === 'execution'}
              <p class="update">Inference started at 10:24:11</p>
              <p class="answer">Preserve message order and fenced code blocks. Let users choose whether to
                include tool output, and show them what will be in the file before they export.</p>
            {:else}
              <p class="update">Inference ended at 10:24:19</p>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  </div>
</main>

<style>
  .gallery {
    min-height: 100dvh;
    padding: clamp(16px, 4vw, 54px);
    background: var(--canvas);
    color: var(--text);
    font: calc(13.5px * var(--font-scale, 1)) / 1.6 var(--font-ui);
  }

  .gallery-header,
  .comparison {
    max-width: 1280px;
    margin-inline: auto;
  }

  .gallery-header {
    margin-bottom: 22px;
  }

  h1, h2, p { margin: 0; }
  h1 { font-size: 1.75em; font-weight: 620; line-height: 1.2; }
  h2 { font-size: 1em; font-weight: 620; padding: 11px 15px; }
  .gallery-header p { margin-top: 4px; color: var(--muted); }

  .comparison {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: 20px 24px;
    align-items: start;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
    color: var(--muted);
    font-size: .9em;
  }

  .legend li { display: flex; align-items: center; gap: 5px; }
  .legend-dot { width: 7px; height: 7px; border-radius: 50%; }

  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
    gap: 9px;
  }

  .choice {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 7px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--panel);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .choice:hover, .choice[aria-pressed='true'] { border-color: var(--focus); }
  .choice[aria-pressed='true'] { box-shadow: inset 0 0 0 1px var(--focus); }
  .choice:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .choice-name { padding-inline: 2px; font-weight: 550; }
  .swatches {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    width: 100%;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--border);
  }

  .swatches > span { height: 45px; }
  .phase-surface {
    --pattern-ink: color-mix(in srgb, var(--phase-color) 22%, transparent);
    --pattern-soft: color-mix(in srgb, var(--pattern-ink) 54%, transparent);
  }

  .preview {
    position: sticky;
    top: 16px;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--panel);
  }

  .transcript { background: var(--canvas); }
  .transcript-phase { padding: 11px 15px; }
  .phase-label, .update { color: var(--muted); font-size: .86em; }
  .phase-label { font-weight: 620; margin-bottom: 2px; }
  .answer { margin-top: 6px; }

  @media (max-width: 720px) {
    .comparison { grid-template-columns: minmax(0, 1fr); }
    .preview { position: static; grid-row: 1; }
  }
</style>
