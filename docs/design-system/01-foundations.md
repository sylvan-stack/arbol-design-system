---
role: derived
---
# Foundations

## Identity to preserve

**Observed.** Arbol uses warm, low-chroma surfaces; wood-named brightness themes; soft rounded containers; fine borders; restrained elevation; a humanist UI face paired with monospaced data; tree-ring and app-specific glyphs; and distinct entity colors. The common shell is a 40 px header, flexible content region and 40 px status bar. Native traffic lights need a 98 px header gutter. Navigation defaults to 248 px. These are CSS pixels; native window dimensions are points, not screenshot pixels.

**Proposed.** Retain that visual identity. Use color to explain selection, identity or state. Avoid making every card glow, float or animate. Keep each workspace recognizable by its name and glyph rather than assigning incompatible component styles to each app. Multiple windows remain supported, but window count and process architecture are independent choices.

<!-- sources:
arbol:renderer/packages/design-system/src/tokens.css
arbol:renderer/packages/design-system/src/chrome/UIShell.svelte
arbol:renderer/packages/design-system/src/chrome/Header.svelte
arbol:renderer/packages/design-system/src/chrome/ShellInsignia.svelte
-->

## Exact historical token baseline

The complete unmodified CSS is in [legacy-tokens.css](legacy-tokens.css); the registry is in [legacy-themes.ts](legacy-themes.ts). These files carry all colors, gradients and shadows, including defaults and cascade order. Use them for faithful reconstruction, not guessed hex approximations.

| Role | Legacy value |
|---|---|
| Spacing 1–6 | 4, 8, 12, 16, 24, 32 px |
| Radius small / medium / large | 5 / 9 / 16 px |
| UI font | Hanken Grotesk; then Apple/system sans-serif |
| Data/code font | Spline Sans Mono; then SF Mono/Menlo/system monospace |
| Label / body / title / display | 11.5 / 13.5 / 16 / 22 px × UI scale |
| Content font size | 13.5 px × content scale |
| Header / footer | 40 px |
| Navigation | 248 px |
| Reading width / legacy chat region cap | 720 / 820 px |
| Shadows | `shadow-1`: hairline + tiny shadow; `shadow-2`: 4 px/16 px; `shadow-pop`: 18 px/50 px |

The independent scale variables are `--arbol-font-scale` and `--arbol-content-font-scale`. Elma's adjustable reading width is 600–1680 px, default 720, step 120; this overrides the static reading-width baseline. Not every legacy component consistently scales its own literal sizes.

<!-- sources:
arbol:renderer/packages/design-system/src/tokens.css
arbol:renderer/apps/elma/src/app/chat-width.ts
arbol:renderer/apps/elma/src/App.svelte
arbol:renderer/packages/design-system/src/components/Button.svelte
-->

## Twelve-theme ladder

| Theme ID | Background OKLCH | Accent OKLCH | Registry mode |
|---|---|---|---|
| ironbark | .150 .013 33 | .665 .142 33 | dark |
| bloodwood | .190 .013 20 | .665 .142 20 | dark |
| redwood | .235 .013 42 | .665 .142 42 | dark; default |
| mahogany | .285 .013 66 | .665 .142 66 | dark |
| cedar | .345 .013 98 | .665 .142 98 | dark |
| evergreen | .408 .013 152 | .665 .142 152 | dark |
| driftwood | .478 .013 196 | .665 .142 196 | dark |
| amber | .700 .014 62 | .48 .155 62 | light |
| sandstone | .740 .020 34 | .48 .155 34 | light |
| oat | .808 .020 88 | .48 .155 88 | light |
| birch | .888 .020 44 | .48 .155 44 | light |
| paper | .964 .020 32 | .48 .155 32 | light |

The legacy `:root` mirrors Redwood; each `[data-theme]` override follows it. Keep that order. Theme names and light/dark flags do not establish accessible contrast; validate actual foreground/background pairs, especially muted text, entity chips and mid-brightness themes.

<!-- sources:
arbol:renderer/packages/design-system/src/themes.ts
arbol:renderer/packages/design-system/src/tokens.css
-->

## Measured legacy contrast findings

A browser calculation of opaque text tokens over `color-surface` found muted-text ratios of **3.59:1 in Cedar, 2.74:1 in Evergreen and 2.02:1 in Driftwood**. These fail the 4.5:1 target for ordinary text. Main text on Driftwood's surface was only 4.61:1, leaving little margin. Redwood muted text was 5.47:1. See [raw measurements and method](legacy-contrast.json).

**Proposed correction:** raise secondary-text contrast in Cedar/Evergreen; darken Driftwood's content surfaces or revise its text palette so both primary and secondary text pass. Verify surface-2, hover/selected fills, alpha blends and entity colors separately. Do not fix readability by indiscriminately enlarging all metadata or treating low-contrast text as disabled. The interactive specimen intentionally retains historical theme values for comparison.

<!-- sources:
arbol:renderer/packages/design-system/src/tokens.css
-->

## Proposed token contract

Preserve the legacy base scale, with semantic aliases that every renderer and native adapter consumes:

| Family | Proposed roles and decision |
|---|---|
| Surface | canvas, panel, inset, elevated, selected; map to bg/surface/surface-2/accent-soft |
| Text | primary, secondary, disabled, inverse, link; disabled is distinct from merely secondary |
| Action | primary-fill, primary-ink, secondary-fill, destructive-fill/ink, focus-ring |
| Status | neutral, working, success, warning, failure, attention; always paired with text/icon |
| Controls | compact height 32 px, standard 36 px, touch 44 px; use minimum height and allow growth |
| Collections | row minimum 44 px compact / 56 px comfortable; table 36/44 px; comfortable is default |
| Editor | small 480 px, medium 640 px, large 800 px; width never exceeds viewport minus 32 px |
| Motion | fast 120 ms, ordinary 160 ms, panel 200 ms; static alternative for every animation |
| Layers | base 0, sticky 10, popover 100, modal 200, modal child 210, toast 300; one overlay manager |

New dimensions above are **proposed**, not extracted. Use the existing `color-err` and `color-accent-ink` consistently; remove undocumented variants such as `color-danger`, `color-on-accent` and `shadow-3`, or explicitly define migration aliases. Separate kind colors from state colors: a Ticket keeps its Ticket glyph/hue; a failure is an adjacent status indicator rather than silently changing what its identity color means.

The successor defaults to 14 px body, 12 px metadata, 16 px title and 22 px page heading. Offer the original compact typography as an explicit density preference. Package font assets locally after checking redistribution licenses; keep system fallbacks. The historical CSS imports Google Fonts remotely, so it does not alone guarantee an offline font match.

<!-- sources:
arbol:renderer/packages/design-system/src/tokens.css
arbol:renderer/packages/design-system/src/entities/data.ts
arbol:renderer/apps/seqoya/src/pages/settingsCrud.css
arbol:renderer/apps/seqoya/src/pages/QuickText.svelte
arbol:renderer/packages/design-system/src/components/PermissionDecisionActions.svelte
-->

## Proposed layout grammar

Use `Workspace > Header / Navigation / Main / Inspector / Status` as stable names. Keep the older Layer > Region > Cell vocabulary for precise design discussion, but do not require users to learn coordinates.

At widths above 1200 px, show navigation + main + optional inspector when all remain usable. Between 800 and 1200, collapse navigation on request and make the inspector replace the main pane or appear as a sheet. Below 800, default to one content pane with an explicit Back action. These are starting breakpoints to validate against content, not device detection. Wide tables, timelines and code may scroll horizontally inside their own region; the whole window must not overflow.

Each pane owns one main scroll container. Opening a menu must not clip against it. Navigation, title and editor actions remain reachable at increased text size. Persist layout by workspace, density and text preferences globally with optional workspace overrides, and document reading width separately. Never store draft text or selection under a generic repository-only preference key.

<!-- sources:
arbol:renderer/packages/design-system/src/chrome/UIShell.svelte
arbol:renderer/apps/elma/src/chat/SplitColumns.svelte
arbol:renderer/apps/elma/src/App.svelte
arbol:renderer/apps/oaken/src/App.svelte
arbol:renderer/apps/willo/src/App.svelte
-->
