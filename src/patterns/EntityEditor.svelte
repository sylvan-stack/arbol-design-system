<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import Button from '../components/Button.svelte';
  import AsyncFeedback from '../components/AsyncFeedback.svelte';
  import type { FieldSpec } from '../types';
  let {
    entity = 'work item',
    mode = 'create',
    fields = [
      { key: 'title', label: 'Title', required: true },
      {
        key: 'description',
        label: 'Description',
        type: 'textarea',
        hint: 'Optional context for this item.',
      },
    ],
    initial = {},
    outcome = 'success',
    onsave = () => {},
    onclose = () => {},
  }: {
    entity?: string;
    mode?: string;
    fields?: FieldSpec[];
    initial?: Record<string, string>;
    outcome?: string;
    onsave?: (values: Record<string, string>) => void;
    onclose?: () => void;
  } = $props();
  let values = $state<Record<string, string>>(untrack(() => ({ ...initial })));
  let errors = $state<Record<string, string>>({});
  let status = $state('');
  let discarding = $state(false);
  let form: HTMLFormElement;
  const id = $props.id();
  const dirty = $derived(JSON.stringify(values) !== JSON.stringify(initial));
  function close() {
    if (status === 'saving') return;
    if (dirty) discarding = true;
    else onclose();
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    errors = {};
    for (const field of fields) {
      if (field.required && !values[field.key]?.trim())
        errors[field.key] = `Enter ${field.label.toLowerCase()}.`;
      if (field.type === 'url' && values[field.key]) {
        try {
          new URL(values[field.key]);
        } catch {
          errors[field.key] = 'Enter a complete URL.';
        }
      }
    }
    if (Object.keys(errors).length) {
      setTimeout(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    status = 'saving';
    await new Promise((r) => setTimeout(r, 250));
    if (outcome !== 'success') {
      status = outcome;
      return;
    }
    onsave({ ...values });
    status = 'saved';
    onclose();
  }
</script>

<Modal
  title={mode === 'create' ? `New ${entity}` : `Edit ${entity}`}
  description="Changes apply when you save."
  onclose={close}
  ><form bind:this={form} {id} class="stack" onsubmit={save} novalidate>
    {#if Object.keys(errors).length}<p role="alert" class="error">
        Check {Object.keys(errors).length} required or invalid field(s).
      </p>{/if}{#each fields as field}<div class="stack" style="gap:6px">
        <label for={id + field.key}
          ><strong>{field.label}</strong><span class="small muted">
            · {field.required ? 'Required' : 'Optional'}</span
          ></label
        >{#if field.type === 'textarea'}<textarea
            id={id + field.key}
            bind:value={values[field.key]}
            rows="4"
            aria-invalid={!!errors[field.key]}
            aria-describedby={id + field.key + '-help'}
          ></textarea>{:else if field.type === 'select'}<select
            id={id + field.key}
            bind:value={values[field.key]}
            aria-invalid={!!errors[field.key]}
            aria-describedby={id + field.key + '-help'}
            ><option value="">Choose…</option>{#each field.options || [] as option}<option
                >{option}</option
              >{/each}</select
          >{:else}<input
            id={id + field.key}
            type={field.type || 'text'}
            bind:value={values[field.key]}
            aria-invalid={!!errors[field.key]}
            aria-describedby={id + field.key + '-help'}
            autocomplete="off"
          />{/if}<small
          id={id + field.key + '-help'}
          class:error={!!errors[field.key]}
          class="muted">{errors[field.key] || field.hint || ''}</small
        >
      </div>{/each}{#if status && status !== 'saving' && status !== 'saved'}<AsyncFeedback
        state={status}
        onretry={() => (status = '')}
      />{/if}{#if discarding}<div class="notice stack" role="alert">
        <strong>Discard unsaved changes?</strong>
        <div class="row">
          <Button label="Keep editing" onclick={() => (discarding = false)} /><Button
            label="Discard changes"
            tone="danger"
            onclick={onclose}
          />
        </div>
      </div>{/if}
  </form>
  {#snippet footer()}<Button label="Cancel" disabled={status === 'saving'} onclick={close} /><button
      class="save"
      type="submit"
      form={id}
      disabled={status === 'saving'}
      >{status === 'saving'
        ? 'Saving…'
        : mode === 'create'
          ? `Create ${entity}`
          : 'Save changes'}</button
    >{/snippet}</Modal
>

<style>
  input,
  textarea,
  select {
    width: 100%;
    background: var(--canvas);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 9px 12px;
    min-height: 36px;
  }
  textarea {
    resize: vertical;
  }
  [aria-invalid='true'] {
    border-color: var(--failure);
  }
  .save {
    min-height: 36px;
    padding: 8px 14px;
    border: 0;
    border-radius: 9px;
    background: var(--accent);
    color: var(--action-ink);
    font-weight: 600;
  }
</style>
