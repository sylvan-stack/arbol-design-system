# Tests: arbol-design-system

Both tiers have uncommented source. Only the top-tier cases below may be selected during implementation. They may be selected when useful during implementation; running tests after every change is not required. Writing or running mid-tier tests requires a separate testing task explicitly requested by the owner. Do not write or restore low-tier tests.

[Mid-tier descriptions and justifications](MID_TIER.md) · [Complete inventory and tier justifications](docs/test-inventory.md) · [Machine-readable inventory](test-tiers.json)

Reviewed revision: `d58f33487f0d2a47a2b42d307e6e5eeea7db8fc7` under SYL-327 (29 October 2026). No tests were run.

## Selection and limits

0 top-tier inventory entries and 9 mid-tier entries are available after the higher-bar review. 8 low-tier entries were removed under SYL-327. Definitions, scenarios, programs and entry points overlap; this is not a runtime suite count. Top-tier bodies are unchanged. Retained mid-tier sources remain uncommented.

## Active top tier

| Exact selector or program | Why this case earns a place |
| --- | --- |

## Layout and shared support

Case bodies are separated into [`tests/top/`](tests/top/) and [`tests/mid/`](tests/mid/). The former mixed test modules retain shared fixture classes, helper functions and imports at their established paths, with no inventoried test methods. This preserves existing subprocess paths, patch targets and fixture imports without copying helpers into both tiers. Compatibility entries preserve original package and resource paths while loading the mid-tier implementation. Product-side test APIs load it only when invoked and refuse if the test source is absent.

## Running a selected top-tier case

Select an exact method when it resolves a concrete uncertainty; no run is required after an edit. The new module names begin with test_top_ so they cannot shadow the shared fixture modules. Do not run whole folders or discovery as a substitute. Original prerequisites, skips and environment limitations still apply. A focused result is not full qualification.

No test in this repository is currently promoted to the top tier.

## Mid-tier execution

[MID_TIER.md](MID_TIER.md) lists the descriptions, tier reasons and review status. The source is now uncommented and stays that way. Writing or running it still requires a separately requested testing task. Do not run tests automatically after edits or merges. Inspect prerequisites and indirect calls before invoking a program or qualification entry point. A focused result is not full qualification.

For a Python method, use the same fixture setup as the top tier, put the mid folder on PYTHONPATH, and select `test_mid_<module>.Class.test_method`. Mycel's fixture-aware runner accepts `--tests tests/mid --select test_mid_<module>.Class.test_method`; store cases require explicit disposable-store settings. Archived scenarios and programs retain their original compatibility entry paths.

Restoration under SYL-326 used static checks only. No tests, Builds, provider calls, Origin migrations or corpus ingest were performed. Original prerequisites and environment limits still apply.
