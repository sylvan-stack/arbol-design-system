---
role: derived
---
# Native and auxiliary surfaces

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

The Swift App shows the Arbol oak as an 18-point monochrome template in the macOS menu bar. The icon is labelled Arbol for assistive technology. It opens a native menu with **Roots** and **Quit**. Quit ends the App. The tray is the only surface shown at launch.

The tray opens with three read-only rows above its actions. **Current Root** shows the catalogue’s effective selection by display name and updates after a selection, reset or catalogue read. The row shows “Loading…” during the first read, “None” when there is no working Root, and “Unavailable” when the catalogue cannot be read. If the current Root requires a newer App Build, show its name and the compatibility reason. **Running Build** shows the running App’s hexadecimal Build number and package version, such as “Running Build 3 · v0.1.0”. A standalone preview shows Build 0. Omit the version suffix when unavailable. The row shows the replacement’s identity after a successful handoff. **App built** shows the running App’s build time in local time, or “Unavailable” when its timestamp cannot be read.

When the Build registry offers a newer runnable working App Build, the oak shows a small exclamation badge at its upper right. The tooltip and accessibility label give the Build number. The badge updates with the tray closed. **Start new version** is the first action below the information and shows the same Build number. It starts that prepared Build. The current App keeps the tray until the replacement is ready to take it. A failed handoff leaves the current App available and shows the failure in the tray.

**Roots** opens a submenu of retained Roots in catalogue order. A checkmark marks the same current Root as the header. Selecting a compatible working Root sets the shared current Root for new App opens, global shortcuts and CLI commands without an explicit Root. **Use newest working Root** clears the selection and restores automatic selection. Preparing, failed and App-incompatible Roots show their state or reason and are unavailable for selection. If the catalogue refuses a change, show its reason in the submenu. Reopening the tray refreshes the catalogue.

The **Native adapters / Tray Menu** story uses the same oak image and fictional Roots. Selecting **Quit** removes the icon from the preview.

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
