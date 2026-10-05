// @arbol/events — the shared event contract for the Arbol UIs.
//
// The types below are GENERATED from the Python catalog (the single source of
// truth): daemons/shared/arbol_shared/events/catalog.py → catalog.gen.ts, via
// tools/gen_event_types.py. The build/CI drift gate fails if catalog.gen.ts is
// stale (event-catalog.md §6.5), so the TS contract can never silently diverge.
//
// The pure fold remains exported for Core/contract parity tests and diagnostic
// tooling. Production Chat rendering uses `chatSessionView`, which consumes
// Core's materialized render DTO plus an ephemeral streaming overlay; it does
// not replay durable domain events in WebKit.

export * from './catalog.gen'
export * from './project'
export * from './useProjection'
export { onRenderInvalidation } from './renderInvalidation'
