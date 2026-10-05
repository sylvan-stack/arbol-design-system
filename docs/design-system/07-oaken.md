---
role: derived
---
# Oaken

## Observed workspace

Oaken combines a temporal planning board with task/source collections. Top-level work includes Swimlanes, single-lane details, Tasks (Jira, Grafts, Merge Requests), task details/review, plus a separate compact swimlane timer panel. The old UX guide's placeholder and original React prototype are historical. Current Svelte files establish the captured behavior.

<!-- sources:
arbol:renderer/apps/oaken/src/App.svelte
arbol:renderer/apps/oaken/src/pages/Tasks.svelte
arbol:renderer/apps/oaken/src/tasks/TaskNavigation.svelte
arbol:renderer/apps/oaken/src/CompactApp.svelte
arbol:design_handoff_oaken/README.md
-->

## Timeline visual grammar

Preserve the distinctive **time increases upward** board. Swimlanes are workstreams; swimmers are individual tracks. Each track has a start, activity, and optional wall (estimated/due/deadline). Past/spent, future/remaining, planned, blocked and overdue must be distinguishable through labels/patterns as well as color. NOW is the main temporal reference. Typed walls use approximate, due-flag and deadline iconography. Durations/live sessions and point events remain visually different.

| Detail | Current source baseline |
|---|---|
| Daily page | 08:00–20:00; working band 09:00–18:00 |
| Calendar extent | About one calendar month before and after anchor; weekends omitted |
| Night gap | 30 px hatched divider |
| Pool axis | 64 px design baseline |
| Column width | 150 px default; 50–320 px; ±22 px controls |
| Lane gap / horizontal padding | 8 / 12 px |
| Empty lane width | 70 px stub |
| Pool zoom bounds | .01–4.5, with viewport-dependent minimum calculation |
| Empty-day scale | .5 |
| Geometry | Bottom-origin, hour/day mapping; fixed gaps separate scaled day segments |
| Scroll / zoom | Native scroll; drag pan; Cmd/Control-wheel zoom with geometry anchoring |
| State | Saved board view; width/fit/reset controls; user scroll stops NOW-following |

The prototype used a three-day demonstration and a different zoom clamp. Do not copy those values as current behavior. The code's working-time abstraction skips weekends; it is not a universal calendar model.

<!-- sources:
arbol:renderer/apps/oaken/src/time.ts
arbol:renderer/apps/oaken/src/pages/Swimlanes.svelte
arbol:renderer/apps/oaken/src/boardView.ts
arbol:renderer/apps/oaken/src/oaken.css
arbol:design_handoff_oaken/README.md
-->

## Lane details and operations

Lane title drills into wider swimmer columns with Feed/Split presentation and entity activity. Preserve the visible relationship between a time-positioned entity and its track; collision avoidance is part of usability, not decorative polish. A breadcrumb returns to the pool. Board and detail menus expose operations including rename, finish/remove, chat, add/link entity, wall changes and lane positioning where supported.

New Swimlane selects entities through the native Entity Search. The first is MAIN and anchors Swimmer 1; companion entities are linked after creation. The title can default from the main entity. Duplicate existing anchors are prevented and explained. Partial linking failures can occur after successful creation and already have a distinct message—preserve this nuance.

Set Wall and Graft planning use estimated/due/deadline plus duration, time-slot or explicit date/time. Working-duration choices count working time (09:00–18:00, skipping weekends); explicit date/time is literal. The shared and Oaken-specific picker implementations should converge on one contract. The compact panel keeps timers available with open-lane and close actions, refreshes on focus/reconnect and distinguishes loading/error from no active lanes.

<!-- sources:
arbol:renderer/apps/oaken/src/pages/SwimlaneDetails.svelte
arbol:renderer/apps/oaken/src/NewSwimlaneModal.svelte
arbol:renderer/apps/oaken/src/RenameSwimlaneModal.svelte
arbol:renderer/apps/oaken/src/SetWallModal.svelte
arbol:renderer/apps/oaken/src/WallPicker.svelte
arbol:renderer/packages/design-system/src/grafts/WallPicker.svelte
arbol:renderer/apps/oaken/src/CompactApp.svelte
arbol:renderer/apps/oaken/src/CompactSwimlanesPanel.svelte
-->

## Task surfaces

| Page | Observed actions and detail | Successor mapping |
|---|---|---|
| Jira list | Refresh, filters/groups, expand, chat, edit/details, fetch, archive, ignore, create/add to swimlane or open existing swimmer | TaskCollection; explicit distinction between local archive/ignore and upstream ticket state |
| Jira details | Description, ticket information, history, assignee/status changes, fetch logs and same contextual actions | TaskDetail with history and source sync panel |
| Grafts | Native work items; type/status filters, create/edit/delete, mark done, board attachment | TaskCollection + shared Graft EntityEditor |
| Graft editor | Title, description, type, planned start, optional urgency; validates start against wall | One schema for create/edit across Oaken and source inboxes |
| Merge Requests | Import, fetch own open requests, sync and detail entry | TaskCollection with source adapter |
| MR review | Commits, human/general/code comments, focused note and hunk/diff review | ReviewWorkspace using shared diff/hunk components |

The current Oaken Graft wrapper uses the standard shared modal for creation and a local field implementation for editing. This is an especially clear create/edit consolidation opportunity.

<!-- sources:
arbol:renderer/apps/oaken/src/tasks/JiraPage.svelte
arbol:renderer/apps/oaken/src/tasks/JiraTicketDetails.svelte
arbol:renderer/apps/oaken/src/tasks/JiraTicketEditModal.svelte
arbol:renderer/apps/oaken/src/tasks/JiraFetchLogs.svelte
arbol:renderer/apps/oaken/src/tasks/GraftsPage.svelte
arbol:renderer/apps/oaken/src/tasks/GraftModal.svelte
arbol:renderer/apps/oaken/src/tasks/MergeRequestsPage.svelte
arbol:renderer/apps/oaken/src/tasks/MergeRequestReview.svelte
arbol:renderer/packages/design-system/src/hunks/HunkReview.svelte
-->

## Proposed improvements

Keep the timeline as a specialized visualization. Add a List/Agenda alternative that exposes the same swimmers, deadlines and actions to keyboard and assistive-technology users. Show “Future ↑” and explicit date/time labels so the unusual direction is learnable. Add visible Zoom in/out, Fit, Today/NOW and Reset controls; do not require modifier-wheel discovery.

Make working hours, days and timezone explicit user preferences. Display resolved date/time beside relative choices (“2 working hours → Monday 10:30”), including overdue and off-hours cases. Do not imply omitted weekends do not exist; use labeled gaps and an option to show all days. Clock advancement must not steal scroll position after manual navigation.

Replace overloaded row clicking and contextual-only actions with a selected-item inspector and visible More button. Finish swimmer, remove from board, unlink source and delete work item must have distinct labels and consequences. Task lists share the same collection interactions, while the board retains temporal geometry.

## Acceptance

Empty board; populated board; duplicate anchor; multiple entity links with partial failure; planned/blocked/overdue track; wall before start; weekend and DST transition; saved board position after resize; zoom anchored around a night gap; overlapping long labels; Feed/Split; keyboard Agenda; timer panel stale/error recovery; failed ticket fetch; missing MR diff; and large text scaling. Existing Oaken tests and story fixtures are included in the snapshot as a starting regression inventory.

## Captured visual reference

Current Swimlanes component with story fixture data; source-rendered board, not a production task snapshot.

![Current Swimlanes component with story fixture data; source-rendered board, not a production task snapshot.](assets/legacy-oaken-story.png)

Compare the separately authored [successor specimen](reference.html) and see [capture provenance](assets/README.md).
