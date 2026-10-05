<script lang="ts">
  import EntityComposerInput from '../src/chat/EntityComposerInput.svelte'

  let value = $state('')
  let editor: HTMLTextAreaElement | null = $state(null)
</script>

<EntityComposerInput
  {value}
  placeholder="Paste an Entity URI…"
  minPx={120}
  onInput={(text) => { value = text }}
  inputRef={{ get current() { return editor }, set current(next) { editor = next } }}
/>
<output data-composer-value>{value}</output>
