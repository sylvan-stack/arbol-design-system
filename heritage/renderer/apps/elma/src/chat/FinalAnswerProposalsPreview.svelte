<script lang="ts">
  import FinalAnswerArtwork, { type FinalAnswerArtwork as ArtworkId } from './FinalAnswerArtwork.svelte'

  type Proposal = { id: ArtworkId; name: string; idea: string; ratio: string }
  let { showContext = true }: { size?: number; showContext?: boolean } = $props()

  const proposals: Proposal[] = [
    { id: 'first-light', name: 'First light', idea: 'A horizon: exploration ends and the answer comes into view.', ratio: 'cinematic' },
    { id: 'clearing', name: 'The clearing', idea: 'Dense work opens into a quiet, readable space.', ratio: 'full bleed' },
    { id: 'confluence', name: 'Confluence', idea: 'Several lines of investigation become one confident result.', ratio: 'panoramic' },
    { id: 'aperture', name: 'Aperture', idea: 'Layers draw back to reveal the focal point.', ratio: 'architectural' },
    { id: 'constellation', name: 'Constellation', idea: 'Separate observations resolve into a meaningful whole.', ratio: 'diagrammatic' },
    { id: 'ribbon', name: 'The exchange', idea: 'A continuous gesture turns from inward work toward the reader.', ratio: 'gestural' },
    { id: 'prism', name: 'Prism', idea: 'One concentrated insight unfolds into a clear explanation.', ratio: 'directional' },
    { id: 'landfall', name: 'Landfall', idea: 'A route through complexity reaches its destination.', ratio: 'topographic' },
  ]
</script>

<main class="preview">
  <header>
    <p class="eyebrow">Final-answer boundary · round two</p>
    <h1>Think beyond the icon</h1>
    <p>Eight text-free, wide-format image directions. These are composed as moments in the page—not logos placed on a line.</p>
  </header>

  <div class="board">
    {#each proposals as proposal, index}
      <article class="card">
        <div class="meta">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div><h2>{proposal.name}</h2><p>{proposal.idea}</p></div>
          <em>{proposal.ratio}</em>
        </div>

        <div class:full={proposal.id === 'clearing'} class="canvas" aria-label={`${proposal.name} final-answer separator proposal`}>
          <FinalAnswerArtwork variant={proposal.id} />
        </div>

        {#if showContext}
          <div class="context">
            <div class="work"><i></i><i></i><i></i><i></i></div>
            <div class="boundary"><FinalAnswerArtwork variant={proposal.id} /></div>
            <div class="answer"><b></b><i></i><i></i><i></i></div>
            <button type="button" aria-label={`Jump to final answer using ${proposal.name} motif`}>
              <span class="button-art"><FinalAnswerArtwork variant={proposal.id} /></span>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg>
            </button>
          </div>
        {/if}
      </article>
    {/each}
  </div>
</main>

<style>
  .preview { box-sizing:border-box;min-height:100vh;padding:clamp(28px,5vw,68px);background:var(--arbol-color-bg);color:var(--arbol-color-text);font-family:var(--arbol-font-ui); }
  header { width:min(100%,1120px);margin:0 auto 42px; } .eyebrow { margin:0 0 10px;color:var(--arbol-color-accent);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase; }
  h1 { margin:0;font:600 clamp(31px,5vw,52px)/1 var(--arbol-font-ui);letter-spacing:-.045em; } header>p:last-child { max-width:670px;margin:16px 0 0;color:var(--arbol-color-text-muted);font-size:14px;line-height:1.6; }
  .board { width:min(100%,1120px);margin:auto;display:grid;gap:22px; }
  .card { overflow:hidden;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l,16px);background:var(--arbol-color-surface);box-shadow:0 14px 42px color-mix(in srgb,#000 6%,transparent); }
  .meta { display:grid;grid-template-columns:34px 1fr auto;gap:13px;align-items:start;padding:20px 22px; }
  .meta>span { display:grid;place-items:center;width:30px;height:30px;border:1px solid color-mix(in srgb,var(--arbol-color-accent) 40%,var(--arbol-color-border));border-radius:50%;color:var(--arbol-color-accent);font-size:10px;font-weight:700; }
  h2 { margin:1px 0 4px;font-size:17px; } .meta p { margin:0;color:var(--arbol-color-text-muted);font-size:12px;line-height:1.5; }.meta em { margin-top:3px;color:var(--arbol-color-text-muted);font-size:9px;font-style:normal;letter-spacing:.1em;text-transform:uppercase; }
  .canvas { height:180px;border-block:1px solid var(--arbol-color-border);background:linear-gradient(180deg,var(--arbol-color-surface-1),var(--arbol-color-surface)); }.canvas.full { margin-inline:-1px; }
  .context { position:relative;display:grid;grid-template-columns:minmax(130px,1fr) minmax(220px,1.4fr) minmax(150px,1fr);align-items:center;gap:16px;min-height:105px;padding:16px 78px 16px 22px;background:var(--arbol-color-surface-1); }
  .work,.answer { display:grid;gap:6px; }.work i,.answer i,.answer b { display:block;height:4px;border-radius:4px;background:var(--arbol-color-border); }.work i:nth-child(1){width:80%}.work i:nth-child(2){width:95%}.work i:nth-child(3){width:61%}.work i:nth-child(4){width:73%}.answer b{width:42%;height:7px;background:color-mix(in srgb,var(--arbol-color-text) 68%,transparent)}.answer i:nth-child(2){width:96%}.answer i:nth-child(3){width:85%}.answer i:nth-child(4){width:58%}
  .boundary { height:76px;opacity:.85; } button { position:absolute;right:20px;display:grid;place-items:center;width:46px;height:46px;padding:0;overflow:hidden;color:var(--arbol-color-accent);border:1px solid color-mix(in srgb,var(--arbol-color-accent) 50%,var(--arbol-color-border));border-radius:50%;background:var(--arbol-color-surface);box-shadow:var(--arbol-shadow-2); }.button-art { width:76px;height:34px; }.button-art :global(svg){overflow:visible} button>svg{position:absolute;right:1px;bottom:1px;width:13px;height:13px;border-radius:50%;background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink)}button path{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  @media(max-width:700px){.meta{grid-template-columns:34px 1fr}.meta em{display:none}.context{grid-template-columns:1fr;padding-right:74px}.work{display:none}.boundary{height:56px}.canvas{height:140px}}
</style>
