<script lang="ts">
  import {
    TIME_OFFSETS_MINUTES, addDays, formatOffset, parseDateInput, parseTimeInput,
    roundToFiveMinutes, sameLocalDate, startOfWeek,
  } from './datetime'

  let {
    value = $bindable<number | null>(null),
    allowYear = false,
    nullable = false,
    onChange,
    label = 'Date and time',
  }: {
    value?: number | null
    allowYear?: boolean
    nullable?: boolean
    onChange?: (value: number | null) => void
    label?: string
  } = $props()

  const renderedAt = roundToFiveMinutes(new Date())
  let localValue = $state<number>(value ?? renderedAt.getTime())
  let lastExternal = $state<number | null | undefined>(value)
  let dateText = $state('')
  let timeText = $state('')
  let dateOpen = $state(false)
  let timeOpen = $state(false)
  let headerPopup = $state<'month' | 'year' | null>(null)
  let timeTab = $state<'clock' | 'offset'>('clock')
  let clockStage = $state<'hour' | 'minute'>('hour')
  let viewStart = $state(startOfWeek(new Date(value ?? renderedAt.getTime())))
  let root: HTMLDivElement

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const months = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2024, month, 1)))
  const days = $derived(Array.from({ length: 21 }, (_, index) => addDays(viewStart, index)))
  const selected = $derived(new Date(localValue))
  const clockNumbers = $derived(clockStage === 'hour'
    ? Array.from({ length: 24 }, (_, value) => value)
    : Array.from({ length: 12 }, (_, index) => index * 5))

  const pad = (value: number) => String(value).padStart(2, '0')
  const dateValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const timeValue = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const syncText = () => { const date = new Date(localValue); dateText = dateValue(date); timeText = timeValue(date) }
  syncText()

  $effect(() => {
    if (value === lastExternal) return
    lastExternal = value
    localValue = value ?? renderedAt.getTime()
    viewStart = startOfWeek(new Date(localValue))
    syncText()
  })

  $effect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) closePopups()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closePopups() }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  })

  function emit(next: Date | null) {
    if (next) {
      localValue = next.getTime()
      value = localValue
      lastExternal = value
      syncText()
    } else {
      value = null
      lastExternal = null
    }
    onChange?.(value)
  }

  function closePopups() { dateOpen = false; timeOpen = false; headerPopup = null }
  function openDate() { dateOpen = !dateOpen; timeOpen = false; headerPopup = null; if (dateOpen) viewStart = startOfWeek(selected) }
  function openTime() { timeOpen = !timeOpen; dateOpen = false; headerPopup = null; clockStage = 'hour' }
  function setDate(date: Date) {
    const next = new Date(localValue)
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
    emit(next); dateOpen = false
  }
  function commitDate() {
    const parsed = parseDateInput(dateText)
    if (!parsed || (!allowYear && parsed.year !== renderedAt.getFullYear())) { syncText(); return }
    const next = new Date(localValue)
    next.setFullYear(parsed.year, parsed.month, parsed.day)
    emit(next); viewStart = startOfWeek(next)
  }
  function commitTime() {
    const parsed = parseTimeInput(timeText)
    if (!parsed) { syncText(); return }
    const next = new Date(localValue)
    next.setHours(parsed.hour, parsed.minute, 0, 0)
    emit(next)
  }
  function chooseClock(number: number) {
    const next = new Date(localValue)
    if (clockStage === 'hour') { next.setHours(number); emit(next); clockStage = 'minute' }
    else { next.setMinutes(number, 0, 0); emit(next); timeOpen = false }
  }
  function chooseOffset(minutes: number) { emit(new Date(Date.now() + minutes * 60_000)); timeOpen = false }
  function shiftWeek(amount: number) { viewStart = addDays(viewStart, amount * 7) }
  function chooseMonth(month: number) {
    const anchor = new Date(viewStart); anchor.setMonth(month); viewStart = startOfWeek(anchor); headerPopup = null
  }
  function chooseYear(year: number) {
    if (!allowYear) return
    const anchor = new Date(viewStart); anchor.setFullYear(year); viewStart = startOfWeek(anchor); headerPopup = null
  }
  function setNow() {
    // Preserve the exact wall-clock instant. The manual clock remains five-minute
    // precision, but “Now” must not silently round or truncate the selected value.
    const now = new Date()
    emit(now)
    viewStart = startOfWeek(now)
    closePopups()
  }
  function clear() { emit(null); closePopups() }
</script>

<div class="arbol-datetime" bind:this={root}>
  <div class="inputs" aria-label={label}>
    <div class="input-wrap">
      <input aria-label={`${label} date`} bind:value={dateText} onfocus={() => { dateOpen = true; timeOpen = false }} onblur={commitDate} onkeydown={(event) => { if (event.key === 'Enter') commitDate() }} />
      <button type="button" class="picker-button" aria-label="Open date picker" aria-expanded={dateOpen} onclick={openDate}>▦</button>
    </div>
    <div class="input-wrap time-input">
      <input aria-label={`${label} time`} bind:value={timeText} onfocus={() => { timeOpen = true; dateOpen = false; clockStage = 'hour' }} onblur={commitTime} onkeydown={(event) => { if (event.key === 'Enter') commitTime() }} />
      <button type="button" class="picker-button" aria-label="Open time picker" aria-expanded={timeOpen} onclick={openTime}>◷</button>
    </div>
    <button type="button" class="now" aria-label={`Set ${label} to now`} onclick={setNow}>Now</button>
    {#if nullable && value !== null}<button type="button" class="clear" aria-label={`Clear ${label}`} onclick={clear}>×</button>{/if}
  </div>

  {#if dateOpen}
    <div class="popover calendar" role="dialog" aria-label="Choose date">
      <div class="calendar-header">
        <button type="button" class="arrow" aria-label="Previous week" onclick={() => shiftWeek(-1)}>‹</button>
        <div class="period">
          <button type="button" onclick={() => (headerPopup = headerPopup === 'month' ? null : 'month')}>{months[viewStart.getMonth()]}</button>
          {#if allowYear}<button type="button" onclick={() => (headerPopup = headerPopup === 'year' ? null : 'year')}>{viewStart.getFullYear()}</button>{:else}<span>{viewStart.getFullYear()}</span>{/if}
        </div>
        <button type="button" class="arrow" aria-label="Next week" onclick={() => shiftWeek(1)}>›</button>
      </div>
      {#if headerPopup === 'month'}
        <div class="selection-grid months">
          {#each months as month, index}<button type="button" class:active={index === viewStart.getMonth()} onclick={() => chooseMonth(index)}>{month.slice(0, 3)}</button>{/each}
        </div>
      {:else if headerPopup === 'year'}
        <div class="selection-grid years">
          {#each Array.from({ length: 9 }, (_, index) => viewStart.getFullYear() - 4 + index) as year}<button type="button" class:active={year === viewStart.getFullYear()} onclick={() => chooseYear(year)}>{year}</button>{/each}
        </div>
      {:else}
        <div class="weekday-row">{#each weekdays as day}<span>{day}</span>{/each}</div>
        <div class="day-grid">
          {#each days as day}
            <button type="button" class:selected={sameLocalDate(day, selected)} class:today={sameLocalDate(day, renderedAt)} class:outside={day.getMonth() !== viewStart.getMonth()} disabled={!allowYear && day.getFullYear() !== renderedAt.getFullYear()} onclick={() => setDate(day)}>
              <span>{day.getDate()}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if timeOpen}
    <div class="popover time" role="dialog" aria-label="Choose time">
      <div class="tabs"><button type="button" class:active={timeTab === 'clock'} onclick={() => (timeTab = 'clock')}>Clock</button><button type="button" class:active={timeTab === 'offset'} onclick={() => (timeTab = 'offset')}>Offset</button></div>
      {#if timeTab === 'clock'}
        <div class="clock-title">{clockStage === 'hour' ? 'Choose hour' : 'Choose minutes'}</div>
        <div class="clock-face">
          {#each clockNumbers as number, index}
            {@const angle = ((clockStage === 'hour' ? number % 12 : index) / 12) * Math.PI * 2 - Math.PI / 2}
            {@const radius = clockStage === 'hour' && number >= 12 ? 48 : 78}
            <button type="button" class:active={clockStage === 'hour' ? number === selected.getHours() : number === Math.round(selected.getMinutes() / 5) * 5 % 60} style={`left:${100 + Math.cos(angle) * radius}px;top:${100 + Math.sin(angle) * radius}px`} onclick={() => chooseClock(number)}>{pad(number)}</button>
          {/each}
          <span class="clock-pin"></span>
        </div>
        <label class="manual-time"><span>Selected time</span><input bind:value={timeText} onblur={commitTime} onkeydown={(event) => { if (event.key === 'Enter') commitTime() }} /></label>
      {:else}
        <p class="offset-help">Choose an offset from the current moment.</p>
        <div class="offset-grid">{#each TIME_OFFSETS_MINUTES as minutes}<button type="button" onclick={() => chooseOffset(minutes)}>{formatOffset(minutes)}</button>{/each}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .arbol-datetime{position:relative;min-width:0}.inputs{display:grid;grid-template-columns:minmax(132px,1.25fr) minmax(94px,.75fr) auto auto;gap:6px;align-items:center}.input-wrap{position:relative;min-width:0}.input-wrap input{padding-right:34px!important;font-family:var(--arbol-font-mono)!important}.picker-button{position:absolute;right:2px;top:2px;bottom:2px;width:30px!important;padding:0!important;border:0!important;background:transparent!important;color:var(--arbol-color-text-muted)!important}.now{width:auto!important;height:28px;padding:0 9px!important;font:600 10px var(--arbol-font-ui)!important}.clear{width:28px!important;height:28px;padding:0!important;border-radius:50%!important}.popover{position:absolute;z-index:2100;top:calc(100% + 6px);left:0;border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);background:var(--arbol-color-surface);box-shadow:0 18px 45px rgba(0,0,0,.38);padding:12px;color:var(--arbol-color-text)}.calendar{width:min(350px,calc(100vw - 36px))}.calendar-header{display:grid;grid-template-columns:34px 1fr 34px;align-items:center;margin-bottom:10px}.calendar-header button,.tabs button,.selection-grid button,.day-grid button,.offset-grid button,.clock-face button{cursor:pointer;border:0;background:transparent;color:inherit;border-radius:var(--arbol-radius-s)}.arrow{font-size:24px!important;padding:2px!important}.period{display:flex;align-items:center;justify-content:center;gap:5px}.period button,.period span{padding:5px;font:600 var(--arbol-type-body)/1 var(--arbol-font-ui)}.weekday-row,.day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.weekday-row span{text-align:center;color:var(--arbol-color-text-muted);font:10px var(--arbol-font-ui);padding-bottom:4px}.day-grid button{aspect-ratio:1;display:grid;place-items:center;font:600 12px var(--arbol-font-mono)}.day-grid button:hover,.selection-grid button:hover,.offset-grid button:hover{background:var(--arbol-color-surface-2)}.day-grid .outside{color:var(--arbol-color-text-muted)}.day-grid .today span{box-shadow:inset 0 -1px var(--arbol-color-accent)}.day-grid .selected{background:var(--arbol-color-accent)!important;color:var(--arbol-color-accent-ink,var(--arbol-color-bg))}.day-grid button:disabled{opacity:.25;cursor:not-allowed}.selection-grid{display:grid;gap:5px}.selection-grid.months{grid-template-columns:repeat(3,1fr)}.selection-grid.years{grid-template-columns:repeat(3,1fr)}.selection-grid button{padding:10px 6px}.selection-grid .active{background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink,var(--arbol-color-bg))}.time{width:min(300px,calc(100vw - 36px))}.tabs{display:grid;grid-template-columns:1fr 1fr;padding:2px;background:var(--arbol-color-surface-2);border-radius:var(--arbol-radius-s);margin-bottom:10px}.tabs button{padding:7px}.tabs .active{background:var(--arbol-color-bg);box-shadow:var(--arbol-shadow-1)}.clock-title{text-align:center;color:var(--arbol-color-text-muted);font:11px var(--arbol-font-ui)}.clock-face{position:relative;width:200px;height:200px;margin:4px auto 10px;border-radius:50%;background:var(--arbol-color-surface-2);border:1px solid var(--arbol-color-hairline)}.clock-face button{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;padding:0;font:10px var(--arbol-font-mono)}.clock-face button:hover,.clock-face button.active{background:var(--arbol-color-accent);color:var(--arbol-color-accent-ink,var(--arbol-color-bg))}.clock-pin{position:absolute;left:97px;top:97px;width:6px;height:6px;border-radius:50%;background:var(--arbol-color-accent)}.manual-time{display:grid;grid-template-columns:1fr 92px;align-items:center;gap:10px;color:var(--arbol-color-text-muted);font:11px var(--arbol-font-ui)}.manual-time input{text-align:center;font-family:var(--arbol-font-mono)!important}.offset-help{margin:2px 0 10px;color:var(--arbol-color-text-muted);font:11px var(--arbol-font-ui)}.offset-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.offset-grid button{padding:8px 3px;border:1px solid var(--arbol-color-hairline);font:11px var(--arbol-font-mono)}@media(max-width:520px){.inputs{grid-template-columns:1fr 1fr auto auto}.popover{position:fixed;left:12px;right:12px;top:50%;transform:translateY(-50%);width:auto}.calendar{width:auto}.time{width:auto}}
</style>
