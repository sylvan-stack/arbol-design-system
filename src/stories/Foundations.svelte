<script lang="ts">
  import { THEMES } from '../themes';
  import { KINDS } from '../entities';
  import RingsMark from '../components/RingsMark.svelte';
  import EntityReference from '../patterns/EntityReference.svelte';
  import Badge from '../components/Badge.svelte';
  let { section = 'Overview' }: { section?: string } = $props();
</script>

<div class="demo-frame stack">
  <div class="row">
    <RingsMark size={52} />
    <p class="eyebrow">Arbol Design System / {section}</p>
  </div>
  <h1>{section === 'Overview' ? 'Keep the warmth. Make the behavior dependable.' : section}</h1>
  <p class="muted measure">
    A portable design language for Seqoya, Elma, Willo and Oaken. Warm wood themes, readable
    workspaces and shared interaction contracts.
  </p>
  {#if section === 'Overview'}<div class="grid">
      <div class="panel stack">
        <h2>Explore the system</h2>
        <p>Foundations → components → patterns → sections → complete pages.</p>
        <p>
          Use the toolbar to change theme, density and text size. Every example uses fictional local
          data.
        </p>
      </div>
      <div class="panel stack">
        <h2>Restore with evidence</h2>
        <a href="/design-system/README.md" target="_blank" rel="noreferrer"
          >Read the Design System chapter ↗</a
        ><a href="/design-system/reference.html" target="_blank" rel="noreferrer"
          >Open the original interactive reference ↗</a
        ><a href="/design-system/ui-source-snapshot.tar.gz"
          >Download the preserved UI source archive</a
        >
        <p class="small muted">
          Legacy evidence and successor designs are clearly separated. Browser adapters do not
          implement native services.
        </p>
      </div>
    </div>{/if}{#if section === 'Overview' || section === 'Themes'}<div class="swatches">
      {#each THEMES as theme}<button
          onclick={() => (document.documentElement.dataset.theme = theme.id)}
          aria-label={'Preview ' + theme.name}
          ><span style:background={theme.bg}><i style:background={theme.accent}></i></span><strong
            >{theme.name}</strong
          ><small>{theme.light ? 'Light' : 'Dark'}</small></button
        >{/each}
    </div>
    <p class="small muted">
      Historical hue ladder retained. Successor foregrounds and mid-ladder surfaces are adjusted for
      readability.
    </p>{/if}{#if section === 'Typography'}<div class="panel stack">
      <h1>Page heading · 22 px</h1>
      <h2>Section heading · 18 px</h2>
      <h3>Item title · 16 px</h3>
      <p>Body · Hanken Grotesk · 14 px</p>
      <small class="muted">Metadata · 12 px · Readable at every theme</small><code
        >Technical data · Spline Sans Mono · 12 px</code
      >
      <p>
        Fonts are bundled locally under their OFL licenses. Text scale is independent of layout
        density.
      </p>
    </div>{/if}{#if section === 'Spacing and shape'}<div class="panel stack">
      {#each [4, 8, 12, 16, 24, 32] as space}<div class="row">
          <code>{space}px</code><span
            style:width={space * 5 + 'px'}
            style:height="16px"
            style:background="var(--accent)"
          ></span>
        </div>{/each}
      <hr class="rule" />
      <div class="row">
        {#each [5, 9, 16] as radius}<div class="inset" style:border-radius={radius + 'px'}>
            {radius}px radius
          </div>{/each}
      </div>
    </div>{/if}{#if section === 'Semantic states'}<div class="panel row">
      {#each ['Ready', 'Running', 'Waiting', 'Complete', 'Failed', 'Stale', 'Unread', 'Ongoing'] as state}<Badge
          label={state}
          tone={state === 'Failed'
            ? 'failure'
            : state === 'Complete'
              ? 'success'
              : state === 'Waiting'
                ? 'warning'
                : state === 'Running'
                  ? 'working'
                  : 'neutral'}
        />{/each}
    </div>
    <p>
      Entity identity, execution, unread attention and ongoing intent are separate dimensions.
    </p>{/if}{#if section === 'Entity registry'}<div class="grid three">
      {#each Object.entries(KINDS) as [kind, meta]}<div class="panel stack">
          <EntityReference title={meta.label} {kind} /><small class="mono muted"
            >{kind} · {meta.shape} · {meta.hue}°</small
          >
        </div>{/each}
    </div>{/if}{#if section === 'Motion and layers'}<div class="panel stack">
      <p>Fast 120 ms · Ordinary 160 ms · Panel 200 ms</p>
      <p>Base 0 → Sticky 10 → Popover 100 → Modal 200 → Modal child 210 → Toast 300</p>
      <p class="notice">
        Reduced motion disables decorative animation. State must always be conveyed in text.
      </p>
    </div>{/if}
</div>

<style>
  .swatches {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
  }
  .swatches button {
    text-align: left;
    background: var(--panel);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 9px;
    padding: 0;
    overflow: hidden;
  }
  .swatches button > span {
    display: block;
    height: 70px;
    position: relative;
  }
  .swatches i {
    position: absolute;
    width: 20px;
    height: 20px;
    right: 12px;
    top: 24px;
    border-radius: 50%;
  }
  .swatches strong,
  .swatches small {
    display: block;
    padding: 4px 12px;
  }
  .swatches small {
    padding-bottom: 12px;
    color: var(--muted);
  }
  @media (max-width: 800px) {
    .swatches {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
