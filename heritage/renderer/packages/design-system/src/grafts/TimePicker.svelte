<script lang="ts">
  /* Compact time picker (no scrolling): a trigger showing HH:MM that opens a
   * popover with all 24 hours as a 6-col grid + minutes limited to tens (00–50).
   * The popover is PORTALED to <body> with fixed positioning so the modal's
   * `overflow:auto` can't clip it; it flips above the trigger when there's no
   * room below. WKWebView's native <input type=time> is a bare field, so this is
   * a real picker. */
  import { PAGE0, PAGE1 } from './time'

  let { value, onChange }: { value: string; onChange: (v: string) => void } = $props()

  let open = $state(false)
  let trigEl: HTMLButtonElement | undefined
  let popEl = $state<HTMLDivElement>()
  let pos = $state({ left: 0, top: 0 })

  const W = 268
  const H = 180
  const pad = (n: number) => String(n).padStart(2, '0')
  // Hours limited to the board's visible window (08:00–20:00).
  const hours = Array.from({ length: PAGE1 - PAGE0 + 1 }, (_, i) => PAGE0 + i)
  const mins = [0, 10, 20, 30, 40, 50]
  const cur = $derived.by(() => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value || '')
    return m ? { h: Math.min(23, +m[1]), m: Math.min(59, +m[2]) } : { h: 9, m: 0 }
  })

  const setH = (h: number) => onChange(`${pad(h)}:${pad(cur.m)}`)
  const setM = (m: number) => onChange(`${pad(cur.h)}:${pad(m)}`)

  function place() {
    if (!trigEl) return
    const r = trigEl.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8))
    const top = window.innerHeight - r.bottom >= H + 8 ? r.bottom + 4 : Math.max(8, r.top - H - 4)
    pos = { left, top }
  }

  $effect(() => {
    if (!open) return
    place()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (trigEl && trigEl.contains(t)) return
      if (popEl && popEl.contains(t)) return
      open = false
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open = false }
    const reflow = () => place()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', reflow, true)
    window.addEventListener('scroll', reflow, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', reflow, true)
      window.removeEventListener('scroll', reflow, true)
    }
  })

  // Move the popover to <body> so the modal's overflow:auto can't clip it.
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return { destroy() { node.remove() } }
  }

  const trig =
    'box-sizing:border-box;width:100%;height:32px;display:flex;align-items:center;justify-content:space-between;gap:8px;' +
    'border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);' +
    'color:var(--arbol-color-text);padding:0 10px;font:600 var(--arbol-type-body)/1 var(--arbol-font-mono);cursor:pointer;outline:none'
  const cell = (on: boolean) =>
    `cursor:pointer;padding:7px 0;border-radius:var(--arbol-radius-s);border:1px solid ${on ? 'transparent' : 'var(--arbol-color-hairline)'};text-align:center;` +
    `font:600 var(--arbol-type-label)/1 var(--arbol-font-mono);` +
    `background:${on ? 'var(--arbol-color-accent)' : 'var(--arbol-color-surface-2)'};color:${on ? 'var(--arbol-color-accent-ink)' : 'var(--arbol-color-text)'}`
  const label = 'font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px'
</script>

<button type="button" bind:this={trigEl} onclick={() => (open = !open)} style={trig} aria-haspopup="true" aria-expanded={open}>
  <span>{value || '--:--'}</span>
  <span style="opacity:0.55;font-family:var(--arbol-font-ui)">▾</span>
</button>

{#if open}
  <div use:portal bind:this={popEl}
    style="position:fixed;left:{pos.left}px;top:{pos.top}px;width:{W}px;z-index:2000;
           background:var(--arbol-color-surface);border:1px solid var(--arbol-color-border);
           border-radius:var(--arbol-radius-m);padding:10px;box-shadow:0 12px 30px rgba(0,0,0,0.35)">
    <div style={label}>Hour</div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px">
      {#each hours as h}
        <button type="button" onclick={() => setH(h)} style={cell(h === cur.h)}>{pad(h)}</button>
      {/each}
    </div>
    <div style="{label};margin-top:10px">Minute</div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px">
      {#each mins as m}
        <button type="button" onclick={() => setM(m)} style={cell(m === cur.m)}>{pad(m)}</button>
      {/each}
    </div>
  </div>
{/if}
