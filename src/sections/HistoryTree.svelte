<script lang="ts">
  import Button from '../components/Button.svelte';
  import Badge from '../components/Badge.svelte';
  let selected = $state('Turn 3');
</script>

<div class="panel stack">
  <h2>Conversation history</h2>
  <p class="small muted">Branches retain their original messages and context.</p>
  <div class="tree">
    <Button label="Turn 1 · Preserve the useful design" onclick={() => (selected = 'Turn 1')} />
    <div class="tree">
      <Button label="Turn 2 · Compare collection patterns" onclick={() => (selected = 'Turn 2')} />
      <div class="tree">
        <Button
          label="Turn 3 · Build shared components"
          onclick={() => (selected = 'Turn 3')}
        /><Button
          label="Alternative · Explore a compact layout"
          onclick={() => (selected = 'Alternative branch')}
        />
      </div>
    </div>
  </div>
  <Badge label={'Selected: ' + selected} />
</div>
