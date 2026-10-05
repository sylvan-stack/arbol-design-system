<script lang="ts">
  import { callNative, onCoreReconnect } from '@arbol/design-system'
  import { onMount } from 'svelte'
  import CompactSwimlanesPanel from './CompactSwimlanesPanel.svelte'
  import { loadSwimlanesStrict, type Swimlane } from './data'
  import { beginWindowDrag, closeCompactSwimlanesPanel, openSwimlaneInBoard } from './windowApi'

  const THEME_KEY = 'arbol-theme:oaken'
  const SCALE_KEY = 'arbol-ui-font-scale:oaken'

  let swimlanes = $state<Swimlane[]>([])
  let nowMs = $state(Date.now())
  let loading = $state(true)
  let loadError = $state(false)
  let refreshGeneration = 0

  async function reload() {
    const generation = ++refreshGeneration
    try {
      const loaded = await loadSwimlanesStrict()
      if (generation !== refreshGeneration) return
      swimlanes = loaded
      loadError = false
    } catch (error) {
      if (generation !== refreshGeneration) return
      loadError = true
      console.error('Oaken timer panel refresh failed', error)
    } finally {
      if (generation === refreshGeneration) loading = false
    }
  }

  function dragHeader(event: MouseEvent) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button,input,textarea,select,a,[role=button]')) return
    beginWindowDrag().catch(() => {})
  }

  function openLane(lane: Swimlane) {
    if (!lane.sid) return
    openSwimlaneInBoard(lane.sid).catch((error) => console.error('Could not open Oaken swimlane', error))
  }

  onMount(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem(THEME_KEY) || 'redwood')
    const scale = parseFloat(localStorage.getItem(SCALE_KEY) || '1') || 1
    document.documentElement.style.setProperty('--arbol-font-scale', String(scale))

    // Do not reveal the native panel until its first core read has completed.
    // Previously the panel announced readiness in a microtask, before this read,
    // so a populated board flashed (and could appear stuck) as “No active swimlanes”.
    void reload().finally(() => {
      void callNative('app.oakenSwimlanesPanelReady', {}).catch(() => {})
    })

    const clock = setInterval(() => (nowMs = Date.now()), 1_000)
    const refresh = setInterval(() => void reload(), 30_000)
    const retry = setInterval(() => {
      if (loadError) void reload()
    }, 2_000)
    const onFocus = () => void reload()
    const onSwimlanesChanged = () => void reload()
    const removeReconnectHandler = onCoreReconnect(() => void reload())
    window.addEventListener('focus', onFocus)
    window.addEventListener('arbol-oaken-swimlanes-changed', onSwimlanesChanged)
    return () => {
      clearInterval(clock)
      clearInterval(refresh)
      clearInterval(retry)
      removeReconnectHandler()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('arbol-oaken-swimlanes-changed', onSwimlanesChanged)
    }
  })
</script>

<CompactSwimlanesPanel
  {swimlanes}
  {nowMs}
  {loading}
  {loadError}
  onExit={() => closeCompactSwimlanesPanel().catch(() => {})}
  onOpenSwimlane={openLane}
  onDrag={dragHeader}
/>
