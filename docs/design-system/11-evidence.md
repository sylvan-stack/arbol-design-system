---
role: derived
---
# Evidence excerpts

Line numbers refer to the captured **working tree**, not necessarily HEAD. Excerpts are intentionally small; check the archive for full surrounding logic. Claims of missing behavior in a component follow full-file inspection and are not established solely by a short excerpt.

The old guide is historical intention. Source is implementation evidence. Proposed design rules are explicitly authored decisions. Native installed-app testing and whole-product screenshot coverage are not claimed.

## Shared modal close policy

[renderer/packages/design-system/src/overlay/Modal.svelte:14](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/packages/design-system/src/overlay/Modal.svelte#L14)

```text
  14       width?: number
  15     } = $props()
  16
  17   $effect(() => {
  18     const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dismissable) onClose() }
  19     window.addEventListener('keydown', onKey)
  20     return () => window.removeEventListener('keydown', onKey)
  21   })
  22
  23   function onBackdrop(e: MouseEvent) {
  24     if (e.target === e.currentTarget && dismissable) onClose()
  25   }
  26 </script>
  27
  28 <div
```

<!-- sources:
arbol:renderer/packages/design-system/src/overlay/Modal.svelte
-->

## Modal role and layout

[renderer/packages/design-system/src/overlay/Modal.svelte:35](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/packages/design-system/src/overlay/Modal.svelte#L35)

```text
  35   <div
  36     role="dialog"
  37     aria-modal="true"
  38     style="box-sizing:border-box;width:{width}px;max-width:100%;max-height:100%;min-height:0;overflow:hidden;
  39            display:flex;flex-direction:column;background:var(--arbol-color-surface);
  40            border:1px solid var(--arbol-color-border);border-radius:var(--arbol-radius-l);
  41            box-shadow:var(--arbol-shadow-pop);animation:arbolpop .16s cubic-bezier(.2,.8,.2,1)"
  42   >
  43     <div style="display:flex;flex:0 0 auto;align-items:center;gap:12px;padding:var(--arbol-space-4) var(--arbol-space-5);
  44                 border-bottom:1px solid var(--arbol-color-border)">
  45       {#if icon}<span style="color:var(--arbol-color-accent);display:flex">{@render icon()}</span>{/if}
  46       <div style="flex:1;min-width:0">
```

<!-- sources:
arbol:renderer/packages/design-system/src/overlay/Modal.svelte
-->

## Close button bypasses dismissable

[renderer/packages/design-system/src/overlay/Modal.svelte:52](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/packages/design-system/src/overlay/Modal.svelte#L52)

```text
  52       <button onclick={onClose} aria-label="Close"
  53         style="background:transparent;border:0;color:var(--arbol-color-text-muted);font-size:22px;cursor:pointer;line-height:1;padding:4px">×</button>
  54     </div>
  55     <div style="flex:1 1 auto;min-height:0;padding:var(--arbol-space-5);overflow-y:auto;overflow-x:hidden">{@render children()}</div>
  56     {#if footer}
  57       <div style="display:flex;flex:0 0 auto;justify-content:flex-end;gap:var(--arbol-space-2);
  58                   padding:var(--arbol-space-4) var(--arbol-space-5);border-top:1px solid var(--arbol-color-border)">
  59         {@render footer()}
```

<!-- sources:
arbol:renderer/packages/design-system/src/overlay/Modal.svelte
-->

## Card semantic activation gap

[renderer/packages/design-system/src/components/Card.svelte:17](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/packages/design-system/src/components/Card.svelte#L17)

```text
  17   onmouseenter={() => (hover = true)}
  18   onmouseleave={() => (hover = false)}
  19   role={onclick ? 'button' : undefined}
  20   tabindex={onclick ? 0 : undefined}
  21   style="background:var(--arbol-color-surface);border:1px solid {hover && clickable ? 'var(--arbol-color-text-muted)' : 'var(--arbol-color-border)'};
  22          border-radius:var(--arbol-radius-l);padding:var(--arbol-space-4);
  23          cursor:{clickable ? 'pointer' : 'default'};
  24          box-shadow:{hover && clickable ? 'var(--arbol-shadow-2)' : 'var(--arbol-shadow-1)'};
  25          transition:box-shadow .15s ease, border-color .15s ease, transform .15s ease;
  26          transform:{hover && clickable ? 'translateY(-1px)' : 'none'};{style}"
  27 >
  28   {@render children()}
  29 </div>
```

<!-- sources:
arbol:renderer/packages/design-system/src/components/Card.svelte
-->

## Destructive Enter handler

[renderer/apps/elma/src/chat/branching/ConfirmDialog.svelte:20](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/apps/elma/src/chat/branching/ConfirmDialog.svelte#L20)

```text
  20   $effect(() => {
  21     const onKey = (e: KeyboardEvent) => {
  22       if (e.key === 'Escape') {
  23         e.preventDefault()
  24         e.stopPropagation()
  25         onCancel()
  26       } else if (e.key === 'Enter') {
  27         e.preventDefault()
  28         e.stopPropagation()
  29         onConfirm()
  30       }
  31     }
  32     window.addEventListener('keydown', onKey, true)
  33     return () => window.removeEventListener('keydown', onKey, true)
  34   })
```

<!-- sources:
arbol:renderer/apps/elma/src/chat/branching/ConfirmDialog.svelte
-->

## Provider save split

[renderer/apps/seqoya/src/pages/ip-edit/IntelligenceProviderEditModal.svelte:153](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/apps/seqoya/src/pages/ip-edit/IntelligenceProviderEditModal.svelte#L153)

```text
 153         enabled_thinking_levels: Object.fromEntries(Object.entries(enabledThinkingLevels).filter(([modelId]) => normalizedEnabled.includes(modelId))),
 154         is_global_default: globalDefault,
 155         full_permissions: fullPermissions,
 156       })
 157       await api.setRepoRules(ip.name, defaultRepos, prohibitedRepos)
 158       onSaved()
 159     } finally {
 160       saving = false
 161     }
 162   }
 163
 164   const repoOpts = $derived(repos.map((r) => ({ value: r.path, label: r.name })))
 165   // A repo can't be both default and prohibited — prohibited wins; warn softly.
 166   const conflict = $derived(defaultRepos.filter((r) => prohibitedRepos.includes(r)))
 167   const modelCount = $derived(enabledModels.length)
 168
 169   // --- ModelManagerPopup helpers ---
 170   const enabledSet = $derived(new Set(enabledModels))
 171   const listedModels = $derived([
 172     ...providerModels,
 173     ...[...new Set([model, ...enabledModels])]
 174       .filter((m) => m && !providerModels.some((opt) => opt.value === m))
 175       .map((m) => ({ value: m, label: `${modelLabel(m, family)} (saved)` })),
```

<!-- sources:
arbol:renderer/apps/seqoya/src/pages/ip-edit/IntelligenceProviderEditModal.svelte
-->

## Entity modifier activation

[renderer/packages/design-system/src/entities/EntityChip.svelte:24](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/packages/design-system/src/entities/EntityChip.svelte#L24)

```text
  24   function activate(event: MouseEvent | KeyboardEvent) {
  25     const mouse = event instanceof MouseEvent && event.button === 0
  26     const keyboard = event instanceof KeyboardEvent && event.key === 'Enter'
  27     const navigateRequested = (event.metaKey || modifierPressed) && (mouse || keyboard)
  28     modifierPressed = false
  29     if (!parsed.ok || !navigateRequested) return
  30     event.preventDefault()
  31     event.stopPropagation()
  32     Promise.resolve(navigate(parsed.value)).catch((cause) => {
  33       const error = cause instanceof Error ? cause : new Error(String(cause))
  34       if (onNavigationError) onNavigationError(error)
  35       else window.dispatchEvent(new CustomEvent('arbol-entity-navigation-error', { detail: { error, entity: parsed.value } }))
  36     })
  37   }
  38 </script>
```

<!-- sources:
arbol:renderer/packages/design-system/src/entities/EntityChip.svelte
-->

## Actual Oaken geometry

[renderer/apps/oaken/src/pages/Swimlanes.svelte:71](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/apps/oaken/src/pages/Swimlanes.svelte#L71)

```text
  71   const PADX = 12 // .lanes horizontal padding
  72   const LANEGAP = 8 // gap between swimlanes (and head cells)
  73   const COLW_DEFAULT = 150
  74   const COLW_MIN = 50
  75   const COLW_MAX = 320
  76   const COLW_STEP = 22
  77   const ZOOM_MIN = 0.01
  78   const ZOOM_MAX = 4.5
  79   const EMPTY_DAY_SCALE = 0.5
  80   const timelineAnchorMs = (() => referenceNowMs ?? Date.now())()
  81   const timelineDays = buildTimelineDays(timelineAnchorMs)
  82   const firstDay = timelineDays[0].offset
  83   const lastDay = timelineDays[timelineDays.length - 1].offset
  84
  85   type SwimlanePos = { left: number; width: number; nCols: number; cw: number; swimlane: Swimlane }
```

<!-- sources:
arbol:renderer/apps/oaken/src/pages/Swimlanes.svelte
-->

## Calendar range and weekends

[renderer/apps/oaken/src/time.ts:37](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/apps/oaken/src/time.ts#L37)

```text
  37   const today = new Date(anchorMs)
  38   today.setHours(0, 0, 0, 0)
  39   const start = shiftedMonth(today, -1)
  40   const end = shiftedMonth(today, 1)
  41   const result: TimelineDay[] = []
  42   for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  43     // Weekends are deliberately absent from the board: Friday and Monday are
  44     // adjacent pages, separated by the same compact off-hours gap.
  45     if (d.getDay() === 0 || d.getDay() === 6) continue
  46     // Rounding keeps the calendar offset stable across DST's 23/25-hour days.
  47     const offset = Math.round((d.getTime() - today.getTime()) / 86400000)
  48     result.push({ offset, label: dayLabelFor(d, offset) })
  49   }
  50   return result
  51 }
```

<!-- sources:
arbol:renderer/apps/oaken/src/time.ts
-->

## Renderer route inventory

[renderer/apps/seqoya/src/nav/NavigationPanel.svelte:35](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/apps/seqoya/src/nav/NavigationPanel.svelte#L35)

```text
  35     { id: 'quick-text', label: 'Quick Text' },
  36     { id: 'feature-toggles', label: 'Feature Toggles' },
  37     { id: 'living-topics', label: 'Living Topics' },
  38     { id: 'stewardship', label: 'Stewardship' },
  39     { id: 'blueprints', label: 'Blueprints' },
  40     { id: 'reactions', label: 'Reactions' },
  41     { id: 'organizations', label: 'Organizations' },
  42     { id: 'repos', label: 'Repos' },
  43     { id: 'secrets', label: 'Secrets' },
  44     { id: 'chunks-viewer', label: 'Chunks Viewer' },
  45     { id: 'refresher', label: 'Refresher' },
  46     { id: 'artifacts', label: 'Artifacts' },
  47     { id: 'retrieval', label: 'Retrieval' },
  48     { id: 'monitoring', label: 'Monitoring' },
  49   ]
  50 </script>
  51
  52 {#snippet seqoyaGlyph()}<SeqoyaGlyph />{/snippet}
  53
  54 <div style="display:grid;grid-template-rows:auto minmax(0,1fr);border-right:1px solid var(--arbol-color-border);
```

<!-- sources:
arbol:renderer/apps/seqoya/src/nav/NavigationPanel.svelte
-->

## Native route mismatch

[app/Arbol/GoToPage.swift:21](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/app/Arbol/GoToPage.swift#L21)

```text
  21         .init(id: "willo.comunicados", ui: "willo", uiName: "Willo", name: "Comunicados", page: "comunicados"),
  22         .init(id: "willo.slack", ui: "willo", uiName: "Willo", name: "Slack", page: "slack"),
  23         .init(id: "willo.emails", ui: "willo", uiName: "Willo", name: "Emails", page: "emails"),
  24         .init(id: "willo.blueprint-runs", ui: "willo", uiName: "Willo", name: "Blueprint Runs", page: "runs"),
  25         .init(id: "seqoya.dashboard", ui: "seqoya", uiName: "Seqoya", name: "Dashboard", page: "dashboard"),
  26         .init(id: "seqoya.intelligence-providers", ui: "seqoya", uiName: "Seqoya", name: "Intelligence Providers", page: "intelligence-providers"),
  27         .init(id: "seqoya.brain-recipes", ui: "seqoya", uiName: "Seqoya", name: "Brain Recipes", page: "brain-recipes"),
  28         .init(id: "seqoya.quick-text", ui: "seqoya", uiName: "Seqoya", name: "Quick Text", page: "quick-text"),
  29         .init(id: "seqoya.feature-toggles", ui: "seqoya", uiName: "Seqoya", name: "Feature Toggles", page: "feature-toggles"),
  30         .init(id: "seqoya.living-topics", ui: "seqoya", uiName: "Seqoya", name: "Living Topics", page: "living-topics"),
  31         .init(id: "seqoya.stewardship", ui: "seqoya", uiName: "Seqoya", name: "Stewardship", page: "stewardship"),
  32         .init(id: "seqoya.blueprints", ui: "seqoya", uiName: "Seqoya", name: "Blueprints", page: "blueprints"),
  33         .init(id: "seqoya.reactions", ui: "seqoya", uiName: "Seqoya", name: "Reactions", page: "reactions"),
  34         .init(id: "seqoya.repos", ui: "seqoya", uiName: "Seqoya", name: "Repos", page: "repos"),
```

<!-- sources:
arbol:app/Arbol/GoToPage.swift
-->

## Working-time picker semantics

[renderer/apps/oaken/src/WallPicker.svelte:2](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/renderer/apps/oaken/src/WallPicker.svelte#L2)

```text
   2   /* The shared wall/urgency picker (Set Wall popup + Graft form): a type
   3    * (estimated | due | deadline) + a due time chosen one of three ways —
   4    *   1. Duration   — a span counted in WORKING hours from now (chips + free input)
   5    *   2. Time slot  — absolute working-time slots from the next round hour after now+30m
   6    *   3. Date & time — explicit pickers (date defaults today, time defaults next hour)
   7    * Duration + Time-slot count WORKING hours only (09:00–18:00, skip weekends),
   8    * e.g. +2h at 17:30 ⇒ 10:30 next working day. Date & time is literal.
   9    * `wallType` and the resolved `dueAt` (epoch ms, null while incomplete) are
  10    * bindable; the host owns saving. */
  11   import { Field } from '@arbol/design-system'
  12   import { WICON, addWorkingTime, type WallType } from './time'
```

<!-- sources:
arbol:renderer/apps/oaken/src/WallPicker.svelte
-->

## External dashboard boundary

[app/Arbol/DashboardTimelineBridge.swift:4](https://github.com/sylvan-stack/arbol-design-system/blob/main/heritage/app/Arbol/DashboardTimelineBridge.swift#L4)

```text
   4 @MainActor
   5 final class DashboardTimelineBridge {
   6     static let shared = DashboardTimelineBridge()
   7
   8     static let dashboardBundleIdentifier = "com.arbol.dashboard.mac"
   9     static let submitNotification = Notification.Name("com.arbol.dashboard.mac.timeline.submit")
  10     static let readyNotification = Notification.Name("com.arbol.dashboard.mac.timeline.ready")
  11     static let acceptedNotification = Notification.Name("com.arbol.dashboard.mac.timeline.accepted")
  12     static let rejectedNotification = Notification.Name("com.arbol.dashboard.mac.timeline.rejected")
  13
  14     static let maximumSnapshotBytes = 256 * 1024
  15     static let maximumTaskCount = 500
```

<!-- sources:
arbol:app/Arbol/DashboardTimelineBridge.swift
-->
