---
role: authored
---
# Interaction contracts

All rules marked by this document are **proposed successor behavior**; historical evidence is cited to show what motivates them.

## Keyboard and focus

Every visible action works with keyboard alone. Use buttons for actions and links for navigation. A clickable div with `role=button` is insufficient without activation handling. Icon buttons have accessible names; active navigation has `aria-current`; selected tabs expose their selection. Focus rings stay visible in every theme and are not clipped by scroll containers.

Dialog focus enters the title or first relevant field; Tab/Shift-Tab remain within it; Escape closes the top layer; closing returns focus to the trigger or a logical successor. The background is inert. Popovers opened from a dialog participate in its focus boundary. Use a proven primitive or native `<dialog>` with platform verification rather than implementing disconnected global Escape handlers. These rules follow the [WAI modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Legacy `Modal.svelte` supplies visual dimming and `aria-modal`, but no focus trap, initial focus, focus restoration or title association. Its close button calls `onClose` even when `dismissable=false`. Fix the shared primitive before copying it into the new repository.

<!-- sources:
arbol:renderer/packages/design-system/src/overlay/Modal.svelte
arbol:renderer/packages/design-system/src/components/Card.svelte
arbol:renderer/packages/design-system/src/components/Dropdown.svelte
arbol:renderer/packages/design-system/src/components/MultiSelect.svelte
-->

## Command vocabulary and historical shortcuts

| Historical action | Observed shortcut / gesture | Successor treatment |
|---|---|---|
| Summon named UI | Cmd+Option+Shift+Control + S/O/W/E | Preserve optionally; user-configurable and visible in settings |
| Go to Page | Cmd+G in active Arbol app; arrows/Enter; digits 0–9 choose | One route registry also drives navigation and palette |
| Elma new chat for repository | Cmd+1–9; Cmd+0 folder picker | Keep accelerator, show exact target; remove hard-coded personal defaults |
| Elma turn history | Cmd+[ / Cmd+]; Cmd+P opens history | Keep in chat context; label history separately from document Back |
| Elma thinking / provider | Control+Tab / Control+number | Keep only where conflict-free; all choices visible |
| Send chat | Cmd+Enter or Control+Enter | Preserve; plain Enter inserts newline |
| Oaken zoom | Cmd/Control+wheel | Preserve with visible zoom controls and reset |
| Entity open | Cmd-click / modified Enter | Replace default with conventional open behavior outside editors |
| Completion sound | Click mute; hold 450 ms or Down for volume; right-click sound | Add explicit labeled settings entry; preserve accelerators |

A central command registry declares scope, label, enabled reason and binding. The focused editor/overlay gets first refusal; page shortcuts do not fire while typing, selecting text or answering a permission request. Prefer a visible action rather than requiring knowledge of shortcuts. Do not let pressing Enter anywhere in a destructive dialog accept the destructive action.

<!-- sources:
arbol:app/Arbol/UISwitcherHotkeys.swift
arbol:app/Arbol/GoToPage.swift
arbol:renderer/apps/elma/src/nav/NavigationPanel.svelte
arbol:renderer/apps/elma/src/nav/repoNavigation.ts
arbol:renderer/apps/elma/src/chat/Composer.svelte
arbol:renderer/packages/design-system/src/entities/EntityChip.svelte
arbol:renderer/packages/design-system/src/chrome/CompletionSoundToggle.svelte
-->

## State and feedback

Treat data freshness, operation lifecycle and read status as independent dimensions. A completed chat can be unread; a selected chat can be failed; a disconnected view can still display cached content. A spinner means an operation is pending, not that the backend is healthy.

| Situation | Required presentation |
|---|---|
| First load | Skeleton/progress with the region's name; no empty-state flash |
| Refresh | Keep content and selection; discreet progress |
| Empty | Explain what belongs here and offer a relevant next action |
| Filtered empty | State that nothing matches; Clear filters |
| Failure | Plain-language reason + Retry; technical details expandable |
| Disconnected/stale | Persistent connection/freshness label; last update when known |
| Save pending | “Saving…”; duplicate submission prevented; retain draft |
| Save failed | Keep draft, show local error and Retry |
| Concurrent modification | Compare/reload/keep draft; never silently overwrite |
| Partial result | “Created, but 2 links failed”; retry only failed part |
| Removed elsewhere | Explain disappearance; restore focus and selection predictably |

Loading, retries and cancellation must be associated with the entity/operation ID. Ignore stale responses after navigation. Do not close an editor on refresh or let a response from another chat acknowledge the visible chat as read. Elma's draft identity and read-receipt guards are valuable patterns to preserve.

<!-- sources:
arbol:renderer/apps/elma/src/app/draft-cache.ts
arbol:renderer/apps/elma/src/app/read-receipt.ts
arbol:renderer/apps/oaken/src/NewSwimlaneModal.svelte
arbol:renderer/apps/oaken/src/CompactApp.svelte
-->

## Saving and destructive changes

Configuration uses explicit Save/Cancel. Long document editing may autosave, but then must display Saving/Saved/Failed, preserve unsaved text on failure, and protect navigation. Do not mix silent autosave and explicit Save for the same interaction. Rename commits on Enter or a check button, cancels on Escape, and reports errors inline.

Use **Remove from board**, **Unlink**, **Archive chat**, **Delete draft** and **Delete entity** accurately. Name downstream effects. Offer Undo for reversible operations; require consequence confirmation where recovery is unavailable. Keep deletion separate from ordinary Save. The legacy Elma turn-removal flow removes subsequent turns on the branch; the consequence must remain explicit.

<!-- sources:
arbol:renderer/apps/elma/src/chat/SidePanel.svelte
arbol:renderer/apps/elma/src/pages/ElmaPage.svelte
arbol:renderer/apps/willo/src/SessionTitleEditor.svelte
arbol:renderer/apps/oaken/src/App.svelte
-->

## Conversation, live collections and motion

Keep the reading position stable. Follow streaming output only while the user remains at the end; scrolling away disables follow and exposes “Jump to latest”. Restore the selected turn, branch and scroll location per chat. Preserve failed-message attachments during retry and prevent partial attachment loss from silently changing the request.

Running indicators show state without distracting continuous background motion. Honor reduced motion, pause nonessential animation in hidden views and stop it on terminal states. Status must remain understandable without animation, color or sound. Completion sound is optional, shared across surfaces and never the only acknowledgment.

<!-- sources:
arbol:renderer/apps/elma/src/chat/ResponseView.svelte
arbol:renderer/apps/elma/src/app/message-attachments.ts
arbol:renderer/apps/elma/e2e/retry-image.e2e.mjs
arbol:renderer/apps/willo/src/RunningChatBackground.svelte
arbol:renderer/packages/design-system/src/chrome/CompletionSoundToggle.svelte
-->

## Permissions and attention

Permission requests are explicit decisions tied to a named chat and request. Show the proposed action, scope, target and a readable explanation; keep raw command/payload behind Technical details. Single-action approval, durable allowance, rejection and stopping are different actions. Do not replace all of them with a generic “OK”. Only show durable allowance when the request supports it; one-off restrictions remain visible. A request resolved in another window immediately becomes read-only and displays the result.

A notification invites attention; it must not steal keyboard focus or accept on an unrelated Enter key. Keep pending decisions available in the attention inbox until resolved. Shared PermissionDecisionActions is a useful starting pattern, but its native and web presentations need the same labels and scope rules.

<!-- sources:
arbol:renderer/packages/design-system/src/components/PermissionDecisionActions.svelte
arbol:renderer/apps/elma/src/chat/ToolApprovalCard.svelte
arbol:renderer/apps/willo/src/AttentionColumn.svelte
arbol:app/Arbol/PermissionComunicadoController.swift
-->

## Accessibility and responsive acceptance

Target WCAG 2.2 AA for web content: normal text contrast at least 4.5:1, large text 3:1, meaningful non-text indicators 3:1; minimum targets 24×24 CSS px subject to the standard's exceptions. Prefer 32–36 px desktop controls and 44 px touch controls. Validate 200% text resizing, reflow, focus visibility, keyboard operation and status announcements. These are requirements to test, not a certification of the old tokens. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

Charts and timelines need a textual equivalent and keyboard-accessible entity actions. Dragging has buttons or menus as alternatives. Numeric data uses tabular figures; time labels include timezone when ambiguity matters. Preserve visible labels, avoid color-only states, and keep raw technical identifiers secondary to readable names.
