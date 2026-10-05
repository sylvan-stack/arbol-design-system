<script lang="ts">
  import { untrack } from 'svelte'
  /* The shared wall/urgency picker (Set Wall popup + Graft form): a type
   * (estimated | due | deadline) + a due time chosen one of three ways —
   *   1. Duration   — a span counted in WORKING hours from now (chips + free input)
   *   2. Time slot  — absolute working-time slots from the next round hour after now+30m
   *   3. Date & time — explicit pickers (date defaults today, time defaults next hour)
   * Duration + Time-slot count WORKING hours only (09:00–18:00, skip weekends),
   * e.g. +2h at 17:30 ⇒ 10:30 next working day. Date & time is literal.
   * `wallType` and the resolved `dueAt` (epoch ms, null while incomplete) are
   * bindable; the host owns saving. */
  import Field from '../components/Field.svelte'
  import { WICON, addWorkingTime, type WallType } from './time'
  import TimePicker from './TimePicker.svelte'

  let { wallType = $bindable('estimated'), dueAt = $bindable(null), currentDueMs = null }:
    {
      wallType?: WallType
      dueAt?: number | null
      currentDueMs?: number | null
    } = $props()

  const MIN = 60000
  const now = Date.now() // captured when the picker opens
  const pad = (n: number) => String(n).padStart(2, '0')

  const TYPES: { value: WallType; label: string }[] = [
    { value: 'estimated', label: `${WICON.estimated} Estimated` },
    { value: 'due', label: `${WICON.due} Due` },
    { value: 'deadline', label: `${WICON.deadline} Deadline` },
  ]

  type Off = { days: number; minutes: number; label: string }
  const DUR: Off[] = [
    { days: 0, minutes: 60, label: '1h' }, { days: 0, minutes: 90, label: '1.5h' },
    { days: 0, minutes: 120, label: '2h' }, { days: 0, minutes: 150, label: '2.5h' },
    { days: 0, minutes: 180, label: '3h' }, { days: 0, minutes: 240, label: '4h' },
    { days: 0, minutes: 300, label: '5h' }, { days: 0, minutes: 360, label: '6h' },
    { days: 0, minutes: 420, label: '7h' }, { days: 0, minutes: 480, label: '8h' },
    { days: 1, minutes: 120, label: '1d 2h' }, { days: 1, minutes: 240, label: '1d 4h' },
    { days: 2, minutes: 0, label: '2d' },
  ]
  // Time slots: a 30-min lead (the base already added 30m + rounded up an hour),
  // then the duration ladder, then longer day ranges 3d–10d.
  const SLOT_OFFS: Off[] = [
    { days: 0, minutes: 30, label: '30m' },
    ...DUR,
    ...[3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ days: n, minutes: 0, label: `${n}d` })),
  ]

  // Day-relative clock label for an absolute time (today ⇒ "HH:MM").
  function fmtAbs(ms: number): string {
    const d = new Date(ms)
    const midA = new Date(ms); midA.setHours(0, 0, 0, 0)
    const midToday = new Date(now); midToday.setHours(0, 0, 0, 0)
    const days = Math.round((midA.getTime() - midToday.getTime()) / 86400000)
    const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`
    if (days === 0) return clock
    if (days === 1) return `+1d ${clock}`
    if (days <= 6) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${clock}`
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${clock}` // disambiguate far slots
  }

  // Parse a free duration string into a working {days, minutes}: "1d 2h", "2.5h",
  // "90m". Fractional days fold into working minutes (a working day = WORK span).
  function parseDuration(s: string): Off | null {
    const t = s.trim().toLowerCase()
    if (!t) return null
    let days = 0
    let mins = 0
    let ok = false
    const dm = t.match(/(\d+(?:\.\d+)?)\s*d/); if (dm) { days += parseFloat(dm[1]); ok = true }
    const hm = t.match(/(\d+(?:\.\d+)?)\s*h/); if (hm) { mins += parseFloat(hm[1]) * 60; ok = true }
    const mm = t.match(/(\d+(?:\.\d+)?)\s*m(?!s)/); if (mm) { mins += parseFloat(mm[1]); ok = true }
    if (!ok || days < 0 || mins < 0 || (days === 0 && mins === 0)) return null
    const whole = Math.floor(days)
    return { days: whole, minutes: mins + (days - whole) * 9 * 60, label: t }
  }

  function ceilHour(ms: number): number {
    const d = new Date(ms)
    d.setMinutes(0, 0, 0)
    if (d.getTime() < ms) d.setHours(d.getHours() + 1)
    return d.getTime()
  }
  const slotBase = addWorkingTime(ceilHour(now + 30 * MIN), 0, 0)
  const SLOTS = [slotBase, ...SLOT_OFFS.map((o) => addWorkingTime(slotBase, o.days, o.minutes))]

  function todayDate(): string {
    const d = new Date(now)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  function nextHour(): string {
    const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  function toDateInput(ms: number) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
  function toTimeInput(ms: number) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

  // Editing must preserve the persisted wall unless the user changes it.
  // Opening an existing wall directly in Date & time makes `dueAt` resolve to
  // `currentDueMs`; defaulting to Duration would replace it with now + 2h.
  const initialDueMs = untrack(() => currentDueMs)
  let mode = $state<'duration' | 'slot' | 'datetime'>(initialDueMs != null ? 'datetime' : 'duration')
  let durSel = $state<Off>(DUR[2]) // default 2h
  let durText = $state('')
  let slotSel = $state<number>(SLOTS[0])
  let dateLocal = $state(initialDueMs != null ? toDateInput(initialDueMs) : todayDate())
  let timeLocal = $state(initialDueMs != null ? toTimeInput(initialDueMs) : nextHour())

  // The absolute due (epoch ms) the active mode resolves to.
  const resolved = $derived.by<number | null>(() => {
    if (mode === 'duration') {
      const off = durText.trim() ? parseDuration(durText) : durSel
      return off ? addWorkingTime(now, off.days, off.minutes) : null
    }
    if (mode === 'slot') return slotSel
    return dateLocal && timeLocal ? new Date(`${dateLocal}T${timeLocal}`).getTime() : null
  })
  $effect(() => { dueAt = resolved != null && !Number.isNaN(resolved) ? resolved : null })

  const MODES: { value: typeof mode; label: string }[] = [
    { value: 'duration', label: 'Duration' },
    { value: 'slot', label: 'Time slot' },
    { value: 'datetime', label: 'Date & time' },
  ]

  const inputStyle =
    'box-sizing:border-box;width:100%;height:32px;border:1px solid var(--arbol-color-border);' +
    'border-radius:var(--arbol-radius-s);background:var(--arbol-color-surface-2);color:var(--arbol-color-text);' +
    'padding:0 9px;font:500 var(--arbol-type-body)/1 var(--arbol-font-ui);outline:none'
  const chip = (on: boolean) =>
    `cursor:pointer;padding:6px 11px;border-radius:999px;white-space:nowrap;font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);` +
    `border:1px solid ${on ? 'color-mix(in oklch, var(--arbol-color-accent) 55%, var(--arbol-color-border))' : 'var(--arbol-color-border)'};` +
    `background:${on ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface-2)'};color:${on ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text)'}`
  const segBtn = (on: boolean) =>
    `flex:1;cursor:pointer;padding:7px 6px;border-radius:var(--arbol-radius-m);font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);white-space:nowrap;` +
    `border:1px solid ${on ? 'color-mix(in oklch, var(--arbol-color-accent) 55%, var(--arbol-color-border))' : 'var(--arbol-color-border)'};` +
    `background:${on ? 'var(--arbol-color-accent-soft)' : 'var(--arbol-color-surface-2)'};color:${on ? 'var(--arbol-color-accent)' : 'var(--arbol-color-text)'}`
</script>

<div style="display:flex;flex-direction:column;gap:var(--arbol-space-4)">
  <div>
    <div style="font:600 var(--arbol-type-label)/1 var(--arbol-font-ui);color:var(--arbol-color-text-muted);
                text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--arbol-space-2)">Type</div>
    <div style="display:flex;gap:var(--arbol-space-2)">
      {#each TYPES as t}
        <button type="button" onclick={() => (wallType = t.value)} style={segBtn(t.value === wallType)}>{t.label}</button>
      {/each}
    </div>
  </div>

  <div>
    <div style="display:flex;gap:var(--arbol-space-2);margin-bottom:var(--arbol-space-3)">
      {#each MODES as md}
        <button type="button" onclick={() => (mode = md.value)} style={segBtn(md.value === mode)}>{md.label}</button>
      {/each}
    </div>

    {#if mode === 'duration'}
      <div style="display:flex;flex-wrap:wrap;gap:var(--arbol-space-2)">
        {#each DUR as d}
          <button type="button" onclick={() => { durSel = d; durText = '' }} style={chip(!durText.trim() && durSel.label === d.label)}>{d.label}</button>
        {/each}
      </div>
      <div style="margin-top:var(--arbol-space-3)">
        <input style={inputStyle} value={durText} placeholder="or type a duration — e.g. 1d 2h, 2.5h, 90m"
          oninput={(e) => (durText = (e.currentTarget as HTMLInputElement).value)} />
        {#if durText.trim() && parseDuration(durText) == null}
          <div style="margin-top:6px;font-size:var(--arbol-type-label);color:var(--arbol-color-err)">Couldn’t read that duration.</div>
        {/if}
      </div>
    {:else if mode === 'slot'}
      <div style="display:flex;flex-wrap:wrap;gap:var(--arbol-space-2)">
        {#each SLOTS as s}
          <button type="button" onclick={() => (slotSel = s)} style={chip(slotSel === s)}>{fmtAbs(s)}</button>
        {/each}
      </div>
    {:else}
      <div style="display:flex;gap:var(--arbol-space-3)">
        <div style="flex:1.4;min-width:0">
          <Field label="Date">
            {#snippet children()}
              <input type="date" style={inputStyle} value={dateLocal} oninput={(e) => (dateLocal = (e.currentTarget as HTMLInputElement).value)} />
            {/snippet}
          </Field>
        </div>
        <div style="flex:1;min-width:0">
          <Field label="Time">
            {#snippet children()}
              <TimePicker value={timeLocal} onChange={(v) => (timeLocal = v)} />
            {/snippet}
          </Field>
        </div>
      </div>
    {/if}
  </div>

  <div style="font-size:var(--arbol-type-label);color:var(--arbol-color-text-muted)">
    {#if mode !== 'datetime'}<span style="opacity:0.85">Working hours (09:00–18:00, Mon–Fri) · </span>{/if}
    {#if dueAt != null}
      Wall at <span style="color:var(--arbol-color-text);font-family:var(--arbol-font-mono)">{new Date(dueAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
    {:else}
      pick a time to set the wall.
    {/if}
  </div>
</div>
