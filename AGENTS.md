# Agent instructions: Arbol Design System

## Keep application design and this repository in sync

This private repository, `sylvan-stack/arbol-design-system`, is the maintained design reference for Arbol and its successor applications:
https://github.com/sylvan-stack/arbol-design-system

Treat a user-requested design change as work in both the application and this repository. Do not finish by changing only the application. This includes visual styling, tokens, typography, icons, layout, responsive behavior, navigation, component states, forms, validation, dialogs, keyboard/focus behavior, accessibility, and user-facing interaction flows. Pure backend or internal refactors with no observable UI/UX change do not require a design-system change.

Explicit user scope takes precedence. If the user requests an experiment or an application-only exception, respect it and identify the divergence in the handoff. Do not represent a prototype as the accepted shared design.

## Workflow for every design change

1. **Read before changing.** Read this file, `README.md`, `docs/IMPLEMENTATION.md`, and the relevant chapters in `docs/design-system/`. Inspect existing components and stories. When starting in another repository, locate an existing checkout of this repository or clone it with `gh repo clone sylvan-stack/arbol-design-system`. Inspect the branch, remote, status and local instructions in both checkouts; preserve unrelated work.
2. **Find the shared behavior.** Decide whether the change belongs in a token, component, interaction pattern, section, page or native adapter. Extend the existing shared abstraction when the function is the same. For example, lists/tables/cards should share collection behavior, and create/edit forms should share editor mechanics. Preserve meaningful domain differences through explicit variants; avoid near-duplicate controls and unrelated redesigns.
3. **Implement in both places.** Update the application's implementation and the corresponding maintained source under `src/` here. A screenshot, prose note or copied production page alone does not substitute for an executable design-system update. Production services and data stay in application adapters; stories use fictional data and local state. Different application frameworks may implement the same documented contract without copying Svelte code.
4. **Keep the catalog complete.** Add or update the isolated component/pattern story and relevant state variants, then update the affected section and page compositions. Cover the states the change affects: loading, empty/no results, error/retry, read-only, validation, dirty dismissal, successful/failed saving, selection and permissions. Add new exports to `src/index.ts` and update `src/pages/catalog.json` and coverage mappings when applicable. Removed or renamed designs must not leave broken stories or documentation links.
5. **Update the design contract.** Record the resulting behavior and rationale in the relevant design chapter and `docs/IMPLEMENTATION.md` when needed. Keep the corresponding `src/docs/*.mdx` Storybook chapter in sync with edited chapter text. Distinguish historical observations, accepted successor behavior and proposals. Update coverage documentation and catalog counts when they change; do not rewrite old validation reports as if new checks had run.
6. **Validate the changed experience.** Run `npm run check`, `npm run build`, and `npm run test:coverage` for implementation/story changes. Exercise affected interactions and inspect the affected stories/pages visually, including relevant themes, density, narrow layouts, text scaling and keyboard/focus behavior. Run `npm test` for shared tokens, shared interaction behavior or changes spanning multiple pages; add meaningful regression coverage when needed. Documentation-only edits need link/content review, not an unrelated full UI test run. Report actual commands and outcomes, including checks that could not run.
7. **Deliver a traceable pair.** Follow each repository's contribution and branch rules. Link the application and design-system commits or PRs in their descriptions/handoff, with affected story names and validation results. Use `gh` for GitHub operations. Push the design-system changes when delivery is authorized; a local change must be described as local, not as synchronized remotely. Do not call the design work complete while a required update in either repository remains outstanding.

If access, credentials, a missing application checkout or another dependency prevents synchronization, complete the accessible work, state precisely what remains, and provide a concrete patch or handoff where possible. Never silently skip the design-system update or claim that it was published. A deliberate design-system-only proposal may be implemented here without claiming that applications have adopted it; list any known adoption work.

## Preserve evidence and boundaries

- Change the maintained successor design in `src/`. Keep `heritage/`, the historical source archive, its manifest, original token/theme files, captures and historical measurement reports unchanged. Their hashes and provenance preserve the deprecated application's evidence. Add new evidence separately.
- Keep production credentials, personal data and backend side effects out of stories. Native/external surfaces must retain accurate labels describing what the browser fixture does and does not implement.
- Preserve usable semantics, visible focus, draft recovery and accessible theme contrast when changing appearance. Generalize repeated behavior across affected stories rather than fixing a single screenshot.
- Do not configure CI or publish the private Storybook publicly unless the user explicitly requests it. Local validation is available; `docs/ci/storybook.yml` is only a template.

## Carry this instruction into consuming repositories

An agent working only in an application repository will not automatically read this file. When creating or onboarding an Arbol successor that uses these designs, merge the block from [docs/CONSUMER-AGENTS.md](docs/CONSUMER-AGENTS.md) into that application's root `AGENTS.md`, preserving its existing instructions. Add an equivalent pointer to another agent entrypoint if that project uses one. This makes synchronization discoverable where application changes begin.
