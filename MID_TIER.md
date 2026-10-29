# Mid-tier tests: arbol-design-system

This document lists every retained mid-tier selection with its description, existing tier reason and review status. Descriptions are source-level summaries, not reports of execution. Assertion examples are copied expressions for inspection, not independent proof of quality.

**Provisional means retention still needs review.** An execution-default assignment does not establish useful coverage or justify keeping an obvious or redundant test. Reassess it against its implementation and overlapping cases before execution; delete confirmed low-value cases. Existing individual reviews are preserved. No case is promoted because it moved folders.

Layout based on `f3b7ae6ef21788f39a92e652cb29706a7596898a`. Mid-tier bodies live in [`tests/mid/`](tests/mid/); shared fixtures and compatibility APIs keep their original paths. [Execution policy](TESTS.md) · [All tiers](docs/test-inventory.md) · [Machine-readable inventory](test-tiers.json).

## Source availability and execution

All retained mid-tier bodies were uncommented by explicit owner request under SYL-326. They stay uncommented. Writing or running them still requires a separate testing task; availability is not authorization to execute. Shared unit fixtures keep their original paths. Standalone programs and scenarios retain compatibility entries that preserve their original package and fixture paths; their implementation remains in the mid folder. Product-side test APIs load those sources only on explicit invocation and refuse when the installation lacks the test source.

Use the exact mid selector with the mid folder on PYTHONPATH, or its existing program/qualification entry point, after checking prerequisites and indirect execution. A source restoration is not runtime or full qualification evidence. No tests ran during restoration. Provisional tier reasons remain provisional.

## 17 retained selections

Definitions, scenarios, programs and entry points are separate inventory units; this is not a runtime test count.

### scripts/check-docs.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-docs`](tests/mid/archived/scripts/check-docs.mjs#L1) — Standalone check docs check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-actions.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-actions`](tests/mid/archived/scripts/check-elma-actions.mjs#L1) — Standalone check elma actions check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-composer.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-composer`](tests/mid/archived/scripts/check-elma-composer.mjs#L1) — Standalone check elma composer check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-failures.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-failures`](tests/mid/archived/scripts/check-elma-failures.mjs#L1) — Standalone check elma failures check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-latest.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-latest`](tests/mid/archived/scripts/check-elma-latest.mjs#L1) — Standalone check elma latest check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-lifecycle.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-lifecycle`](tests/mid/archived/scripts/check-elma-lifecycle.mjs#L1) — Standalone check elma lifecycle check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-questions.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-questions`](tests/mid/archived/scripts/check-elma-questions.mjs#L1) — Standalone check elma questions check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-reading.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-reading`](tests/mid/archived/scripts/check-elma-reading.mjs#L1) — Standalone check elma reading check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-repositories.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-repositories`](tests/mid/archived/scripts/check-elma-repositories.mjs#L1) — Standalone check elma repositories check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-response.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-response`](tests/mid/archived/scripts/check-elma-response.mjs#L1) — Standalone check elma response check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma-routing.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma-routing`](tests/mid/archived/scripts/check-elma-routing.mjs#L1) — Standalone check elma routing check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-elma.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-elma`](tests/mid/archived/scripts/check-elma.mjs#L1) — Standalone check elma check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-interactions.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-interactions`](tests/mid/archived/scripts/check-interactions.mjs#L1) — Standalone check interactions check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/check-themes.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`check-themes`](tests/mid/archived/scripts/check-themes.mjs#L1) — Standalone check themes check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/test-all.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`test-all`](tests/mid/archived/scripts/test-all.mjs#L1) — Standalone test all check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/test-storybook.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`test-storybook`](tests/mid/archived/scripts/test-storybook.mjs#L1) — Standalone test storybook check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |

### scripts/verify-catalog.mjs

| Selection and description | Tier justification and review status | Source observations |
| --- | --- | --- |
| [`verify-catalog`](tests/mid/archived/scripts/verify-catalog.mjs#L1) — Standalone verify catalog check program; its combined scenarios are retained together. | Standalone browser, native, installation or qualification program. Its combined checks need a dedicated testing task; the whole program has no individually justified top-tier selection. Review: **program**. | Read the linked body and its shared helpers; no semantic approval inferred. |
