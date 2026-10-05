<script lang="ts">
  import { Button, Modal } from '@arbol/design-system'
  import type { EmailIgnorePreview } from './mailApi'

  let { preview, busy = false, onConfirm, onClose }:
    { preview: EmailIgnorePreview; busy?: boolean; onConfirm: () => void; onClose: () => void } = $props()

  const label = $derived(preview.kind === 'domain' ? 'domain' : preview.kind === 'sender' ? 'sender' : 'string')
  const scope = $derived(
    preview.kind === 'domain' && preview.include_subdomains
      ? `${preview.canonical_value} and all its subdomains`
      : preview.display_value,
  )
</script>

<Modal
  title={`Ignore ${label}?`}
  subtitle={preview.kind === 'body_substring' ? undefined : preview.display_value}
  onClose={onClose}
  dismissable={!busy}
  width={preview.kind === 'body_substring' ? 680 : 520}
>
  {#snippet children()}
    <div class="mail-ignore-confirm">
      {#if preview.kind === 'body_substring'}
        <p>Arbol will ignore emails whose body contains this text:</p>
        <pre class="mail-ignore-value">{scope}</pre>
      {:else}
        <p>Arbol will ignore <code>{scope}</code>.</p>
      {/if}
      <p><b>{preview.affected_count}</b> currently retained email{preview.affected_count === 1 ? '' : 's'} will be removed. Future matching emails will not be displayed or processed.</p>
      <p class="warning">Removing this rule later does not restore purged content. Actions already triggered outside Arbol cannot be undone.</p>
    </div>
  {/snippet}
  {#snippet footer()}
    <Button onclick={onClose} disabled={busy}>{#snippet children()}Cancel{/snippet}</Button>
    <Button kind="primary" onclick={onConfirm} disabled={busy}>{#snippet children()}{busy ? 'Ignoring…' : `Ignore ${label}`}{/snippet}</Button>
  {/snippet}
</Modal>
