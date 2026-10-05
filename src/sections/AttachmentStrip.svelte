<script lang="ts">
  import EntityReference from '../patterns/EntityReference.svelte';
  import Button from '../components/Button.svelte';
  let attached = $state(true);
</script>

<div class="panel stack">
  <h3>Attached context</h3>
  {#if attached}<div class="row">
      <EntityReference title="Design System" /><EntityReference
        title="Chat continuity"
        kind="living_topic"
      /><span class="pill">▧ layout-reference.png · 240 KB</span><Button
        label="Remove attachments"
        tone="ghost"
        onclick={() => (attached = false)}
      />
    </div>{:else}<p class="muted">No attached context.</p>{/if}
  <p class="small muted">Images: PNG, JPEG, WebP or GIF · Up to 4 images, 8 MiB each.</p>
</div>
