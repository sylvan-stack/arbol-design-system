---
role: authored
---
# Browser control

The maintained BrowserControl component is the trusted browser-shell presentation for BRW-2.4 and BRW-2.13. ArbolBrowser composes it with a clearly labelled fictional page. The application adapter supplies actual host state; preview interactions change local data only.

## Owner, privacy and availability

Show the controller, page availability and input readiness separately. User control says **Private**, including when dormant sharing grants exist. Share adds a recipient without returning control. Return names a connected, granted agent and requires an idle, ready page; the host additionally checks native quiescence synchronously. A busy refusal preserves the owner and generation and asks the person to finish or cancel the interaction.

Taking control immediately displays user/private with **Taking control…** and unavailable input. Keep Return, navigation and recovery disabled while draining. Take and close stay reachable independently of ordinary pending work. Stop sharing names each recipient; closing never grants another agent access. No timer, navigation, sign-in or successful preview interaction returns control automatically.

Unresponsive, crashed and unavailable are distinct from the owner. Recovery explains that unsaved page state may be lost, then requires an explicit confirmation. It preserves user control, invalidates old actions and grants no lease. The production host retains original failure history and enforces bounded replacement.

## Navigation, layout and focus

Use named buttons, a labelled address draft and agent selector, ordinary keyboard navigation and visible focus. Page addresses and titles are absent from contract-1 ShellTab/ShellEvent; the address control is explicitly **Open address**, not a fabricated current URL. State refresh preserves that draft. Tab buttons use stable identities and expose the current selection.

Foreground selection is distinct from ordinary pending work. While selecting, fence every tab-target action, including an otherwise eligible Take and Close tab; Close Window/native close remain independent. Consume the real active tab from every accepted versioned snapshot (the host sends it first), keep visual tab order separately and never infer selection from an unversioned reply. First/fallback native activation precedes publication. Ordinary background popups preserve an existing selection. The Selecting example starts with eligible Take and offers separate local selection/pending controls to show that ordinary pending alone does not disable Take.

Controls wrap and scroll within their own 272-pixel native toolbar area so Take and close remain accessible with large text. The real page remains a live sibling native view beneath it. Pointer exclusion must remain transparent to presentation. The design component uses semantic theme, surface, focus and status tokens across all twelve catalog themes. The application shell uses the Redwood baseline and system font fallback without external assets. The platform owns native window controls.

## Maintained examples

The BrowserPage preview suppresses ordinary Copy and Cut in its shell and fictional page. Cut leaves selected note text in place. Paste and normal editing remain available. The production Browser disables the native Edit commands and guards writes to the macOS general clipboard.

Components/BrowserControl includes Private, Selecting, SharedPrivate, AgentControl, TakingControl, Unresponsive, Crashed, Unavailable, NoAgents, BusyRefusal, RequestRefused, Loading, Empty, ConcurrentTabs, LongLabel and BrowserPage. The composed page demonstrates local Share/Return, explicit pending Take completion, recovery confirmation, close and independent tabs. Completion/reset buttons are labelled local preview controls; they are not production methods or test machinery.

## Profile and website tabs

The local Browser preview shows the profile list on the left and tabs for the selected profile across the top. A profile row contains its saved display name and live tab count. At 960 pixels wide and 520 pixels high, it also shows the open website hostnames. Compact windows retain the profile name and count. The list and tab strip can scroll independently. Selecting a profile restores its own selected tab, or shows an empty page area with the address field available. New and close tab actions apply to the active profile. Profile and tab selection use named keyboard-focusable buttons with distinct current and focus states.

BrowserProfiles provides two fictional identities on the same site, an ordinary profile and an empty profile. Switch among them to check that the tab strip and each page draft stay with their profile. The Browser preview and the design examples use the same navigation module and stylesheet. The Browser host owns Chromium sessions and validates the selected profile and tab before accepting a chrome action. The shell receives names, tab identities, and hostnames. The fictional page never signs in or reads actual browser state.

In the signed Browser, use **Profiles** to choose an existing profile and **Open profile** to switch the visible window to that profile. Opening the visible profile again reuses its window. **Create profile** creates a separate empty profile and selects it in the picker. The Signed Browser story demonstrates the workflow with fictional tabs and local page drafts. A profile whose earlier session still holds its owner lock is shown as unavailable and cannot be selected. The fictional Archive profile demonstrates this state, while other profiles remain available.

## One visible profile window

Switching from the signed Browser hides the previous window while keeping its selected tab, drafts and sign-ins. An agent attachment leaves the visible profile alone. An ordinary open leaves a focused or busy Browser window in place until its owner switches profiles.

The Signed Browser story shows one changing window with the same artwork as macOS. The forest-green tile contains a cream globe and a warm navigation arrow. The maintained PNG is an export of the artwork in the signed app icon.

## Native and production boundary

The browser source binds both shell and website WebContentsViews through checked native creation. Website pages start blocked, use sandbox/context isolation with Node disabled and use the profile website session. Shell uses a separate ephemeral session, restrictive CSP, a classic browser bundle and sandbox-compatible CommonJS preload. Actual sender WebContents, main frame, exact canonical bundled URL and current native window are checked before privileged request parameters. Authenticated handlers and the initial projection exist before shell loading/showing.

The application keeps opaque native ports and recipient-specific projections in the host. Ordinary/restored tabs begin private; a sharing grant is never inherited by an unrelated existing named window. Private agent metadata omits URL/title/navigation/controller label/grant lists and reports agent inputReady false. Optional page-content metadata awaits the classified-content provider. No native binding key, raw automation connection or management capability reaches a renderer.

Paired source publication is separate from usable production assembly. ABR-10 supplies the sole grants/generation/queue/settlement and final-delivery authority; ABR-11 supplies current-document readiness, latched health and explicit recovery; ABR-29 supplies the real signed host/engine/owner/Build/session assembly. Default startup and the native contribution retain pageAdmission false. ABR-12 owns integrated qualification, including native accessibility/presentation, sender/subframe refusal, privacy races, popup limits, concurrent close and real input. Existing Native evidence retains its exact signed package and limitations. Static Svelte/TypeScript/Storybook compilation supplies no runtime or native qualification.

<!-- sources:
arbol-design-system:@code/src/components/BrowserControl.svelte
arbol-design-system:@code/src/sections/browser-control.ts
arbol-design-system:@code/src/pages/ArbolBrowser.svelte
arbol-design-system:@code/src/stories/browser-control.stories.ts
arbol-design-system:@code/src/components/browser-profile-navigation.mjs
arbol-design-system:@code/src/pages/BrowserProfiles.svelte
arbol-design-system:@code/src/stories/browser-profile-navigation.stories.ts
arbol-browser:@code/src/demo/browser.cjs
arbol-browser:@code/src/host/windows.ts
arbol-browser:@code/src/host/shell-ipc.ts
arbol-browser:@code/src/host/projections.ts
arbol-browser:@code/src/runtime/bootstrap.ts
-->
