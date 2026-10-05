<script lang="ts">
  import Tabs from '../components/Tabs.svelte';
  import Button from '../components/Button.svelte';
  import Checkbox from '../components/Checkbox.svelte';
  let mode = $state('Diff');
  let whitespace = $state(false);
  let file = $state('Collection.svelte');
  let feedback = $state('');
  const files = ['Collection.svelte', 'EntityEditor.svelte', 'tokens.css'];
</script>

<div class="stack">
  <div class="row spread">
    <Tabs label="Code view" items={['Before', 'Diff', 'After']} bind:value={mode} /><Checkbox
      label="Hide whitespace changes"
      bind:checked={whitespace}
    />
  </div>
  <div class="review">
    <aside class="panel stack">
      <p class="eyebrow">3 changed files</p>
      {#each files as item}<button
          class="file"
          class:active={file === item}
          onclick={() => (file = item)}>{item}<span class="success">+12</span></button
        >{/each}
    </aside>
    <div class="panel stack">
      <div class="row spread">
        <h3>{file}</h3>
        <span class="small muted">arbol-design-system · codex/shared-editor</span>
      </div>
      <pre class="diff"><code
          >{mode === 'Before'
            ? `  function closeEditor() {
    onclose();
  }`
            : mode === 'After'
              ? `  function closeEditor() {
    if (dirty) requestDiscard();
    else onclose();
  }`
              : `  function closeEditor() {
−   onclose();
+   if (dirty) requestDiscard();
+   else onclose();
  }`}</code
        ></pre>
      <div class="row">
        <Button
          label="Ask about this change"
          onclick={() => (feedback = 'Selected ' + file + ' as context for a new question')}
        /><Button label="Mark reviewed" onclick={() => (feedback = file + ' marked reviewed')} />
      </div>
      <p role="status" class="small muted">{feedback || 'Select a file to inspect its change.'}</p>
    </div>
  </div>
</div>

<style>
  .review {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 16px;
  }
  .file {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    background: transparent;
    border: 0;
    color: var(--text);
    padding: 8px;
    text-align: left;
  }
  .active {
    background: var(--selected);
  }
  .diff {
    background: var(--canvas);
    padding: 20px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border-left: 3px solid var(--success);
    line-height: 2;
  }
  @media (max-width: 1000px) {
    .review {
      grid-template-columns: 1fr;
    }
  }
</style>
