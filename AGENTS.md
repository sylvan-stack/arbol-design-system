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
6. **Validate within the testing policy.** Follow `/Users/msix/Artifacts/mycel/operations/test-strategy.md`. During implementation, use useful static checks and inspect the changed design. All test work, including top-tier and browser checks, `npm test`, and `npm run test:coverage`, requires a separate testing task explicitly requested by the owner. Only the owner decides when code is ready for tests; do not write, edit or run them during implementation. Inspect build scripts for indirect test execution before using them. Do not add low-tier tests or require a suite at every change or completion. Report actual checks and tests not run honestly.
7. **Deliver a traceable pair.** Follow each repository's contribution and branch rules. Link the application and design-system commits or PRs in their descriptions/handoff, with affected story names and validation results. Use `gh` for GitHub operations. Push the design-system changes when delivery is authorized; a local change must be described as local, not as synchronized remotely. Do not call the design work complete while a required update in either repository remains outstanding.

If access, credentials, a missing application checkout or another dependency prevents synchronization, complete the accessible work, state precisely what remains, and provide a concrete patch or handoff where possible. Never silently skip the design-system update or claim that it was published. A deliberate design-system-only proposal may be implemented here without claiming that applications have adopted it; list any known adoption work.

## Preserve evidence and boundaries

- Change the maintained successor design in `src/`. Keep `heritage/`, the historical source archive, its manifest, original token/theme files, captures and historical measurement reports unchanged. Their hashes and provenance preserve the deprecated application's evidence. Add new evidence separately.
- Keep production credentials, personal data and backend side effects out of stories. Native/external surfaces must retain accurate labels describing what the browser fixture does and does not implement.
- Preserve usable semantics, visible focus, draft recovery and accessible theme contrast when changing appearance. Generalize repeated behavior across affected stories rather than fixing a single screenshot.
- Do not configure CI or publish the private Storybook publicly unless the user explicitly requests it. Local validation is available; `docs/ci/storybook.yml` is only a template.

## Carry this instruction into consuming repositories

An agent working only in an application repository will not automatically read this file. When creating or onboarding an Arbol successor that uses these designs, merge the block from [docs/CONSUMER-AGENTS.md](docs/CONSUMER-AGENTS.md) into that application's root `AGENTS.md`, preserving its existing instructions. Add an equivalent pointer to another agent entrypoint if that project uses one. This makes synchronization discoverable where application changes begin.

## Test execution policy

Follow [TESTS.md](TESTS.md), [MID_TIER.md](MID_TIER.md), the linked inventory and
the owner's [Test Strategy](/Users/msix/Artifacts/mycel/operations/test-strategy.md).
**All test work belongs to a separate task explicitly requested by the owner.**
There is no top-tier exception during implementation. Write and polish code
first; only the owner decides when it is ready for tests and requests that work.
Do not add, edit, fix, refactor, classify, retire, restore or run tests, fixtures,
snapshots, runners or inventories as part of implementation. Existing tests may
be read as source reference. Report relevant test impact; do not start testing,
create a testing task yourself or relabel an implementation step as a testing task.

Keep runnable suites small. A new function, branch or option does not need a
matching test automatically. Each retained case must add distinct consequential
information. Routine permutations, copied defaults, mocked success/forwarding
and redundant CRUD are low tier; use the strategy's examples and admission bar.
Before adding a test in an authorized task, read the nearby retained cases and
low-tier comments so the rejected idea is not recreated.

Keep existing rejected cases as literal comments at the end of their test files,
marked `LOW TIER — DO NOT ENABLE OR RECREATE`, with original ID, reason, retained
evidence when applicable and source revision. An entirely low-tier file is
comment-only. Record low/commented status and footer location in the inventory.
Never use skipped tests, disabled suites or executable wrappers as archives.
New evidence and the owner's testing request are required for re-admission.

Keep retained top/mid source in the repository's documented layout and state.
A separately requested testing/Build task runs the whole top tier through the
Build gate; no test-running Build or hook runs during implementation. Mid-tier
execution additionally requires the owner's request for that scope. Do not
bypass a gate or call a reduced selection full qualification. Test-free static
syntax, type and compilation checks remain available. Report checks not run.
This policy supersedes older automatic testing and top-tier exceptions.
