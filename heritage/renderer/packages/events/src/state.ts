// State-runtime exports: typed DTOs, render snapshots, live overlays and dirty hints.
// Legacy fold/replay diagnostics remain available through the separate index/project entrypoints.
export * from './catalog.gen'
export * from './view'
export * from './useProjection'
export { onRenderInvalidation } from './renderInvalidation'
