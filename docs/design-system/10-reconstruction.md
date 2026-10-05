---
role: authored
---
# Reconstruction and acceptance

> Publication note (7 October 2026): This is a sanitized export of the 5 October design evidence. Personal identities, machine paths and private work examples were replaced with fictional values; three identifying gallery captures were omitted. Original evidence is retained privately. Published hashes describe the sanitized files, not the private original.


## Use this chapter in a new repository

Copy the whole `design-system/` folder or keep it as an external design reference. Start with the README, foundations, components and interaction contracts; then read the workspace being rebuilt. The **Proposed** contracts are the target. Sanitized historical source and exact design tokens are recovery references, including known deficiencies.

The snapshot manifest lists relative paths, byte counts and SHA-256 hashes for the captured working-tree files. `ui-source-snapshot.tar.gz` preserves those files under `source/` and historical guide input under `artifacts/`. It is a source-reference archive, **not** a standalone application backup: daemons, live data, credentials, installed app state and external services are not included. Extract into a reference folder, not over a new implementation.

The HTML [visual reference](reference.html) works offline with fictional sample data. It demonstrates the proposed collection/editor grammar over the legacy themes, with four schematic workspace layouts. It is **not** an actual app screenshot or production component implementation. The [legacy gallery captures](assets/) come from the current source gallery, identified separately. Font fallbacks may differ when the historical remote font import cannot load.

## Recommended build order

1. Token package, icon/kind registry and preferences. Port exact legacy colors for comparison; establish accessible successor foreground pairs.
2. Keyboard-safe Button, fields/selects and overlay manager; named dialog, nested picker and focus tests first.
3. Entity identity/reference/summary + picker; one route/command catalog across windows.
4. Collection and EntityEditor patterns. Prove both with Quick Text and Organizations, plus a provider-settings save failure.
5. Provider/account and repository management if in initial product scope; preserve their distinct identities.
6. Elma composer/drafts/streaming/approval, then documents and diffs. Prove session-switch continuity before adding animation.
7. Willo stations and attention with the same session state and permission records; then compact mode.
8. Oaken task collection, then the timeline and Agenda alternative if planning is retained.
9. Optional knowledge/admin/source integration pages through the shared recipes.

Steps are dependency order, not time estimates or an instruction to rebuild every deprecated capability.

## Acceptance matrix

| Pattern | Required checks |
|---|---|
| Themes/tokens | All twelve legacy themes for comparison; successor contrast pairs, high contrast/reduced motion, offline fallback fonts |
| Shell/navigation | Narrow/medium/wide, keyboard-only, text enlargement, long titles, preference persistence, native traffic lights |
| Collection | Loading, empty, no match, populated, stale/error, sort/filter/page changes, selection retention, long names, row/menu keyboard actions |
| Editor | Create/edit parity, required/invalid fields, loading failure, save failure, double submit, uncertain outcome, conflict, partial success, dirty Escape/back/close |
| Overlay | Initial/restored focus, Tab wrap, background inertness, topmost Escape, nested picker, close policy, accessible name |
| Entity | Unknown/deleted/unavailable entity, copy/open/link, consistent title, source/repository context, editable token removal |
| Chat | Draft per session, switching, multiline/large paste, images, failed retry, branching, scroll-away during stream, approval resolution, visible failure |
| Stations | Running/unread/ongoing distinctions, parent inheritance, current chat cue, current-page search scope, compact/full parity, fresh/stale reconnect |
| Sources | Unauthenticated, syncing, stale retained content, empty source, missing message, pagination/range, ignored recovery, rule test vs activation |
| Documents/diffs | Dirty navigation, failed save, missing/truncated file, history/find, detach parity, large code/table/diff, selected-line discussion |
| Timeline | Keyboard alternative, overlapping labels, zoom/pan/fit/reset, NOW-follow opt-out, off-hours/weekends/DST, overdue/planned/blocked, partial links |
| Native attention | No focus theft, accurate origin, pending request survives notification dismissal, cross-window resolved state, optional sound |

Use visual snapshots for stable named fixtures, interaction tests for behavior and manual keyboard/screen-reader checks for usability. Do not make screenshot equality the only acceptance gate. The source inventory includes historical tests/stories to reveal already-encountered edge cases; their existence does not establish that they currently pass.

## Suggested component showcase cases

Provide each primitive in rest/hover/focus/disabled/busy/error states. Provide Collection with 0, 1, 50 and many records, long/localized labels and delayed responses. Provide EntityEditor with a nested picker, validation errors, dirty close and failed save. Provide representative full pages: Seqoya Providers, Elma selected turn with permission, Willo mixed station groups, and Oaken overdue/planned tracks. Include compact and large-text variants.

## Verification performed and open questions

- Source inspection covered the four renderer entry points, navigation registries, page/control inventory, native controllers, shared primitives, exact tokens and interaction hotspots. File inventory is broader than detailed behavioral review.
- Retrieval was attempted with Mycel; the PATH lookup failed, then `/Users/example/bin/mycel` ran successfully but returned zero code hits. Direct source reads supplied evidence. No index result was treated as proof of absence.
- Existing workspace changes were left in place. The design chapter and catalog references are the deliverable; application code was not intentionally edited.
- Static provenance, archive integrity, local links and specimen behavior are checked in [validation.json](validation.json). Read it for exact results rather than assuming all future acceptance checks passed.
- The legacy gallery, Seqoya Repos fixture and source Storybook fixtures were rendered independently of the production backend. A fresh Storybook build succeeded with existing warnings; its Entity References `all-components` story failed with `Entity title must be non-empty`, recorded in `storybook-captures.json`. These fixtures are not a substitute for four fully populated installed-app screenshots.
- **Open:** external `com.arbol.dashboard.mac` UI source is outside the inspected checkout. Only its Arbol bridge is covered.
- **Open:** exact installed-build parity, native VoiceOver behavior, real-account login/sync, and end-to-end backend operations were not exercised.
- **Open:** all-theme and all-entity-color contrast needs successor validation. A few measured legacy pairs are diagnostic evidence, not exhaustive certification.
- **Open:** font asset availability/licenses should be confirmed before distributing a self-hosted bundle; the archive contains source font declarations and bundled sound credits, not downloaded fonts.
- **Open:** user-configurable working calendars/timezones and successor feature scope need product decisions. The defaults proposed here can guide implementation without restoring the deprecated backend.

<!-- sources:
arbol:renderer/package.json
arbol:renderer/.storybook/main.ts
arbol:renderer/packages/design-system/gallery/Gallery.svelte
arbol:app/Arbol/DashboardTimelineBridge.swift
arbol:renderer/packages/design-system/src/tokens.css
arbol:app/resources/sounds/CREDITS.md
-->
