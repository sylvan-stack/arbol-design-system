# Design coverage

This catalog implements the successor design contracts with reusable Svelte components and fictional interactive fixtures. The original visual evidence remains available for fidelity decisions. Components, patterns, sections and pages have separate Storybook entries rather than only an application-sized demo.

## Chapter map

| Design System chapter | Catalog coverage |
|---|---|
| Foundations | Themes, Typography, Spacing and shape, Semantic states, Entity registry, Motion and layers; global theme/density/text controls |
| Components | Dedicated primitive stories; Collection, EntityEditor, EntitySummary, EntityCard, EntityReference, EntityPicker, RelationshipEditor, Modal, ConfirmAction, ActionPopover, AsyncFeedback, DocumentView, PermissionRequest, WorkspaceShell, PageHeader, DetailPane, Preferences |
| Interactions | Editor validation/failure/partial/conflict/uncertain states; dirty dismissal; collection presentation/selection; permission decisions; keyboard navigation; scoped search; reduced motion |
| Seqoya | All 17 documented destinations, account/provider section, ordered recipe editor, typed Blueprint editor, secret replacement, retrieval planning and event inspector |
| Elma | New and active conversation, Composer, Response, PinnedMessage, TurnNavigator, ToolCall, AgentStatus, AskUserQuestion, permission request, attached context, history, session inspector, activity graph, artwork proposal, document panel and change walkthrough |
| Willo | Human/agent stations, steward view, station densities, attention and Spotlight, notifications, Slack/Telegram/email source inboxes, signal-rule preview, runs and run detail |
| Oaken | Timeline, Agenda, lane details, typed deadline field, Jira/Graft/MR collections, review workspace, compact panel; original full board and hunk review preserved live |
| Native/auxiliary | Go to Page, Entity Search, Linked Entities, Repo Artifact Search, Quick Input, Latest Chats, permission panel, tray, notification feed, debug panel, steward output, detached document; explicit external Gmail/dashboard boundaries |
| Audit/decisions | Improvements recorded in IMPLEMENTATION.md; related cases listed below |
| Reconstruction/evidence | Full chapter, original tokens, all source hashes, archive, captures, extracted source and 213-entry source-to-story map |

## Audit decision trace

| Original inconsistency or failure | Concrete successor evidence |
|---|---|
| Modal focus/dismissal | Modal + EntityEditor stories; dirty-Escape and focus-containment browser checks |
| Non-keyboard card/dropdown controls | Button-based entity titles, native Select/Combobox/MultiSelect and collection table/list semantics |
| Blanket Enter-to-delete | ConfirmAction with Cancel-focused entry and ordinary button activation |
| Provider load/save failures | Unknown/expired account examples, explicit AsyncFeedback states, shared editor failure stories |
| Multiple create/edit hosts | Shared EntityEditor; full-page Blueprint and ordered recipe editors |
| Duplicate Graft/time forms | Shared Graft field schema, DateTimeInput and DeadlineField |
| Modifier-only entity navigation | EntityReference ordinary click/Enter; separate ActionPopover |
| Navigation registry drift | Complete workspace page catalog; native palette includes Organizations and Telegram |
| Misleading search scope | Collections say sample scope; stations say this page; inboxes say cached conversations |
| Tokens, typography and contrast | Semantic aliases, bundled fonts, density/text settings, all-theme contrast measurements |
| Repeated card families | EntitySummary and StationSummary composed into collections and pages |
| Repeated document controllers | Shared DocumentView used in Seqoya, Elma and detached-document fixtures |
| Preference inconsistency | Global Storybook controls and one Preferences specification |
| Outdated guide | Current chapter bundled with captures, source map and explicit missing external UI |

## Restoration boundaries

No evidence was available for the external dashboard's interface. The Gmail wrapper owns window chrome, not Gmail's content. Both have explicit boundary stories.

The immutable archive preserves exact historical implementation, including defects. Successor stories intentionally consolidate some small controls. They demonstrate fixture behavior; backend adapters, cross-window state and persistence must be implemented and validated in the new application.

For the disposition of each of the 213 captured Svelte files, see [the source-to-story map](LEGACY-COVERAGE.md). This includes test and preview harnesses as historical evidence rather than claiming they are additional product components.
