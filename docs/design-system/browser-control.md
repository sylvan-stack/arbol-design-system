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

Controls wrap and scroll within their own 272-pixel native toolbar area so Take and close remain accessible with large text. The real page remains a live sibling native view beneath it. Pointer exclusion must remain transparent to presentation. The design component uses semantic theme, surface, focus and status tokens across all twelve catalog themes. The application shell uses the Redwood baseline and system font fallback without external assets. The platform owns native window controls.

## Maintained examples

Components/BrowserControl includes Private, Interactive, SharedPrivate, AgentControl, TakingControl, Unresponsive, Crashed, Unavailable, NoAgents, BusyRefusal, RequestRefused, Loading, Empty, ConcurrentTabs, LongLabel and BrowserPage. The composed page demonstrates local Share/Return, explicit pending Take completion, recovery confirmation, close and independent tabs. Completion/reset buttons are labelled local preview controls; they are not production methods or test machinery.

## Native and production boundary

The browser source binds both shell and website WebContentsViews through checked native creation. Website pages start blocked, use sandbox/context isolation with Node disabled and use the profile website session. Shell uses a separate ephemeral session, restrictive CSP, a classic browser bundle and sandbox-compatible CommonJS preload. Actual sender WebContents, main frame, exact canonical bundled URL and current native window are checked before privileged request parameters. Authenticated handlers and the initial projection exist before shell loading/showing.

The application keeps opaque native ports and recipient-specific projections in the host. Ordinary/restored tabs begin private; a sharing grant is never inherited by an unrelated existing named window. Private agent metadata omits URL/title/navigation/controller label/grant lists and reports agent inputReady false. Optional page-content metadata awaits the classified-content provider. No native binding key, raw automation connection or management capability reaches a renderer.

Paired source publication is separate from usable production assembly. ABR-10 supplies the sole grants/generation/queue/settlement and final-delivery authority; ABR-11 supplies current-document readiness, latched health and explicit recovery; ABR-29 supplies the real signed host/engine/owner/Build/session assembly. Default startup and the native contribution retain pageAdmission false. ABR-12 owns integrated qualification, including native accessibility/presentation, sender/subframe refusal, privacy races, popup limits, concurrent close and real input. Existing Native evidence retains its exact signed package and limitations. Static Svelte/TypeScript/Storybook compilation supplies no runtime or native qualification.

<!-- sources:
arbol-design-system:@code/src/components/BrowserControl.svelte
arbol-design-system:@code/src/sections/browser-control.ts
arbol-design-system:@code/src/pages/ArbolBrowser.svelte
arbol-design-system:@code/src/stories/browser-control.stories.ts
arbol-browser:@code/src/host/windows.ts
arbol-browser:@code/src/host/shell-ipc.ts
arbol-browser:@code/src/host/projections.ts
arbol-browser:@code/src/runtime/bootstrap.ts
-->
