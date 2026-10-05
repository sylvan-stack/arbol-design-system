<script lang="ts">
  import EntitySummary from './EntitySummary.svelte';
  import Button from '../components/Button.svelte';
  let {
    title = 'Keep the design language',
    subtitle = 'Arbol · Design system',
    kind = 'artifact',
    status = 'Ready',
    description = 'Themes, interaction contracts and workspace recipes for the next version.',
    onopen,
    onedit,
  }: {
    title?: string;
    subtitle?: string;
    kind?: string;
    status?: string;
    description?: string;
    onopen?: () => void;
    onedit?: () => void;
  } = $props();
</script>

<article class="panel stack">
  <EntitySummary {title} {subtitle} {kind} {status} onclick={onopen} />
  <p class="muted">{description}</p>
  <div class="row">
    <Button label="Open" onclick={onopen} /><Button label="Edit" tone="ghost" onclick={onedit} />
  </div>
</article>
