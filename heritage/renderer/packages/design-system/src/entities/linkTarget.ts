import { call, callNative } from '../bridge/arbol'
import { ENTITY_REPOS, formatEntityUri, isEntityRepoCode, parseEntityUri, type EntityUri } from './entityUri'
import { ENTITIES, type EntityKind } from './data'

export type EntityLinkReference = {
  repo: string
  kind: EntityKind | string
  entityId: string
  title: string
  uri?: EntityUri | string | null
  /** Resolve a canonical Artifact-backed identity before opening the linker. */
  lookup?: { filePath?: string; corpus?: string; relativePath?: string }
}

export type EntityLinkTarget = EntityUri | string | EntityLinkReference | null | undefined

export type EntityContextMenuItem = {
  label: string
  action: () => void | Promise<void>
  disabled?: boolean
}

export type EntityContextMenuOptions = {
  /** Entity-type/application-specific actions rendered below the shared section. */
  specificItems?: EntityContextMenuItem[]
}

type NativeEndpoint = {
  repo: string
  kind: string
  entity_id: string
  title: string
  uri?: string
}

function directEndpoint(target: Exclude<EntityLinkTarget, string | null | undefined>): NativeEndpoint {
  return {
    repo: target.repo,
    kind: target.kind,
    entity_id: target.entityId,
    title: target.title,
    ...(target.uri ? { uri: String(target.uri) } : {}),
  }
}

async function endpoint(target: Exclude<EntityLinkTarget, null | undefined>): Promise<NativeEndpoint> {
  if (typeof target === 'string') {
    const parsed = parseEntityUri(target)
    if (!parsed.ok) throw new Error(parsed.error)
    return {
      repo: parsed.value.repo,
      kind: parsed.value.kind,
      entity_id: parsed.value.entityId,
      title: parsed.value.title,
      uri: parsed.value.uri,
    }
  }

  // Native UI surfaces already carry stable Entity identity. Only Artifact-
  // backed surfaces need a catalog lookup to translate a path into its durable
  // Entity ID. Keeping the ordinary card/chip path direct also means opening
  // the native popup cannot be blocked by an unnecessary Core round trip.
  if (!target.lookup) return directEndpoint(target)

  const resolved = await call('entity.resolve', {
    kind: target.kind,
    entity_id: target.entityId,
    file_path: target.lookup.filePath,
    corpus: target.lookup.corpus,
    relative_path: target.lookup.relativePath,
  }) as { entity?: Record<string, unknown> | null }
  if (resolved.entity) {
    const value = resolved.entity
    return {
      repo: String(value.repo_name || target.repo),
      kind: String(value.kind || target.kind),
      entity_id: String(value.entity_id || target.entityId),
      title: String(value.title || target.title),
      ...(value.uri ? { uri: String(value.uri) } : {}),
    }
  }
  throw new Error(`${target.title} is not present in the Entity catalog`)
}

/** Open the native relationship flow for any UI surface backed by an Entity. */
export async function openEntityRelationshipSearch(target: EntityLinkTarget): Promise<void> {
  if (!target) return
  const entity = await endpoint(target)
  const result = await callNative('app.showEntityRelationshipSearch', { entity }) as { ok?: boolean; error?: string }
  if (result?.ok === false) throw new Error(result.error || 'Could not open Link Entity')
}

function reportEntityActionError(error: unknown) {
  const value = error instanceof Error ? error : new Error(String(error))
  window.dispatchEvent(new CustomEvent('arbol-entity-navigation-error', { detail: { error: value } }))
}

function reportEntityActionSuccess(message: string, detail: Record<string, unknown> = {}) {
  window.dispatchEvent(new CustomEvent('arbol-entity-action-success', { detail: { message, ...detail } }))
}

async function openNewGraft(target: EntityLinkTarget) {
  if (!target) return
  const entity = await endpoint(target)
  const opened = await callNative('app.open', {
    ui: 'oaken',
    query: {
      page: 'grafts',
      action: 'new-graft',
      source_repo: entity.repo,
      source_kind: entity.kind,
      source_entity_id: entity.entity_id,
      source_title: entity.title,
    },
  }) as { ok?: boolean; error?: string }
  if (opened?.ok === false) throw new Error(opened.error || 'Could not open the New Graft popup')
}

async function addToSpotlight(target: EntityLinkTarget) {
  if (!target) return
  const entity = await endpoint(target)
  const result = await call('spotlight.add', { target: {
    repo: entity.repo, kind: entity.kind, entity_id: entity.entity_id, ...(entity.uri ? { uri: entity.uri } : {}),
  } }) as { added?: boolean }
  reportEntityActionSuccess(result.added === false ? 'Entity is already in Spotlight' : 'Sent entity to Spotlight', { action: 'spotlight', entity })
}

async function entityUriForChat(entity: NativeEndpoint): Promise<EntityUri> {
  if (entity.uri) {
    const parsed = parseEntityUri(entity.uri)
    if (parsed.ok) return parsed.value.uri
  }

  // Most Entity-backed surfaces already have enough identity to format the URI.
  // Prefer the catalog snapshot when available so Artifact path aliases and old
  // titles are normalized before the Entity Card is attached.
  try {
    const resolved = await call('entity.resolve', {
      kind: entity.kind,
      entity_id: entity.entity_id,
    }) as { entity?: { uri?: unknown } | null }
    const uri = typeof resolved.entity?.uri === 'string' ? resolved.entity.uri : ''
    const parsed = parseEntityUri(uri)
    if (parsed.ok) return parsed.value.uri
  } catch {
    // Catalog enrichment is optional for direct, already-stable Entity targets.
  }

  const repo = entity.repo in ENTITY_REPOS
    ? entity.repo as keyof typeof ENTITY_REPOS
    : isEntityRepoCode(entity.repo) ? entity.repo : 'Any'
  return formatEntityUri({ repo, kind: entity.kind as EntityKind, entityId: entity.entity_id, title: entity.title })
}

/** Create a new Chat Session with this Entity attached as an Entity Card Chat Note. */
export async function createEntityChat(target: EntityLinkTarget): Promise<string> {
  if (!target) throw new Error('An Entity is required to open Chat')
  const entity = await endpoint(target)
  const uri = await entityUriForChat(entity)

  let workspaceDirs: string[] = []
  const repoName = entity.repo in ENTITY_REPOS
    ? entity.repo
    : Object.entries(ENTITY_REPOS).find(([, code]) => code === entity.repo)?.[0]
  if (repoName && repoName !== 'Any') {
    try {
      const listed = await call('repos.list', {}) as { repos?: Array<{ name?: string; path?: string }> }
      const repository = (listed.repos || []).find((candidate) =>
        candidate.name?.toLocaleLowerCase() === repoName.toLocaleLowerCase() && candidate.path)
      if (repository?.path) workspaceDirs = [repository.path]
    } catch {
      // Workspace routing enriches the new session but must not prevent Chat.
    }
  }

  const created = await call('chat_session.create', {
    provider: 'claude',
    workspace_dirs: workspaceDirs,
    title: `Chat · ${entity.title}`.slice(0, 240),
  }) as { chat_session_id?: string }
  const id = created.chat_session_id || ''
  if (!id) throw new Error('Core did not return the new Chat Session')

  // A Chat Note containing exactly one Entity URI is rendered by Elma as an
  // Entity Card while preserving the canonical URI as agent-readable context.
  await call('chat_session.add_chat_note', {
    id,
    text: uri,
    surface: { kind: 'ui', name: 'entity-context-menu' },
  })
  const opened = await callNative('app.open', { ui: 'elma', query: { session_id: id } }) as { ok?: boolean; error?: string } | undefined
  if (opened?.ok === false) throw new Error(opened.error || 'Chat Session was created, but Elma could not be opened')
  reportEntityActionSuccess(`Opened Chat for “${entity.title}”`, { action: 'chat', entity, chat_session_id: id })
  return id
}


type LinkedEntity = {
  repo: string
  kind: EntityKind | string
  entity_id: string
  title: string
  uri?: string | null
  relationship_type: string
}

function linkedEntityLabel(entity: LinkedEntity): string {
  const kind = ENTITIES.meta(entity.kind as EntityKind).label.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
  const displayId = entity.kind === 'mr' && !entity.entity_id.startsWith('!') ? `!${entity.entity_id}` : entity.entity_id
  const identity = entity.title.toLocaleLowerCase().startsWith(entity.entity_id.toLocaleLowerCase())
    ? entity.title
    : `${displayId} ${entity.title}`
  const relationship = entity.relationship_type.replace(/[_.:-]+/g, ' ')
  const prefix = ['related', 'related to'].includes(relationship) ? '' : `${relationship} `
  return `${prefix}${kind} ${identity}`
}

async function goToLinkedEntity(entity: LinkedEntity): Promise<void> {
  const response = await call('entity.go_to', {
    kind: entity.kind, entity_id: entity.entity_id,
  }) as { destination?:
    | { type: 'app'; ui: string; query?: Record<string, unknown> }
    | { type: 'link'; kind: 'http' | 'file'; target: string }
    | { type: 'unavailable'; reason?: string }
  }
  const destination = response.destination
  if (!destination || destination.type === 'unavailable') {
    throw new Error(destination?.reason || `No destination is registered for ${entity.kind}`)
  }
  const result = destination.type === 'app'
    ? await callNative('app.open', { ui: destination.ui, query: destination.query || {} })
    : await callNative('link.open', { kind: destination.kind, target: destination.target })
  if (result?.ok === false) throw new Error(result.error || 'Could not open linked Entity')
}

function styleMenuButton(button: HTMLButtonElement) {
  Object.assign(button.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px',
    width: '100%', padding: '8px 10px', border: '0',
    borderRadius: 'var(--arbol-radius-s, 6px)', background: 'transparent',
    color: 'inherit', cursor: button.disabled ? 'default' : 'pointer', textAlign: 'left',
    font: '600 var(--arbol-type-label, 12px)/1.2 var(--arbol-font-ui, sans-serif)',
    opacity: button.disabled ? '.45' : '1',
  })
  button.addEventListener('mouseenter', () => { if (!button.disabled) button.style.background = 'var(--arbol-color-surface-2, rgba(127,127,127,.18))' })
  button.addEventListener('mouseleave', () => { button.style.background = 'transparent' })
}

function makeMenuButton(label: string, action: () => void, disabled = false) {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('role', 'menuitem')
  button.disabled = disabled
  button.textContent = label
  styleMenuButton(button)
  button.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation()
    if (!button.disabled) action()
  })
  return button
}

function makeSeparator() {
  const separator = document.createElement('div')
  separator.setAttribute('role', 'separator')
  Object.assign(separator.style, { height: '1px', margin: '5px 4px', background: 'var(--arbol-color-hairline, rgba(127,127,127,.25))' })
  return separator
}

function menuSurface(label: string) {
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', label)
  Object.assign(menu.style, {
    position: 'fixed', zIndex: '2147483647', minWidth: '210px', padding: '5px',
    border: '1px solid var(--arbol-color-border, rgba(127,127,127,.45))',
    borderRadius: 'var(--arbol-radius-m, 8px)', background: 'var(--arbol-color-surface, #222)',
    boxShadow: 'var(--arbol-shadow-pop, 0 12px 35px rgba(0,0,0,.35))', color: 'var(--arbol-color-text, #fff)',
  })
  return menu
}

async function openSwimlanePicker(target: EntityLinkTarget) {
  if (!target) return
  const entity = await endpoint(target)
  const result = await call('oaken.swimlanes') as { swimlanes?: Array<{ swimlane_id?: string; sid?: string; slot_n?: number; n?: number; title?: string; tkt?: string; swimmers?: unknown[] }> }
  const lanes = result.swimlanes || []
  const backdrop = document.createElement('div')
  Object.assign(backdrop.style, { position: 'fixed', inset: '0', zIndex: '2147483646', display: 'grid', placeItems: 'center', padding: '24px', background: 'rgba(0,0,0,.52)' })
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', 'Send to Swimlane')
  Object.assign(dialog.style, { width: 'min(520px, 100%)', maxHeight: 'min(650px, 90vh)', overflow: 'auto', padding: '18px', border: '1px solid var(--arbol-color-border, #555)', borderRadius: '12px', background: 'var(--arbol-color-surface, #222)', color: 'var(--arbol-color-text, #fff)', boxShadow: '0 20px 60px rgba(0,0,0,.5)', fontFamily: 'var(--arbol-font-ui, sans-serif)' })
  const heading = document.createElement('h2'); heading.textContent = 'Send to Swimlane'; Object.assign(heading.style, { margin: '0 0 4px', fontSize: '18px' })
  const subtitle = document.createElement('p'); subtitle.textContent = `Use “${entity.title}” as the main entity of a new swimmer.`; Object.assign(subtitle.style, { margin: '0 0 15px', color: 'var(--arbol-color-text-muted, #aaa)', fontSize: '13px' })
  const list = document.createElement('div'); Object.assign(list.style, { display: 'grid', gap: '8px' })
  let busy = false
  const run = async (swimlaneId?: string) => {
    if (busy) return
    busy = true
    try {
      const response = await call(swimlaneId ? 'oaken.swimmer.create' : 'oaken.swimlane.create', {
        ...(swimlaneId ? { swimlane_id: swimlaneId } : {}), root_kind: entity.kind,
        root_ref: entity.entity_id, title: entity.title,
      }) as { swimlane?: { swimlane_id?: string } }
      backdrop.remove()
      const laneId = response.swimlane?.swimlane_id || swimlaneId
      await callNative('app.open', { ui: 'oaken', query: { page: 'swimlane', swimlane_id: laneId } })
      reportEntityActionSuccess(swimlaneId ? 'Created swimmer from entity' : 'Created swimlane from entity', { action: 'swimlane', entity })
    } catch (error) { busy = false; reportEntityActionError(error) }
  }
  const create = makeMenuButton('＋ Create new swimlane', () => void run())
  Object.assign(create.style, { border: '1px solid var(--arbol-color-accent, #8aa)', background: 'var(--arbol-color-accent-soft, rgba(127,127,127,.14))' })
  list.appendChild(create)
  for (const lane of lanes) {
    const id = lane.swimlane_id || lane.sid
    if (!id) continue
    const label = `Swimlane ${lane.slot_n || lane.n || '—'} · ${lane.title || lane.tkt || 'Untitled'} (${lane.swimmers?.length || 0})`
    const button = makeMenuButton(label, () => void run(id))
    button.style.border = '1px solid var(--arbol-color-border, #555)'
    list.appendChild(button)
  }
  const close = makeMenuButton('Cancel', () => backdrop.remove()); close.style.marginTop = '12px'
  dialog.append(heading, subtitle, list, close); backdrop.appendChild(dialog); document.body.appendChild(backdrop)
  backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) backdrop.remove() })
  dialog.addEventListener('mousedown', (event) => event.stopPropagation())
  close.focus()
}

let dismissEntityContextMenu: (() => void) | null = null

/** Show the universal Entity menu, followed by optional entity-specific items. */
export function openEntityContextMenu(
  target: EntityLinkTarget, x: number, y: number, options: EntityContextMenuOptions = {},
): void {
  if (!target || typeof document === 'undefined') return
  dismissEntityContextMenu?.()
  const menu = menuSurface('Entity actions')
  menu.dataset.arbolEntityContextMenu = 'true'
  menu.style.left = `${x}px`; menu.style.top = `${y}px`
  let closeMenu = () => {}
  const run = (action: () => void | Promise<void>) => { closeMenu(); Promise.resolve(action()).catch(reportEntityActionError) }
  menu.appendChild(makeMenuButton('Chat', () => run(() => createEntityChat(target))))
  menu.appendChild(makeMenuButton('Link to entity…', () => run(() => openEntityRelationshipSearch(target))))

  const linked = makeMenuButton('Go to Linked Entity', () => {})
  const linkedChevron = document.createElement('span'); linkedChevron.textContent = '›'; linked.appendChild(linkedChevron)
  const linkedSubmenu = menuSurface('Go to Linked Entity')
  linkedSubmenu.style.display = 'none'; linkedSubmenu.style.position = 'fixed'; linkedSubmenu.style.maxWidth = 'min(560px, calc(100vw - 12px))'
  let linkedLoaded = false
  let openChildMenu: HTMLElement | null = null
  const showOnlyChildMenu = (child: HTMLElement) => {
    if (openChildMenu && openChildMenu !== child) openChildMenu.style.display = 'none'
    openChildMenu = child
    child.style.display = 'block'
  }
  const showLinkedSubmenu = () => {
    const rect = linked.getBoundingClientRect(); showOnlyChildMenu(linkedSubmenu)
    document.body.appendChild(linkedSubmenu)
    const place = () => {
      const bounds = linkedSubmenu.getBoundingClientRect()
      linkedSubmenu.style.left = `${Math.max(6, Math.min(rect.right + 4, window.innerWidth - bounds.width - 6))}px`
      linkedSubmenu.style.top = `${Math.max(6, Math.min(rect.top, window.innerHeight - bounds.height - 6))}px`
    }
    place()
    if (linkedLoaded) return
    linkedLoaded = true
    linkedSubmenu.replaceChildren(makeMenuButton('Loading…', () => {}, true)); place()
    void endpoint(target).then((current) => call('entity.linked', {
      entity: { repo: current.repo, kind: current.kind, entity_id: current.entity_id }, limit: 20,
    })).then((response) => {
      const entities = ((response as { entities?: LinkedEntity[] }).entities || []).slice(0, 20)
      linkedSubmenu.replaceChildren()
      if (!entities.length) linkedSubmenu.appendChild(makeMenuButton('No linked Entities', () => {}, true))
      for (const entity of entities) {
        const button = makeMenuButton(linkedEntityLabel(entity), () => run(() => goToLinkedEntity(entity)))
        button.title = linkedEntityLabel(entity)
        linkedSubmenu.appendChild(button)
      }
      place()
    }).catch((error) => {
      linkedSubmenu.replaceChildren(makeMenuButton('Could not load linked Entities', () => {}, true))
      place(); reportEntityActionError(error)
    })
  }
  linked.addEventListener('mouseenter', showLinkedSubmenu); linked.addEventListener('focus', showLinkedSubmenu); linked.addEventListener('click', showLinkedSubmenu)
  menu.appendChild(linked)

  const sendTo = makeMenuButton('Send to', () => {})
  const chevron = document.createElement('span'); chevron.textContent = '›'; sendTo.appendChild(chevron)
  const submenu = menuSurface('Send entity to')
  submenu.style.display = 'none'; submenu.style.position = 'fixed'
  submenu.append(
    makeMenuButton('New Graft', () => run(() => openNewGraft(target))),
    makeMenuButton('Spotlight', () => run(() => addToSpotlight(target))),
    makeMenuButton('Swimlane…', () => run(() => openSwimlanePicker(target))),
  )
  const showSubmenu = () => {
    const rect = sendTo.getBoundingClientRect(); showOnlyChildMenu(submenu)
    document.body.appendChild(submenu)
    const bounds = submenu.getBoundingClientRect()
    submenu.style.left = `${Math.max(6, Math.min(rect.right + 4, window.innerWidth - bounds.width - 6))}px`
    submenu.style.top = `${Math.max(6, Math.min(rect.top, window.innerHeight - bounds.height - 6))}px`
  }
  sendTo.addEventListener('mouseenter', showSubmenu); sendTo.addEventListener('focus', showSubmenu); sendTo.addEventListener('click', showSubmenu)
  menu.appendChild(sendTo)
  if (options.specificItems?.length) {
    menu.appendChild(makeSeparator())
    for (const item of options.specificItems) menu.appendChild(makeMenuButton(item.label, () => run(item.action), !!item.disabled))
  }
  document.body.appendChild(menu)
  const bounds = menu.getBoundingClientRect()
  menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - bounds.width - 6))}px`
  menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - bounds.height - 6))}px`
  const outside = (event: Event) => { if (!menu.contains(event.target as Node) && !submenu.contains(event.target as Node) && !linkedSubmenu.contains(event.target as Node)) closeMenu() }
  const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); closeMenu() } }
  closeMenu = () => {
    menu.remove(); submenu.remove(); linkedSubmenu.remove()
    window.removeEventListener('pointerdown', outside, true)
    window.removeEventListener('blur', closeMenu)
    window.removeEventListener('keydown', keydown, true)
    if (dismissEntityContextMenu === closeMenu) dismissEntityContextMenu = null
  }
  dismissEntityContextMenu = closeMenu
  queueMicrotask(() => {
    if (!menu.isConnected) return
    window.addEventListener('pointerdown', outside, true); window.addEventListener('blur', closeMenu); window.addEventListener('keydown', keydown, true)
    menu.querySelector<HTMLButtonElement>('button')?.focus()
  })
}

/** Compatibility alias retained for existing hosts. */
export const openEntityLinkContextMenu = openEntityContextMenu

/**
 * Svelte action for Entity-backed chips, cards, rows, and detail surfaces.
 * Control+click opens the linker directly. An ordinary right-click exposes a
 * visible “Link Entity…” menu item, which also makes the feature independently
 * testable when WebKit's macOS Control+click translation is unreliable.
 *
 * Nested Entity targets form boundaries: acting on a chip inside a card always
 * uses the chip's Entity, never the containing Entity.
 */
export function entityLinkTarget(node: HTMLElement, initial: EntityLinkTarget) {
  let target = initial
  let lastPointerOpen = 0
  node.dataset.arbolEntityLinkBoundary = 'true'

  const ownsEvent = (event: Event) => {
    const boundary = event.composedPath().find((item) =>
      item instanceof HTMLElement && item.dataset.arbolEntityLinkBoundary === 'true')
    return boundary === node
  }
  const open = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    void openEntityRelationshipSearch(target).catch(reportEntityActionError)
  }
  const pointerdown = (event: PointerEvent) => {
    if (target && event.button === 0 && event.ctrlKey && ownsEvent(event)) {
      lastPointerOpen = performance.now()
      open(event)
    }
  }
  const click = (event: MouseEvent) => {
    if (target && event.button === 0 && event.ctrlKey && ownsEvent(event)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  const keydown = (event: KeyboardEvent) => {
    if (target && event.key === 'Enter' && event.ctrlKey && ownsEvent(event)) open(event)
  }
  const contextmenu = (event: MouseEvent) => {
    if (!target || !ownsEvent(event)) return
    if (event.ctrlKey) {
      // WebKit normally reports Control+click as primary pointerdown followed by
      // contextmenu. Some macOS input devices only expose the latter.
      if (performance.now() - lastPointerOpen > 500) open(event)
      else {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      return
    }
    // A surface with its own menu incorporates Link Entity itself. All other
    // Entity surfaces receive the shared one-item menu automatically.
    if (node.dataset.arbolEntityCustomContextMenu === 'true') return
    event.preventDefault()
    event.stopImmediatePropagation()
    openEntityContextMenu(target, event.clientX, event.clientY)
  }

  node.addEventListener('pointerdown', pointerdown, true)
  node.addEventListener('click', click, true)
  node.addEventListener('keydown', keydown, true)
  node.addEventListener('contextmenu', contextmenu, true)
  return {
    update(value: EntityLinkTarget) { target = value },
    destroy() {
      delete node.dataset.arbolEntityLinkBoundary
      node.removeEventListener('pointerdown', pointerdown, true)
      node.removeEventListener('click', click, true)
      node.removeEventListener('keydown', keydown, true)
      node.removeEventListener('contextmenu', contextmenu, true)
    },
  }
}
