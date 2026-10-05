<script lang="ts">
  import EntityReference from './EntityReference.svelte';
  import Select from '../components/Select.svelte';
  import EntityPicker from './EntityPicker.svelte';
  let relationship = $state('relates to');
  let target = $state('');
</script>

<div class="stack">
  <EntityReference title="Design System" /><Select
    label="Relationship"
    options={['relates to', 'depends on', 'implements', 'is blocked by']}
    bind:value={relationship}
  /><EntityPicker onselect={(ids) => (target = ids[0])} />
  <p class="notice">
    Design System {relationship}
    {target ? 'the selected entity.' : '… choose an entity.'}
  </p>
</div>
