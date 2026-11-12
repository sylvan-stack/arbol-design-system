---
role: derived
---
# Native and auxiliary surfaces

## Single-database release (ARC-4)

Use one installation backend and one reusable window each for Elma Chat and Seqoya Lab. Option+E and Option+Q raise those windows. Route a queued open to Elma by chat UUID or workspace intent after protecting its Draft; no Roots menu, Root names or per-Root routing. Keep the installation's compatible Trunk choices for new Exchanges, running Build and health status. Show maintenance, connection loss and Bridge incompatibility distinctly; reconnect to the same installation without silently restarting an Exchange. Preserve the native window, menu and accessibility conventions below.

This applies to the release governed by ARC-4 upon its acceptance. The existing Root-based descriptions below retain their original release scope.

## Native shell and menus

The four named apps share a Swift shell and WKWebView bridge, but have separate identities. Preserve window positioning, traffic-light clearance, dragging and keyboard integration as platform behavior. The tray has health/build information, open-dashboard, restart, rebuild/fix-build, older-build, naming/removal and quit operations. These operational tools should live in a System/Developer area in a smaller successor, not consume the main task interface.

Do not reproduce native traffic lights inside rendered content. Use semantic token values through a native appearance adapter where useful, while retaining native focus and assistive-technology behavior. A web recreation of a native picker is acceptable only if keyboard and navigation semantics remain equivalent.

<!-- sources:
arbol:app/Arbol/AppDelegate.swift
arbol:app/Arbol/ContentView.swift
arbol:app/Arbol/ArbolApp.swift
arbol:app/Arbol/UISwitcherHotkeys.swift
-->

## Arbol menu bar

The Swift App shows the Arbol oak as an 18-point monochrome template in the macOS menu bar. The icon is labelled Arbol for assistive technology. It opens a native menu with **Trunks** and **Quit**. The per-user login launch adds the icon with the menu closed and keeps focus in the active application. Quit ends the resident App.

The tray shows **Current Trunk**, the default for new windows in the current Root, and **Running Build**, the hexadecimal App Build number. The Trunk row shows loading, unavailable and refusal states.

When the Build registry offers a newer runnable working App Build, the oak shows a small exclamation badge at its upper right. The tooltip and accessibility label give the Build number. The badge updates with the tray closed. **Start new version** is the first action below the information and shows the same Build number. It starts that prepared Build. The current App keeps the tray until the replacement is ready to take it. A failed handoff leaves the current App available and shows the failure in the tray.

**Trunks** lists only compatible runnable Trunks by code name. A checkmark marks the default for new windows. The menu is disabled if the catalogue is loading or unavailable or has no eligible Trunks.

Global **Option+E (⌥E)** opens or raises Elma Chat and **Option+Q (⌥Q)** opens or raises Seqoya Lab for the current Root. Arbol refreshes the catalogue before opening and shows the cause in the tray when an open fails. When macOS refuses a shortcut, the tray identifies the unavailable binding. The window header selects a Trunk for that window.

### Root-bound windows

An explicit open raises the existing window for that UI and Root or creates one. The window keeps its Root when the current Root changes. The App supplies the same verified renderer to each Root window. Each window connects to its own Root backend. The shared header uses full-size content beneath the native traffic lights, with a transparent title bar and hidden native title. The header reserves room for the traffic lights. Drag from its background or passive labels to move the window. The Trunk dropdown, preferences, links and title editing keep their own pointer and keyboard actions. The browser preview shows the same header and controls. AppKit handles the window movement. Older or unavailable renderers retain ordinary title-bar clearance. AppKit continues to manage window actions and resize edges. Save window geometry per UI and Root and restore it within a reachable screen.

Use a native status surface while the backend or renderer is loading. Show the cause and **Retry** if the renderer cannot load. When an updated renderer fails verification, keep the existing page usable while showing the failure. Preserve the renderer's recovery state on departure. Closing the final window leaves the tray available.

The **Native adapters / Tray Menu** story models a tray default, independent window Trunk selections, catalogue and selection refusals, and a renderer verification failure with Retry.

## Picker and panel inventory

| Surface | Observed purpose | Proposed shared contract |
|---|---|---|
| Go to Page | Fuzzy app/page search, recent ordering, arrows/Enter and immediate digit choices; initial 620×520 pt | CommandPalette destination mode, backed by the same route registry as navigation |
| Entity Search | Cross-repository URI/title/path search, open/copy/link and context-specific selection; 720×590 pt | EntityPicker; explicit open/select/link modes |
| Relationship picker | Relation type/direction and target selection; a separate panel | RelationshipEditor with a readable source→relation→target sentence |
| Linked Entities | Related records for the most recently visited entity; 650×500 pt | DetailPane Relations section, available through command shortcut |
| Repository Artifacts | Contextual corpus/file search and recent context; 680×590 pt | ArtifactPicker using the shared search/list state model |
| Quick Input | Native fast-entry popup and routing of supplied input | Capture command with explicit interpreted target and result |
| Latest Chat Sessions | Native recent/active-session selector | SessionPicker using the same StationSummary identity and state |
| Detached artifact | Separate renderer/window for file viewing/editing | DocumentView with shared search/history/save policy |
| Compact Oaken timers | Persistent small planning panel | Timeline summary density variant |
| Compact Willo | Keep-on-top/minimal session monitor | StationCollection density variant |

Sizes are historical initial dimensions, not required minimums. Test long labels, localization, large text and constrained screens. A picker should tell the user whether Enter opens a record or selects it into another workflow.

<!-- sources:
arbol:app/Arbol/GoToPage.swift
arbol:app/Arbol/EntitySearch.swift
arbol:app/Arbol/LinkedEntities.swift
arbol:app/Arbol/RepoArtifacts.swift
arbol:app/Arbol/AppDelegate.swift
arbol:renderer/apps/artifact/src/App.svelte
arbol:renderer/apps/oaken/src/CompactApp.svelte
arbol:renderer/apps/willo/src/App.svelte
-->

## Notifications, permissions and sounds

The native notification system includes ordinary/priority notification species, a Comunicado feed panel, debug request panel, permission panel and detached Steward output handling. The feed has active/dismissed state, ordering preference, Clear/Close, a maximum 100-item list and an initial 450×500 pt panel. Debug uses a 620×560 pt panel with Dismiss and Chat. Permission requests use an initially 500×250 pt nonactivating panel, expandable technical detail and decision buttons. These are native UI source observations, not screenshots of installed behavior.

Preserve notification origin, purpose and action; standardize decision labels with Elma/Willo. A passive notification can expire; a pending permission must remain recoverable. Keep notification dismissal independent of the underlying task. Avoid stealing input from the user's active application. Store sound preference globally, expose mute and volume conventionally, and retain preview behavior without allowing it to masquerade as task completion.

The archive includes the bundled sound files and their credits. Preserve license/attribution information when moving assets. No account data, stored credentials or live notification content is needed to rebuild these surfaces.

<!-- sources:
arbol:app/Arbol/Comunicado.swift
arbol:app/Arbol/ComunicadoFeedController.swift
arbol:app/Arbol/DebugComunicadoController.swift
arbol:app/Arbol/PermissionComunicadoController.swift
arbol:app/Arbol/StewardOutputController.swift
arbol:renderer/packages/design-system/src/chrome/CompletionSoundToggle.svelte
arbol:app/resources/sounds/CREDITS.md
-->

## Documents and embedded third-party content

The detached artifact renderer supports Markdown/frontmatter/Blueprint and plain text, history, find with match navigation, editing, saving and error feedback. Elma's SidePanel implements related capabilities separately. Seqoya Artifacts adds the corpus/file tree and disk operations. Consolidate their document controller, while keeping each host's navigation context and window behavior.

WebMail embeds Gmail in native WebKit and supports the email integration. Gmail's own UI is third-party and changes independently; preserve Arbol's launch, selected-source, loading, authentication and error wrapper, not a cloned Gmail design. This research did not access the user's live mail.

<!-- sources:
arbol:renderer/apps/artifact/src/App.svelte
arbol:renderer/apps/elma/src/chat/SidePanel.svelte
arbol:renderer/apps/seqoya/src/pages/Artifacts.svelte
arbol:app/Arbol/WebMail.swift
-->

## External dashboard boundary

`DashboardTimelineBridge.swift` opens the separate application `com.arbol.dashboard.mac` and exchanges timeline snapshots. Its actual dashboard UI source is not in the inspected Arbol checkout or adjacent five repositories. This chapter preserves the bridge and records the integration boundary; it does **not** claim to document that external application's screens. If that product must also be recreated, obtain its repository and add a dedicated surface artifact here.

The old `app/resources/index.html` is also preserved as a legacy renderer resource. Source Storybook stories and the design-system gallery are developer/verification surfaces. The original Oaken HTML/React handoff is a prototype with mock data, not another shipped app. Generated `storybook-static`, app bundles and compiled renderer output are excluded from the source snapshot to avoid treating stale builds as source truth.

<!-- sources:
arbol:app/Arbol/DashboardTimelineBridge.swift
arbol:app/resources/index.html
arbol:renderer/.storybook/main.ts
arbol:renderer/packages/design-system/gallery/Gallery.svelte
arbol:design_handoff_oaken/README.md
-->
