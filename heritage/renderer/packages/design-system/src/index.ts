/* @arbol/design-system — the consistency layer for all Arbol UIs (Svelte 5).
 * Import tokens once at app entry: `import '@arbol/design-system/tokens.css'`.
 *
 * Migration note: ported React → Svelte. The bridge + themes are reused as-is
 * (framework-agnostic). Components are .svelte. More primitives (Button, Card,
 * Tabs, Dropdown, MultiSelect, Field, Meter, Badge, KbdHint, Modal, Viewport,
 * BriefPane, entities, ComingSoon) are being ported per-app; this index grows
 * as they land. */

// Framework-agnostic — reused unchanged.
export { call, callNative, subscribe, onCoreDisconnect, onCoreReconnect, bridgeDiagnostic, reportRendererError, installGlobalErrorReporting } from './bridge/arbol'
export type { Reply, StreamEvent } from './bridge/arbol'
export { installGlobalLinks, detectLinks } from './links'
export type { ArbolUI, DetectedLink } from './links'
export { THEMES, DEFAULT_THEME, THEME_STORAGE_KEY } from './themes'
export type { Theme } from './themes'
export { deliverNotificationComunicado, deliverPriorityNotificationComunicado } from './comunicado'
export type { ComunicadoDescriptor, NotificationComunicado } from './comunicado'

// Svelte components.
export { default as UIShell } from './chrome/UIShell.svelte'
export { default as Header } from './chrome/Header.svelte'
export { default as ThemeSwitcher } from './chrome/ThemeSwitcher.svelte'
export { default as RingsMark } from './components/RingsMark.svelte'
export { default as Dot } from './components/Dot.svelte'
export { default as Button } from './components/Button.svelte'
export { default as Card } from './components/Card.svelte'
export { default as Tabs } from './components/Tabs.svelte'
export { default as Dropdown } from './components/Dropdown.svelte'
export { default as Badge } from './components/Badge.svelte'
export { default as KbdHint } from './components/KbdHint.svelte'
export { default as Meter } from './components/Meter.svelte'
export type { MeterData } from './components/types'
export { default as Field } from './components/Field.svelte'
export { default as MultiSelect } from './components/MultiSelect.svelte'
export { default as PermissionDecisionActions } from './components/PermissionDecisionActions.svelte'
export { default as DateTimePicker } from './components/DateTimePicker.svelte'
export { TIME_OFFSETS_MINUTES, addDays, formatOffset, parseDateInput, parseTimeInput, roundToFiveMinutes, sameLocalDate, startOfWeek } from './components/datetime'
export { default as Viewport } from './chrome/Viewport.svelte'
export { default as ShellInsignia } from './chrome/ShellInsignia.svelte'
export { default as BriefPane } from './chrome/BriefPane.svelte'
export { default as Modal } from './overlay/Modal.svelte'
export { default as ComingSoon } from './ComingSoon.svelte'
export { default as GraftModal } from './grafts/GraftModal.svelte'
export { default as GraftTimePicker } from './grafts/TimePicker.svelte'
export { default as GraftWallPicker } from './grafts/WallPicker.svelte'
export { GRAFT_TYPES, createGraft } from './grafts/grafts'
export { graftPayload } from './grafts/payload'
export type { Graft, GraftDraft, GraftSource, GraftType } from './grafts/grafts'

// Entities (ux-ui-guide §1.11): data registry (framework-agnostic) + renders.
export { ENTITIES } from './entities/data'
export type { Entity, EntityKind, EntityShape, EntityKindMeta } from './entities/data'
export { ENTITY_REPOS, parseEntityUri, formatEntityUri, entityIdentityKey, splitEntityUris } from './entities/entityUri'
export type { EntityUri, ParsedEntityUri, EntityUriParts, EntityUriParseResult, EntityUriTextSegment, EntityRepoCode, EntityRepoName } from './entities/entityUri'
export { defaultEntityNavigator } from './entities/navigation'
export type { EntityNavigator } from './entities/navigation'
export type { EntityCardResolver, EntityCardContentFormat } from './entities/card'
export { default as EntityChip } from './entities/EntityChip.svelte'
export { default as EntityRichText } from './entities/EntityRichText.svelte'
export { default as EntityCard } from './entities/EntityCard.svelte'
export { createEntityChat, entityLinkTarget, openEntityContextMenu, openEntityLinkContextMenu, openEntityRelationshipSearch } from './entities/linkTarget'
export type { EntityContextMenuItem, EntityContextMenuOptions, EntityLinkReference, EntityLinkTarget } from './entities/linkTarget'

// Shared chrome helpers.
export { installSharedCmdNumberHotkeys, installSharedWilloPageHotkeys } from './chrome/chrome'
export type { WilloHotkeyPage } from './chrome/chrome'

// Markdown rendering + the shared document viewer/editor (Elma + Seqoya).
export { default as MarkdownDoc } from './markdown/MarkdownDoc.svelte'
export { default as MarkdownBlocks } from './markdown/MarkdownBlocks.svelte'
export { default as InlineMarkdown } from './markdown/InlineMarkdown.svelte'
export { default as CodeBlock } from './markdown/CodeBlock.svelte'
export { default as QuoteBlock } from './markdown/QuoteBlock.svelte'
export { default as ArbolSeparator } from './markdown/ArbolSeparator.svelte'
export { default as JsonCodeBlock } from './markdown/JsonCodeBlock.svelte'
export { default as HighlightedText } from './markdown/HighlightedText.svelte'
export { parseMarkdown } from './markdown/blocks'
export type { AnswerBlock } from './markdown/blocks'
export * from './markdown/markdown'

// Frontmatter — every document's YAML header rendered as a metadata strip
// instead of a raw `---` dump. Blueprints get the richer contract view below.
export { default as Frontmatter } from './markdown/Frontmatter.svelte'
export { parseFrontmatter, splitFrontmatter, parseYamlMap } from './markdown/frontmatter'
export type { FrontmatterData, FrontmatterValue } from './markdown/frontmatter'

// Source Refs — `<!-- sources: … -->` comments stay invisible in rendered docs
// (their design intent; the raw comment used to leak as literal text) unless
// the reader flips the Sources toggle, which lifts them into clickable chips.
export { parseDocMarkdown, hasSourceRefs, countSourceRefs, resolveSourceRef } from './markdown/sourcerefs'

// Blueprint (Mycel typed-function docs) — custom contract rendering. Detection
// is content-based (frontmatter `role: blueprint`); non-blueprints fall back to
// the plain Markdown path at every render site.
export { default as BlueprintDoc } from './markdown/BlueprintDoc.svelte'
export { parseBlueprint, isBlueprint } from './markdown/blueprint'
export type {
  ParsedBlueprint,
  BlueprintMeta,
  BlueprintInput,
  BlueprintOutput,
  BlueprintStep,
} from './markdown/blueprint'

// Blueprint Chain runbooks — the Cells view (each step as a card with kind +
// input → output). Detection is content-based (frontmatter `chain:`); non-chains
// fall back to the plain Markdown path.
export { default as ChainDoc } from './markdown/ChainDoc.svelte'
export { parseChain, isChain } from './markdown/chain'
export type { ParsedChain, ChainMeta, ChainCell, ChainCellKind } from './markdown/chain'

// Reusable reading-width stepper. Persistence remains host-owned.
export { default as ChatWidthControl } from './components/ChatWidthControl.svelte'
export { default as FontSizeControl } from './components/FontSizeControl.svelte'

// Captured code-review snapshots. HunkReview only renders supplied snapshot data.
export { default as HunkReview } from './hunks/HunkReview.svelte'
export { parseHunkPatch, filesFromCapturedPatch } from './hunks/types'
export type { HunkReviewSnapshot, HunkReviewFile, HunkReviewDiscussion, HunkReviewComment, HunkReviewPosition, HunkReviewLine, HunkReviewBlock } from './hunks/types'

// Standard Git comparison-boundary control. Hosts retain Git/RPC ownership.
export { default as DiffViewSwitcher } from './diffs/DiffViewSwitcher.svelte'
export type { DiffView } from './diffs/types'
