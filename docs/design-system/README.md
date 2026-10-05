---
role: authored
---
# Design System

> Publication note (7 October 2026): This is a sanitized export of the 5 October design evidence. Personal identities, machine paths and private work examples were replaced with fictional values; three identifying gallery captures were omitted. Original evidence is retained privately. Published hashes describe the sanitized files, not the private original.


A reconstruction kit for the next Arbol, prepared **5 October 2026** from the existing working checkout. Preserve the warm, wood-inspired visual identity, the four complementary workspaces, entity references, readable conversations and temporal planning. Rebuild the repeated interactions around one collection system, one entity editor system and one accessible overlay system.

This chapter documents **design**, not a requirement to retain Arbol's runtime architecture or every feature. It is suitable for a new repository and a different implementation framework.

## Read in this order

| Artifact | What it gives you |
|---|---|
| [Foundations](01-foundations.md) | Identity, exact legacy dimensions, typography, all twelve themes, proposed semantic tokens and responsive rules |
| [Component system](02-components.md) | Reusable primitives, entity presentation, collections, editors, overlays and application recipes |
| [Interaction contracts](03-interactions.md) | Keyboard, focus, state, saving, search, permissions, live updates and accessibility |
| [Seqoya Lab](04-seqoya.md) | All 17 navigation destinations, administration workflows and their successor mapping |
| [Elma Chat](05-elma.md) | Conversation layout, composer, branching, context, documents, inspection and Change Walkthrough |
| [Willo Station](06-willo.md) | Human/agent stations, compact modes, attention, messaging surfaces and run history |
| [Oaken](07-oaken.md) | Timeline geometry, lane operations, task lists, details and review |
| [Native and auxiliary surfaces](08-native-and-auxiliary.md) | Native menus, search/link panels, notifications, permissions, artifact windows and scope boundaries |
| [Audit and decisions](09-audit-and-decisions.md) | Verified inconsistencies, proposed corrections, consolidation map and priorities |
| [Reconstruction and acceptance](10-reconstruction.md) | Build order, screen/state acceptance matrix, preservation instructions and open questions |
| [Visual reference](reference.html) | Offline interactive specimen: twelve historical themes, collection presentations, shared add/edit dialog and four workspace sketches |
| [Evidence](11-evidence.md) | Source excerpts with line numbers; distinction between implementation, historical intention and recommendation |
| [Source inventory](source-inventory.md) | File-level census of the sanitized preserved UI source, organized by surface |
| [Snapshot manifest](snapshot-manifest.json) / [UI source archive](ui-source-snapshot.tar.gz) | Sanitized working-tree files and SHA-256 hashes, including source, tests, native surfaces and original design prototype |

## Evidence and status

**Observed** means inspected in source in `/Users/example/repos/sylvan-stack/arbol`, based on HEAD `a91b8d09a0fd7cfbccf6bc280aaa8bdff03d95ff` **plus existing uncommitted changes**. HEAD alone does not reproduce this baseline; use the archive and manifest. **Historical** means an older guide/prototype, which may disagree with current source. **Proposed** means a design decision for the successor, not a claim about today's application. Acceptance criteria describe future verification, not tests already passed.

The source census covers the four app renderers, the detached artifact renderer, shared design system, native Swift shell, associated UI tests and preview assets. Behavioral review concentrates on routes, layout, component contracts and consequential user actions. It is not an exhaustive line-by-line correctness review of the runtime. Native installed-app behavior, every populated screen and all accessibility combinations have not been exercised. See [validation and open questions](10-reconstruction.md#verification-performed-and-open-questions).

The original [UX/UI guide](https://github.com/sylvan-stack/arbol-design-system/blob/main/docs/ux-ui-guide.md) remains a historical input. Its sparse Oaken section and older descriptions of Willo do not define the successor. Within this chapter, normative **Proposed** rules take precedence over the legacy implementation when rebuilding.

## Validation summary

The original 538-file capture passed archive hash verification before publication anonymization; 149 Source Refs and 611 local links resolved. The offline specimen passed 51 behavior/layout checks. Source fixtures were captured for all four UI areas; one additional Entity References story failed and is documented. Three legacy muted-text theme pairs failed the ordinary-text contrast target. These checks do not establish whole-application or accessibility conformance. See [validation.json](validation.json).

## Chapter maintenance contract

Keep this folder as the single **Design System** chapter. Update the appropriate existing artifact rather than creating parallel specifications. Keep observations separate from proposals; give observed claims section-level `arbol:path` Source Refs, with concrete files rather than directories. Preserve the dated snapshot; a future capture must get a distinct version and a stated reason. Keep sample data fictional. Never include credentials, user conversations or live account data in specimens. Catalog changes belong in the parent `INDEX.md`.

<!-- sources:
arbol:renderer/packages/design-system/src/tokens.css
arbol:renderer/apps/seqoya/src/nav/NavigationPanel.svelte
arbol:renderer/apps/elma/src/App.svelte
arbol:renderer/apps/willo/src/App.svelte
arbol:renderer/apps/oaken/src/App.svelte
arbol:app/Arbol/AppDelegate.swift
-->
