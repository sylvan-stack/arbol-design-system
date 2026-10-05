<script lang="ts">
  /* Header toggle for the turn-completion chime. Left click flips the chime on
   * or off; holding opens volume; right click opens the sound picker, where any bundled
   * resources/sounds track can be chosen and test-played. Settings live on the
   * native side (sound.settings.*) so playback there honours them even if this
   * window's storage is stale. */
  import { callNative } from '../bridge/arbol'
  import { onMount, tick } from 'svelte'

  let volume = $state(100)
  let volumeOpen = $state(false)
  let slider: HTMLInputElement | undefined = $state()
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let held = false
  let popupTop = $state(0)
  let popupRight = $state(0)
  let error = $state('')

  function showPopup(node: HTMLDivElement) {
    node.showPopover()
  }

  function positionPopup() {
    const rect = root?.getBoundingClientRect()
    if (!rect) return
    popupTop = rect.bottom + 8
    popupRight = Math.max(8, window.innerWidth - rect.right)
  }

  function cancelHold() {
    if (holdTimer !== null) clearTimeout(holdTimer)
    holdTimer = null
  }

  async function openVolume() {
    positionPopup()
    pickerOpen = false
    volumeOpen = true
    await refresh()
    await tick()
    slider?.focus()
  }

  function startHold(e: PointerEvent) {
    if (e.button !== 0) return
    held = false
    cancelHold()
    holdTimer = setTimeout(() => {
      held = true
      void openVolume()
    }, 450)
  }

  async function setVolume(value: number) {
    volume = value
    try {
      const result = await callNative('sound.settings.set', { volume: value / 100 })
      if (!result?.ok) throw new Error('Could not save volume')
      error = ''
    } catch {
      error = 'Could not save volume. Try again.'
      await refresh()
    }
  }

  let available = $state(false)
  let enabled = $state(true)
  let selected = $state('classic-chime')
  let sounds = $state<string[]>([])
  let pickerOpen = $state(false)
  let previewing = $state('')
  let root: HTMLDivElement | undefined = $state()
  let previewTimer: ReturnType<typeof setTimeout> | null = null

  onMount(() => {
    if (!window.webkit?.messageHandlers?.arbol) return
    available = true
    void refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('pointerup', cancelHold)
    return () => {
      cancelHold()
      if (previewTimer !== null) clearTimeout(previewTimer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pointerup', cancelHold)
    }
  })

  async function refresh() {
    try {
      const result = await callNative('sound.settings.get', {})
      if (!result?.ok) return
      enabled = result.enabled !== false
      if (typeof result.volume === 'number') volume = Math.round(result.volume * 100)
      if (typeof result.sound === 'string') selected = result.sound
      if (Array.isArray(result.sounds)) sounds = result.sounds as string[]
    } catch { /* the toggle keeps its defaults when the bridge hiccups */ }
  }

  async function toggle(e: MouseEvent) {
    if (held && e.detail !== 0) { held = false; return }
    await refresh()
    if (!available) return
    const next = !enabled
    enabled = next
    pickerOpen = false
    volumeOpen = false
    try {
      const result = await callNative('sound.settings.set', { enabled: next })
      if (result?.ok && typeof result.enabled === 'boolean') enabled = result.enabled
    } catch { enabled = !next }
  }

  async function choose(name: string) {
    selected = name
    try {
      const result = await callNative('sound.completion.select', { name })
      if (result?.ok && typeof result.sound === 'string') selected = result.sound
    } catch { /* keep the optimistic selection */ }
  }

  async function preview(name: string) {
    try {
      const result = await callNative('sound.completion.preview', { name })
      if (!result?.ok) return
      previewing = name
      if (previewTimer !== null) clearTimeout(previewTimer)
      previewTimer = setTimeout(() => { previewing = '' }, 1500)
    } catch { /* a failed test-play just leaves the button as-is */ }
  }

  // "bell-notification" → "Bell notification" for the picker rows.
  function label(name: string) {
    return name
      .split('-')
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(' ')
  }

  function openPicker(e: MouseEvent) {
    if (!available) return
    e.preventDefault()
    cancelHold()
    positionPopup()
    volumeOpen = false
    pickerOpen = !pickerOpen
    void refresh()
  }

  $effect(() => {
    if (!pickerOpen && !volumeOpen) return
    const close = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) { pickerOpen = false; volumeOpen = false }
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { pickerOpen = false; volumeOpen = false; root?.querySelector('button')?.focus() }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  })
</script>

{#if available}
  <div style="position:relative" data-arbol-sound-control bind:this={root}>
    <button
      type="button"
      onclick={toggle}
      onpointerdown={startHold}
      onpointerup={cancelHold}
      onpointerleave={cancelHold}
      onpointercancel={cancelHold}
      onkeydown={(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); void openVolume() }
      }}
      aria-label="Completion sound"
      aria-expanded={volumeOpen || pickerOpen}
      oncontextmenu={openPicker}
      title="Completion sound: {enabled ? 'on' : 'off'} — hold for volume; right-click to choose the sound; ↓ for volume"
      aria-pressed={enabled}
      style="display:flex;align-items:center;justify-content:center;cursor:pointer;
             width:26px;height:26px;background:var(--arbol-color-surface-2);
             border:1px solid var(--arbol-color-border);border-radius:99px;
             color:{enabled ? 'var(--arbol-color-text)' : 'var(--arbol-color-text-muted)'}"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 6h2.5L8 3v10L4.5 10H2a.7.7 0 0 1-.7-.7V6.7A.7.7 0 0 1 2 6Z" fill="currentColor" />
        {#if enabled}
          <path d="M10.5 5.5a3.4 3.4 0 0 1 0 5M12.3 3.8a5.9 5.9 0 0 1 0 8.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        {:else}
          <path d="M10.2 6.2l4 4m0-4l-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        {/if}
      </svg>
    </button>

    {#if volumeOpen}
      <div role="group" aria-label="Completion sound volume" popover="manual" use:showPopup
        style="position:fixed;margin:0;left:auto;bottom:auto;top:{popupTop}px;right:{popupRight}px;z-index:1000;width:220px;
               background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);
               border-radius:var(--arbol-radius-m);box-shadow:var(--arbol-shadow-pop);padding:12px">
        <label style="display:grid;gap:10px;color:var(--arbol-color-text);font-size:var(--arbol-type-body)">
          <span>Volume: {volume}%{enabled ? '' : ' · muted'}</span>
          <input bind:this={slider} type="range" min="0" max="100" step="1" value={volume}
            oninput={(e) => { volume = Number(e.currentTarget.value) }}
            onchange={(e) => void setVolume(Number(e.currentTarget.value))} />
        </label>
        <button type="button" onclick={() => preview(selected)} style="margin-top:8px">Test sound</button>
        {#if error}<p role="alert">{error}</p>{/if}
      </div>
    {/if}

    {#if pickerOpen}
      <div popover="manual" use:showPopup
        style="position:fixed;margin:0;left:auto;bottom:auto;top:{popupTop}px;right:{popupRight}px;z-index:1000;min-width:190px;
               max-height:320px;overflow:auto;background:var(--arbol-color-surface);
               border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-m);
               box-shadow:var(--arbol-shadow-pop);padding:5px"
      >
        <div style="display:flex;align-items:center;gap:6px;font-size:var(--arbol-type-label);
                    color:var(--arbol-color-text-muted);text-transform:uppercase;letter-spacing:0.7px;
                    font-weight:600;padding:5px 8px 8px;white-space:nowrap">
          Completion sound
          <span style="flex:1"></span>
          <span style="font:500 9px/1 var(--arbol-font-mono);letter-spacing:0.3px">{enabled ? 'on' : 'muted'}</span>
        </div>
        {#if sounds.length === 0}
          <div style="padding:6px 8px;color:var(--arbol-color-text-muted);font:500 var(--arbol-type-body)/1.3 var(--arbol-font-ui)">
            No sounds bundled.
          </div>
        {:else}
          {#each sounds as name (name)}
            {@const on = name === selected}
            <div
              style="display:flex;align-items:center;gap:6px;width:100%;
                     background:{on ? 'var(--arbol-color-surface-2)' : 'transparent'};
                     border:1px solid {on ? 'var(--arbol-color-border)' : 'transparent'};
                     border-radius:var(--arbol-radius-s);padding:3px 4px 3px 8px"
            >
              <button
                type="button"
                onclick={() => choose(name)}
                title="Use {label(name)} as the completion sound"
                style="flex:1;text-align:left;cursor:pointer;background:none;border:none;padding:3px 0;
                       color:var(--arbol-color-text);font:500 var(--arbol-type-body)/1 var(--arbol-font-ui)"
              >
                {label(name)}
              </button>
              <button
                type="button"
                onclick={() => preview(name)}
                title="Test-play {name}"
                style="display:flex;align-items:center;justify-content:center;cursor:pointer;
                       width:22px;height:22px;background:none;
                       border:1px solid var(--arbol-color-border);border-radius:99px;
                       color:{previewing === name ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text-muted)'}"
              >
                {#if previewing === name}
                  <span style="width:6px;height:6px;background:currentColor;border-radius:1px"></span>
                {:else}
                  <span style="width:0;height:0;border-style:solid;border-width:4px 0 4px 7px;
                               border-color:transparent transparent transparent currentColor"></span>
                {/if}
              </button>
              {#if on}<span style="color:var(--arbol-color-accent);font-size:12px;padding-right:2px">✓</span>{/if}
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
{/if}
