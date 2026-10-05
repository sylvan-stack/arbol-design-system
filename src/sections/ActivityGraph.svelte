<script lang="ts">
  let { label = 'Activity across this response' }: { label?: string } = $props();
  const bars = [12, 24, 42, 36, 70, 88, 54, 32, 18, 45, 62, 80, 96, 65, 38, 22, 12, 32, 56, 26];
</script>

<figure class="panel stack">
  <figcaption>
    <h3>{label}</h3>
    <p class="small muted">Tool activity and generated output · Sample intervals</p>
  </figcaption>
  <div
    class="bars"
    role="img"
    aria-label="Activity rises to a peak near the middle, then declines."
  >
    {#each bars as bar}<span style:height={bar + '%'}></span>{/each}
  </div>
  <div class="row spread mono muted"><span>11:30</span><span>11:42</span></div>
</figure>

<style>
  figure {
    margin: 0;
  }
  .bars {
    height: 120px;
    display: flex;
    align-items: flex-end;
    gap: 6px;
    border-bottom: 1px solid var(--border);
  }
  .bars span {
    flex: 1;
    background: var(--accent);
    border-radius: 3px 3px 0 0;
  }
</style>
