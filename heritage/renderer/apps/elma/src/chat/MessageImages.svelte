<script lang="ts">
  import { api } from '../api'
  import type { ImageAttachment } from '../constants'

  type StoredImage = { sha256: string; mime_type: string; filename?: string }
  let { attachments = [] }: { attachments?: (ImageAttachment | StoredImage)[] } = $props()
  let images = $state<{ name: string; src: string }[]>([])
  let failed = $state(false)
  let selected = $state<{ name: string; src: string } | null>(null)
  let dialog: HTMLDialogElement

  $effect(() => {
    const current = attachments
    let cancelled = false
    images = []
    failed = false
    selected = null
    dialog?.close()
    void Promise.all(current.map(async (attachment, index) => {
      try {
        const image = 'data' in attachment ? attachment : await api.draft.getBlob(attachment.sha256)
        if (!/^image\/(png|jpeg|webp|gif)$/.test(image.mime_type)) throw new Error('Unsupported image')
        return {
          name: ('name' in attachment ? attachment.name : 'filename' in attachment ? attachment.filename : '') || `Image ${index + 1}`,
          src: `data:${image.mime_type};base64,${image.data}`,
        }
      } catch {
        if (!cancelled) failed = true
        return null
      }
    })).then((loaded) => {
      if (!cancelled) images = loaded.filter((image): image is NonNullable<typeof image> => image !== null)
    })
    return () => { cancelled = true }
  })
</script>

{#if attachments.length}
  <div class="images" aria-label="Message images">
    {#each images as image}
      <button class="thumbnail" type="button" aria-label={`Expand ${image.name}`} onclick={() => { selected = image; dialog.showModal() }}>
        <img src={image.src} alt={image.name} />
      </button>
    {/each}
    {#if failed}<span role="status">Some images could not be loaded.</span>{/if}
  </div>
{/if}

<dialog bind:this={dialog} aria-label={selected?.name || 'Image preview'} onclick={(event) => { if (event.target === dialog) dialog.close() }} onclose={() => { selected = null }}>
  {#if selected}
    <header><span>{selected.name}</span><button type="button" aria-label="Close image preview" onclick={() => dialog.close()}>Close</button></header>
    <div class="full-image"><img src={selected.src} alt={selected.name} /></div>
  {/if}
</dialog>

<style>
  .images { display:flex; gap:8px; overflow-x:auto; margin-bottom:8px; }
  .thumbnail { flex:none; padding:0; width:88px; height:72px; overflow:hidden; border:1px solid var(--arbol-color-border); border-radius:6px; background:var(--arbol-color-surface); cursor:zoom-in; }
  .thumbnail img { width:100%; height:100%; object-fit:contain; display:block; }
  button:focus-visible { outline:2px solid var(--arbol-color-link); outline-offset:2px; }
  dialog { max-width:92vw; max-height:92dvh; padding:16px; border:1px solid var(--arbol-color-border); border-radius:10px; background:var(--arbol-color-surface); color:var(--arbol-color-text); }
  dialog::backdrop { background:rgb(0 0 0 / 75%); }
  header { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:12px; overflow-wrap:anywhere; }
  header button { cursor:pointer; }
  .full-image { overflow:auto; max-height:78dvh; }
  .full-image img { display:block; max-width:85vw; height:auto; }
</style>
