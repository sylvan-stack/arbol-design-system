---
role: authored
---
# Audit and design decisions

These are **source-grounded design findings**, not findings from a usability study. Impact is an engineering/design judgment. The successor changes below are recommendations adopted for this chapter; the deprecated application has not been modified.

## Verified problems

| ID / priority | Evidence and user consequence | Proposed correction |
|---|---|---|
| DS-01 / foundation | Shared Modal declares `aria-modal` but lacks focus entry/trapping/restoration and a title association. Close button ignores `dismissable`. Users can lose context or dismiss a nominally locked flow. | One overlay primitive with actual modality, named title, close policy and child-overlay handling |
| DS-02 / foundation | Shared Card gives clickable divs button role/tabindex without keyboard activation. Dropdown/MultiSelect do not implement complete select keyboard semantics; MultiSelect hides native checkboxes and nests removable token controls in a button. | Semantic primitives with tested keyboard contracts; use native select where sufficient |
| DS-03 / foundation | Elma ConfirmDialog handles any Enter in a capture-phase window listener as confirm. A focused Cancel button can therefore be overridden. | Cancel initially focused; only the focused explicit action activates; no blanket Enter acceptance |
| DS-04 / foundation | IP editor loading errors only log to console; save uses two sequential operations and no local catch/visible save error. Loading or partial save can be ambiguous. | Load/error/retry state; retained draft; atomic save or explicit partial result |
| DS-05 / high | Shared modal, Quick Text custom backdrop, Brain Recipe custom modal, inline Organizations/Living Topics/Blueprints forms all have different mechanics. | EntityEditor lifecycle with short/long host variants |
| DS-06 / high | Graft creation is shared but Oaken edit repeats fields locally; Oaken/shared wall/time pickers coexist. | Single field schema and DeadlineField, with domain-specific rules |
| DS-07 / high | Legacy EntityChip requires modifier activation while presenting as a link; link creation depends on Control-click behavior. | Ordinary open/Enter in reading views; explicit Link action; special editor-token behavior |
| DS-08 / high | Native GoToPage registry omits Telegram and Organizations while current renderer navigation includes them. | One route catalog for native palette, sidebar and deep links |
| DS-09 / high | Search scope differs: Willo transcript search and Chunks Viewer filter current-page data; other pages search larger scopes. | Scope-labeled query contract; consistent clear/filter/page-reset behavior |
| DS-10 / high | Theme token consumers use undeclared `color-danger`, `color-on-accent` and `shadow-3`, sometimes with raw fallback colors. Small literal typography bypasses shared scales. Measured muted-on-surface contrast is 3.59 / 2.74 / 2.02 in Cedar / Evergreen / Driftwood. | Semantic token lint and documented aliases; text scaling and theme contrast checks |
| DS-11 / medium | Station full/compact, task cards and settings lists have independent summaries/actions. | Shared collection behavior and domain summary variants; keep specialist views |
| DS-12 / medium | SidePanel and detached artifact renderer have separate editing, search and history implementations. | DocumentView/controller shared across hosts with one save policy |
| DS-13 / medium | Multiple global/local storage strategies for theme, font scale and compact presentation. Shared CSS does not imply shared cross-window preference behavior. | Explicit preference scopes, versioning and cross-window synchronization |
| DS-14 / medium | Original guide/prototype omits later pages and describes outdated timeline examples. | This chapter becomes the successor design entry point; preserve the dated historical design evidence, including the documented publication anonymization |

<!-- sources:
arbol:renderer/packages/design-system/src/overlay/Modal.svelte
arbol:renderer/packages/design-system/src/components/Card.svelte
arbol:renderer/packages/design-system/src/components/Dropdown.svelte
arbol:renderer/packages/design-system/src/components/MultiSelect.svelte
arbol:renderer/apps/elma/src/chat/branching/ConfirmDialog.svelte
arbol:renderer/apps/seqoya/src/pages/ip-edit/IntelligenceProviderEditModal.svelte
arbol:renderer/apps/seqoya/src/pages/QuickText.svelte
arbol:renderer/apps/seqoya/src/pages/BrainRecipes.svelte
arbol:renderer/apps/oaken/src/tasks/GraftModal.svelte
arbol:renderer/packages/design-system/src/entities/EntityChip.svelte
arbol:app/Arbol/GoToPage.swift
arbol:renderer/apps/seqoya/src/nav/NavigationPanel.svelte
arbol:renderer/apps/willo/src/App.svelte
arbol:renderer/apps/seqoya/src/pages/ChunksViewer.svelte
arbol:renderer/apps/seqoya/src/pages/settingsCrud.css
arbol:renderer/packages/design-system/src/components/PermissionDecisionActions.svelte
arbol:renderer/apps/elma/src/chat/SidePanel.svelte
arbol:renderer/apps/artifact/src/App.svelte
arbol:design_handoff_oaken/README.md
-->

## Preserve, change, defer

| Preserve | Change | Defer unless needed by successor scope |
|---|---|---|
| Warm surfaces, wood themes, rounded fine borders, UI/data typography | Semantic token drift, tiny default metadata, unchecked contrast | Additional decorative themes |
| Four complementary workspace identities and multi-window use | Duplicated chrome, routes and preferences | Separate processes/bundles as an implementation requirement |
| Entity references and cross-surface navigation | Modifier-only discoverability, inconsistent summaries | Unsupported historical entity kinds beyond readable fallback |
| Explicit account/provider distinction | Nested model-management popup and ambiguous save failures | Full routing system if reduced product does not require it |
| Turn/branch navigation, context and draft continuity | Overloaded context changes; destructive Enter shortcuts | New transcript modes or branching redesign |
| Station/attention overview, compact monitoring | Confused ongoing/running/unread states and intrusive motion | Every source connector |
| Oaken temporal planning language | Hidden gestures, working-time ambiguity, inaccessible board-only interactions | Recreating historical runtime architecture |
| Inspectable files, diffs and technical detail | Repeated document controllers and inconsistent save policy | Deep runtime graph inspectors in an initial reduced product |

## Why these generalizations stop where they do

Lists share selection, search, state and actions, but a chronological conversation has different reading/follow behavior and a timeline encodes geometry. Share EntitySummary, feedback and navigation across them; do not force all three into one Collection component.

Create/edit workflows share draft/validation/save/close behavior, but an account login, a permission decision and a Blueprint instruction editor have different intent. They can reuse fields and overlays without pretending all are entity CRUD. Domain validation remains explicit: for example a planned start cannot exceed its wall, and a prohibited provider route is not an ordinary tag.

Native controls retain native platform semantics. Visual identity comes from consistent hierarchy, naming, density and state—not pixel-identical imitations of web controls inside AppKit.

## Decision register

1. **D1:** Preserve legacy tokens as a frozen reference; ship successor tokens only after accessibility validation.
2. **D2:** Collection interaction state is shared, presentation is an adapter.
3. **D3:** Create/edit use one domain draft schema and shared editor lifecycle.
4. **D4:** The overlay manager owns focus, Escape, layering and dismissal.
5. **D5:** Normal navigation is discoverable without modifiers.
6. **D6:** Operational state, attention state and selection are independent.
7. **D7:** Source freshness and errors are visible; an empty view never substitutes for failure.
8. **D8:** Route/command and preference registries are centralized.
9. **D9:** Specialized timeline, conversation and review views remain specialized.
10. **D10:** Preserve source evidence independently of the old checkout; product scope is chosen separately.

Validate these decisions with real tasks in the successor. This chapter changes the design recommendation, not the current code.
