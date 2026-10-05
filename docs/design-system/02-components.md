---
role: authored
---
# Component system

This is the **proposed successor contract**. Legacy components are evidence and visual references, not automatically production-ready implementations.

## Composition model

Build four levels: tokens → accessible primitives → reusable interaction patterns → workspace recipes. The shared package owns interaction mechanics; a workspace owns domain fields, permitted actions and data adapters. Native and web controls may look appropriately different while implementing the same semantics.

| Level | Components |
|---|---|
| Foundations | Theme, typography, spacing, radius, elevation, motion, semantic state, icon registry |
| Primitives | Button/IconButton, TextField, TextArea, Checkbox, Switch, Select/Combobox, Tabs, Badge, Meter, Tooltip, Divider |
| Patterns | WorkspaceShell, PageHeader, Collection, EntitySummary, EntityPicker, EntityEditor, DetailPane, OverlayHost, ConfirmAction, AsyncFeedback, DocumentView, PermissionRequest |
| Recipes | ProviderSettings, StationCollection, ConversationWorkspace, SourceInbox, TimelineBoard, TaskCollection, ReviewWorkspace |

Existing shared code already provides buttons, cards, fields, dropdowns, tabs, entity components, markdown and a modal. It has no equivalent complete shared collection/editor contract. Consolidation should build on the useful vocabulary rather than keep all existing variations.

<!-- sources:
arbol:renderer/packages/design-system/src/index.ts
arbol:renderer/packages/design-system/src/components/Card.svelte
arbol:renderer/packages/design-system/src/overlay/Modal.svelte
arbol:renderer/apps/seqoya/src/pages/settingsCrud.css
-->

## Collection: one behavior, several presentations

**Use for:** repositories, organizations, providers, recipes, Quick Text, Living Topics, tasks, stations, runs, search results and operational records. Do not turn a conversation transcript or time-positioned board into a generic CRUD table.

```
PageHeader  title + total + scope                    New <entity>
Toolbar     Search <scope>    Filters    Sort    View: List/Table/Cards
ActiveFilters  chips + Clear all
CollectionBody  loading | error | empty | no matches | rows
CollectionFooter  shown/total + pagination or explicit Load more
DetailPane  selected entity; independently closable
```

The shared state is `query, filters, sort, presentation, density, selectedId, page/cursor`. Domain adapters supply stable IDs, title, subtitle, leading identity, status, metadata, fields/columns, primary action and secondary actions. Capabilities decide which controls appear. Changing presentation must preserve query, sort, selection and scope.

**List** is the default for names and short descriptions; **table** when comparing several attributes; **cards** for richer summaries such as provider usage or running chats. A timeline is a separate recipe. No view chooser when there is only one useful presentation. Use real table semantics for tables, ordinary lists for lists; a grid role is only justified by implemented grid keyboard behavior.

A row has identity → title/subtitle → status → selected metadata → actions. The title is the primary open target. A selection checkbox, disclosure and action menu are separate controls, with no nested button targets. Clicking unused row area may select, but must not unexpectedly edit or run an action. Disclose Edit in a visible action or menu. Sorting, filtering and refresh preserve selection by ID; if removed, choose a predictable neighbor and announce the change.

Search states the actual scope. Use “Search all chats” only for a complete query; retain “Search this page” when that is the true implementation. Empty collection offers creation/import; no matches offers Clear filters; failure offers Retry. Preserve existing records during a refresh failure and mark them stale. Do not show “No records” while still loading.

Selection and opening are distinct. Batch actions appear only with selection and supported operations. Pagination keeps the position visible, reports known totals honestly, and clamps or resets when filters change. New background records use an “N new items” affordance instead of reordering under the pointer.

<!-- sources:
arbol:renderer/apps/seqoya/src/pages/Repos.svelte
arbol:renderer/apps/seqoya/src/pages/BrainRecipes.svelte
arbol:renderer/apps/willo/src/PaginationControls.svelte
arbol:renderer/apps/willo/src/App.svelte
arbol:renderer/apps/oaken/src/tasks/JiraPage.svelte
-->

## Entity presentation and selection

Retain one identity model with stable reference, kind, display title and optional repository/source. Separate it from fetched detail content and transient status. Provide:

| Component | Job |
|---|---|
| EntityReference | Inline token inside prose/composer; selectable and serializable |
| EntitySummary | Reusable title/glyph/subtitle/status content for rows, cards and inspectors |
| EntityCard | Rich preview with explicit actions; not a second navigation model |
| EntityPicker | Search, scope, keyboard result selection, single/multiple mode and clear empty/error states |
| EntityActions | Open, copy reference, link/unlink, inspect, domain actions; destructive operations last |
| RelationshipEditor | Source + relationship + direction + target; explicit resulting sentence |

The legacy registry covers 24 kinds: ticket, graft, MR, commit, Slack, Telegram message/conversation, email, Confluence, Comunicado, chat, artifact, requirement, invariant, glossary, secret, flyer, branch, hunk, Living Topic, mandate, prompt and response. Preserve the registry in the archive; a smaller successor can implement a subset and render unsupported kinds as a neutral, readable reference.

**Change:** ordinary click/Enter opens a reference in reading contexts; Cmd-click opens another view where supported. In an editable composer, the token is selected for editing/removal, with a distinct Open affordance. Legacy chips require a modifier to navigate and advertise Control-click to link; keep these only as optional accelerators. Never make linking dependent on an undiscoverable modifier.

<!-- sources:
arbol:renderer/packages/design-system/src/entities/data.ts
arbol:renderer/packages/design-system/src/entities/EntityChip.svelte
arbol:renderer/packages/design-system/src/entities/EntityCard.svelte
arbol:renderer/packages/design-system/src/entities/entityUri.ts
arbol:app/Arbol/EntitySearch.swift
-->

## EntityEditor: shared create and edit mechanics

Use a shared draft model and the same field definitions for **New X** and **Edit X**. Hosts may be a dialog, sheet or page. The schema supplies field labels, types, defaults, help, validation and visibility; domain services supply loading and submission. Schema-driven mechanics must still permit hand-designed complex field groups.

| Host | When |
|---|---|
| Small dialog | Rename or a short focused edit |
| Medium dialog/sheet | Graft, Quick Text, organization identity, provider basics |
| Full page/detail editor | Blueprint instruction body, ordered recipe rules, large provider model catalog |
| Inline edit | One reversible field, e.g. station title; explicit commit/cancel |

Common anatomy: title and entity identity; optional purpose; scrollable fields; inline help/errors; stable footer with Cancel and **Create X** / **Save changes**. Required fields are marked before submission. Optional fields say optional. Separate “Advanced” configuration from ordinary fields. Switching Create/Edit changes title, defaults and permitted immutable fields, not save semantics.

State machine: `loading → pristine → dirty → validating → saving → success`, with recoverable `load-error`, `validation-error`, `save-error` and `conflict`. Keep values on failure. Focus the first invalid field; provide an error summary for long forms. Dirty close/back/Escape offers Keep editing or Discard changes. Pristine close is immediate. A committed response determines success; uncertain transport outcome must be reconciled before blindly resubmitting. Partial success names what saved and what failed.

One shared date/time input supports typed entry, calendar/time selection, timezone label and validation. The Oaken deadline field composes it with urgency and working-duration presets; it is not another independent date picker. Never silently round a typed exact time. Preserve source timezone/absolute instant and display local time explicitly.

<!-- sources:
arbol:renderer/apps/oaken/src/tasks/GraftModal.svelte
arbol:renderer/packages/design-system/src/grafts/GraftModal.svelte
arbol:renderer/apps/seqoya/src/pages/Organizations.svelte
arbol:renderer/apps/seqoya/src/pages/ip-edit/IntelligenceProviderEditModal.svelte
arbol:renderer/packages/design-system/src/components/DateTimePicker.svelte
arbol:renderer/apps/oaken/src/WallPicker.svelte
-->

## Overlay and feedback families

| Pattern | Contract |
|---|---|
| Modal/sheet | Named dialog; focused entry; contained Tab sequence; background inert; topmost Escape; restored focus |
| Popover | Anchored, collision-aware, portalled; closes before containing dialog; meaningful keyboard entry/exit |
| Menu | Short action list with disabled reasons, keyboard movement and visible trigger |
| Palette | Search + grouped results + shortcuts; chooses actions or destinations through the same command registry |
| ConfirmAction | Object, consequence and explicit action name; Cancel initially focused for irreversible work |
| Toast | Nonblocking acknowledgment; no essential information available only transiently |
| InlineFeedback | Field/operation error adjacent to the affected item; persistent until resolved/dismissed |
| Progress | Named operation, current phase and cancellation only when real; no invented percentage |
| StatusBadge | Label + icon/color; distinguish running, waiting, failed, stale, complete and unread |

A toast is not a permission dialog. A delete confirmation is not an entity editor. An entity preview is not an action menu. Sharing these low-level mechanics does not erase those distinctions.

## Consolidation map

| Existing families | Successor destination |
|---|---|
| `IpCard`, `SubscriptionRow`, settings cards | Collection + EntitySummary + usage extension |
| StationCard / CompactStationCard | One StationSummary with density variants and shared state derivation |
| Jira / Graft / MR cards | TaskCollection with source/type-specific fields |
| BrainRecipes custom modal, QuickText backdrop, shared Modal consumers | EntityEditor + OverlayHost; long rule editor as page |
| Organizations / LivingTopics / Blueprints inline forms | Same editor lifecycle, chosen host based on complexity |
| Elma ConfirmDialog / browser confirm / inline delete prompt | ConfirmAction |
| Oaken and shared Graft WallPicker/TimePicker | DeadlineField + DateTimeInput + WorkingDurationPreset |
| Native EntitySearch / repo selectors / swimmer selector | Shared picker behavior; native/web adapters |
| MarkdownDoc / SidePanel / artifact renderer | DocumentView + shared edit/history/search controller |
| App-specific font controls and header buttons | Shared preference controls / Button variants |

This is a migration map, not an instruction to collapse provider authentication, permission decisions or timeline geometry into one generic form.

<!-- sources:
arbol:renderer/apps/willo/src/StationCard.svelte
arbol:renderer/apps/willo/src/CompactStationCard.svelte
arbol:renderer/apps/seqoya/src/pages/BrainRecipes.svelte
arbol:renderer/apps/seqoya/src/pages/QuickText.svelte
arbol:renderer/apps/elma/src/chat/branching/ConfirmDialog.svelte
arbol:renderer/apps/artifact/src/App.svelte
arbol:renderer/apps/elma/src/chat/SidePanel.svelte
-->
