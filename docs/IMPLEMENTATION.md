# Implementation and design decisions

This repository is a design system and an interactive reconstruction catalog. It is independent of Arbol's native host, daemons, credentials, databases and local sockets. Every live action operates on fictional fixture data.

## What to use in the next repository

Import components from `src/index.ts` and the semantic token stylesheet from `src/styles/tokens.css`. Components use Svelte 5 and TypeScript. Stories use native Svelte/Vite Component Story Format; React is not a rendering adapter. Compose a domain page from shared patterns and sections, then supply real data through a separate application adapter.

The source files in `heritage/` are extracted originals. They are intentionally not the successor public API. The archive contains the exact 5 October 2026 working-tree capture, including changes that were not committed in the old repository. `snapshot-manifest.json` records its provenance and hashes. `npm run test:coverage` verifies the extracted source and archive against that manifest.

## Browsing the catalog

| Level | What it contains |
|---|---|
| Start here | Orientation and links to the original chapter and source archive |
| Foundations | Twelve themes, type, spacing, shape, state, identity, motion and layers |
| Components | Each primitive independently, with useful state variants |
| Patterns | Collection, editor, reference, picker, dialog, permission, document and shell mechanics |
| Sections | Domain compositions such as provider accounts, chat response, station card, source inbox and timeline |
| Pages | Every documented workspace destination, including proposed dedicated editors and compact views |
| Native adapters | Browser equivalents for window/palette/notification surfaces; platform behavior is explicitly outside the fixture |
| Heritage | Captures plus the original interactive Oaken board, hunk review and Markdown components |
| Design contracts | The full chapter rendered inside Storybook |

Use the theme, density and text-scale toolbar globally. Viewport resizing is a real layout change. Controls edit component props. Components that maintain a draft intentionally treat initial record props as a starting snapshot; use Storybook's Remount control to reset a fixture.

## Deliberate improvements

- List, table and cards share query, sort, selected identity and editor mechanics. Loading, failure, stale data, empty and no matches have separate examples. Fixture searches state their actual scope.
- Create and edit share fields and validation. Failed saves retain input; partial, conflicting and uncertain outcomes have dedicated stories. Dirty dismissal offers Keep editing or Discard changes.
- Native HTML dialogs contain keyboard focus, make the background inert and restore the trigger. Destructive confirmations focus Cancel. There is no window-wide Enter-to-delete listener.
- Long Blueprint and Brain Recipe edits use a page. Domain restrictions and permissions remain distinct from ordinary field editing.
- Entity identity is separate from execution, attention and ongoing intent. Reading references are ordinary buttons; modifier keys are not required to discover their primary action.
- Read-only source records have no unsupported Edit action. Source inboxes demonstrate reading and curation, not outbound sending.
- The upward timeline has visible zoom controls and an Agenda alternative. The successor section is a bounded design fixture; the full historical calendar geometry, panning and lane-resizing mechanics remain in the interactive heritage board.
- The theme hue ladder is preserved. Semantic foregrounds are revised, Cedar/Evergreen/Driftwood content surfaces are darkened, and Driftwood's canvas is slightly darkened so metadata and state labels remain readable. The original CSS is retained unchanged in the archive. The successor font assets are local.

## Accepted Elma adapter

ElmaFrame composes WorkspaceShell with explicit header/navigation/status snippets; the generic workspace keeps its existing defaults. It implements BKD-2's accepted First Sapling chrome/navigation/preferences and Root states. Production integrations remain external. Its stories are fictional local state, and the historical/proposed wider Elma surfaces are separately documented in the Elma chapter. Consuming applications import a hashed snapshot of these maintained successor sources for independent packaging, with paired source commits and explicit synchronization checks.

Response/ToolCall/SafeMarkdown also consume adapter inputs. Missing production values stay missing: fictional times and tool input/output are provided by stories rather than component defaults. Markdown parsing produces an allowlisted syntax tree with literal HTML/image fallback and app-controlled links. Scrollable code/tool/table regions intentionally use keyboard focus without activation semantics. Browser checks cover actual safety, lazy detail and focus/reading contracts; native delivery remains external.

<!-- sources:
arbol-design-system:src/sections/ElmaFrame.svelte
arbol-design-system:src/sections/Response.svelte
arbol-design-system:src/sections/ResponseReader.svelte
arbol-design-system:src/components/SafeMarkdown.svelte
arbol-design-system:src/styles/tokens.css
arbol-design-system:scripts/check-elma-response.mjs
arbol-design-system:scripts/check-elma-reading.mjs
-->

## Boundaries to implement in an application

The catalog demonstrates visual composition and local interactions. It does not provide backend persistence, authentication, provider catalogs, file uploads, source synchronization, cross-window request resolution, durable draft storage, actual Git operations or production permission enforcement. Notification tests and tool actions are local previews. Avoid wiring a production side effect directly to a Storybook fixture callback.

The SourceInbox, ReviewWorkspace and successor timeline use bounded data to show the composition; the source archive preserves their full original implementation. Native stories preserve anatomy and semantics, not pixel-identical AppKit rendering. The Gmail surface is externally owned. The external dashboard UI was not present in the captured repository, and its story explicitly records that gap.

The broad source-to-story map identifies dedicated replacements, consolidations, page compositions and historical test harnesses. “Consolidated” does not mean a byte-for-byte implementation of every previous behavior. Smaller glyphs, copy actions and layout helpers intentionally share successor primitives.

## Validation

- `npm run check`: successor source and stories, strict TypeScript and Svelte checks. Historical implementations are excluded from this check because the archive preserves known defects.
- `npm run build`: static Storybook, including the interactive heritage components and the full chapter.
- `npm run test:coverage`: every successor component has an isolated story; every page and all 213 legacy Svelte sources have valid catalog references; source hashes match.
- `npm test`: render every story, exercise interaction contracts, scan every page at narrow widths, measure semantic contrast in every theme, and run representative axe checks.

These checks establish specific properties of the fixtures. They are not a full accessibility certification or evidence that native/backend integrations work. The prepared workflow in `docs/ci/storybook.yml` retains the static Storybook and test results as downloadable artifacts when enabled. It is a template, not an active workflow: the available GitHub CLI credential lacks workflow-upload permission. Local checks are fully runnable with `npm test`. The workflow does not publish private designs to a public website.

ResponseReader is the shared bounded scroll owner for accepted Elma pages and the renderer: tail following, user release, completed threshold/Beacon, three semantic reading stops and in-memory offsets. The application supplies snapshot generations and the position map; shared ReadingExample uses only fictional local changes.

Semantic color aliases are resolved at each data-theme boundary. This lets a scoped Elma theme change its actual canvas/panels as well as text, including switching between dark and light ancestors. Font scale and layout tokens remain inherited from their own controls.

Exact JSON presentation uses the pinned lossless-json formatter for bigint adapter values. Protocol decoding, revision validation and persistence belong to the consuming application; the ToolCall ExactRevision story loads its fictional value through a local callback.

The accepted controlled composer shares empty/closed/Draft/loading/busy/error fixtures, exact text ownership and keyboard/focus behavior with the production adapter. Its parent supplies persistence, receipt and scroll callbacks; the component never infers successful sending.

First Sapling AskUserQuestion is controlled by file-confirmed question/answer/refusal state. The app supplies control calls; the shared sections expose no free-text answer and never treat a control reply as the recorded answer. Saved tool ask/answer data can be presented read-only.

First Sapling failed responses keep the plain cause alongside the original code/message and recorded end time. Rate-limit reset times use that end plus retryAfterSeconds and remain fixed as the viewer’s clock moves; a missing end is Not recorded. Sign-in failures show the Driver command without running it. The adapter supplies Retry and Continue callbacks only for the last saved failed Exchange; shared controls can be disabled during unavailable/pending recovery. Retry replaces the same turn in its original folder, while Continue sends proceed in the current chat folder/route and preserves an independently composed Draft. Stories use local fictional callbacks only.

<!-- sources:
arbol-design-system:src/sections/Composer.svelte
arbol-design-system:src/sections/AskUserQuestion.svelte
arbol-design-system:src/sections/ElmaFrame.svelte
arbol-design-system:src/sections/Response.svelte
arbol-design-system:src/sections/elma-response.ts
arbol-design-system:src/sections/ConversationWorkspace.svelte
arbol-design-system:src/fixtures/QuestionExample.svelte
arbol-design-system:src/fixtures/FailureExample.svelte
arbol-design-system:scripts/check-elma-composer.mjs
arbol-design-system:scripts/check-elma-routing.mjs
arbol-design-system:scripts/check-elma-repositories.mjs
arbol-design-system:scripts/check-elma-questions.mjs
arbol-design-system:scripts/check-elma-failures.mjs
-->

Question identifiers are opaque strings. Selection lookup uses own properties so names such as __proto__ remain ordinary question data; outgoing answers preserve their exact identifiers.

First Sapling chat-title edits use controlled InlineRename with the canonical stored title (empty for an untitled chat), Unicode character counting and empty-title removal. Cmd-click or keyboard activation opens the header edit; Return/OK saves and Escape/Cancel dismisses before saving. Saving disables the editor, refusals retain its text and cause, and closing restores focus to the title control. The header remains a heading. Ongoing is a controlled cockpit pill with Alt0 and canonical-result notices. Production adapters own idempotent metadata requests, pending receipts/reload gates and Root/context/publication guards; composed previews use local fictional state.

Quick actions use the controlled shared CommandPalette rows (labels, optional details/shortcuts, disabled state and selection callbacks). Shift-Enter opens the menu; R starts inline rename, A opens archive confirmation and C requests copying the session ID. Arrow/Return and Escape retain modal focus behavior. Archive confirmation saves the current Draft, stops a running response and waits for its saved terminal state before the archived mark. While waiting it remains cancelable; the archive receipt must confirm archivedAt. A refused save/stop/archive keeps the chat and Draft. Successful archive forgets only chat-ID conveniences, then shows the same repository with its independent new-chat Draft. Shared stories simulate these operations locally and explicitly label clipboard/service boundaries.

Latest chats use the same controlled CommandPalette rows over the Elma window until the native panel exists. Ctrl-Shift-Cmd-C opens it; 1–9 and0 choose the first ten, arrows/Return reach every row, and Escape restores the trigger focus. Rows show the canonical title or Unicode placeholder, repository, route, last Exchange state and recorded activity age; absent time is explicitly unrecorded. The application bounds active canonical summaries to100, excludes the current chat, puts Root-local recently shown UUIDs first and otherwise sorts by activity. Snapshots replace state, changed rows merge, archived rows disappear and a fresh snapshot backfills them. UUID ordering is the only cached list convenience. Loading, empty, read failure/retry and selection-saving states stay explicit. The native reference uses the same list behavior with a visible browser-only boundary.

External open requests save the visible Draft and wait for unconfirmed sends/actions before taking the host request. A returned chat UUID or folder remains a Root-local routing target until actual opening succeeds, including across a page reload; no content is cached for this purpose. Concurrent notices are coalesced and processed serially, including a notice received during a take. A failed target read keeps the current transcript/subscription and exposes Retry opening and Dismiss request. A Draft conflict keeps the host request untaken. A visible saving/opening status lasts until the transition finishes and participates in the Build reload barrier. Shared stories simulate completion and refusal locally; actual Swift/Willo integration remains outside the browser fixture.

Shared Notice lines keep literal status/error messages, severity colors and optional standard Button actions together with wrapping at narrow widths. The application and local external-open fixtures use the same Notice source; unknown future attention kinds can reuse this message presentation without introducing a new workflow.
