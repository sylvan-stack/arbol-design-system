# Gallery captures

Captured 5 October 2026 from the **current source design-system gallery**, served locally from `renderer/packages/design-system/gallery/Gallery.svelte`, in headless installed Chrome at 1440×1050 CSS px, device scale 1 and reduced motion. Historical fixture captures included private identity labels; the three identifying gallery screenshots were removed from this sanitized export. No production backend was used. These show legacy implementation, not the proposed unified components.


The screenshots cover shared components, not every app page. Use the chapter's app specifications and source snapshot for the wider inventory. Fonts depend on the historical import being available. The proposed visual reference is separately labeled.

## Fresh source Storybook captures

Built from current source to a temporary output directory. Build completed with existing Svelte state/accessibility and bundle-size warnings; this is not a passing accessibility audit. The remaining images are reviewed component fixtures or design studies; the three identifying gallery screenshots were removed for publication. Exact story IDs and render outcomes are in [storybook-captures.json](../storybook-captures.json).

- [Oaken board fixture](legacy-oaken-story.png) — actual Swimlanes component with fixture data.
- [Elma entity composer](legacy-elma-composer-story.png) — source composer fixture; visible text overlap at the input start is an observed fixture limitation, not desired styling.
- [Willo running station cards](legacy-willo-stations-story.png) — Aurora motion study with source station cards; presentation study, not proof of the current default.
- Entity references `all-components` story failed to render: `Entity title must be non-empty`. No successful image is claimed; the corresponding legacy gallery source remains available as a sanitized reference.
- [Hunk review](legacy-hunk-story.png) — source review definitions showcase.

## Proposed specimens

These are separately authored design sketches, not extracted screenshots:

- [Complete reference](proposed-reference.png)
- [Seqoya](proposed-seqoya.png), [Elma](proposed-elma.png), [Willo](proposed-willo.png), [Oaken](proposed-oaken.png)
- [Shared entity editor](proposed-editor.png)

Use the [interactive HTML](../reference.html) to switch themes, filter records and exercise create/edit behavior. Changes affect fictional in-memory data only and reset on reload.

- [Seqoya Repos fixture](legacy-seqoya-repos-fixture.png) — current Repos component, fictional native-bridge data and captured theme CSS applied by the harness; no surrounding app shell.
