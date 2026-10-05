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
