/* Pure conversation-tree helpers. All conversation mutations in App go through
 * these so the path math lives in ONE place. A turn (node) has a `parentId` and
 * an ordered `children` list; the chat renders the active root→leaf path. None
 * of these mutate their inputs.
 *
 * Mirrors `window.TREE` in the prototype's branching.jsx. */
import type { ActiveChild, TurnMap } from '../../constants'

/* Ancestry root→id (inclusive), following parent pointers. */
export function pathToNode(nodes: TurnMap, id: string): string[] {
  const out: string[] = []
  let x: string | null = id
  while (x && nodes[x]) {
    out.unshift(x)
    x = nodes[x].parentId
  }
  return out
}

/* The active root→leaf id list: at each node follow `activeChild` (an unfollowed
 * fork defaults to its newest/last child) until a leaf. This array plays the role
 * the old flat `turns[]` did. */
export function activePath(nodes: TurnMap, rootId: string | null, activeChild: ActiveChild): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let id = rootId
  while (id && nodes[id] && !seen.has(id)) {
    seen.add(id)
    out.push(id)
    const ch = nodes[id].children || []
    if (!ch.length) break
    let idx = activeChild[id]
    if (idx == null || idx < 0 || idx >= ch.length) idx = ch.length - 1
    id = ch[idx]
  }
  return out
}

/* The `activeChild` patch (`{parentId: childIndex}` per ancestor) that makes
 * `targetId` lie on the active path. */
export function activeChildFor(nodes: TurnMap, targetId: string): ActiveChild {
  const path = pathToNode(nodes, targetId)
  const patch: ActiveChild = {}
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    patch[a] = (nodes[a].children || []).indexOf(b)
  }
  return patch
}

/* `id` + every descendant (for destructive ops). */
export function descendants(nodes: TurnMap, id: string): Set<string> {
  const out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const x = stack.pop() as string
    if (out.has(x) || !nodes[x]) continue
    out.add(x)
    ;(nodes[x].children || []).forEach((c) => stack.push(c))
  }
  return out
}

/* The sibling id list a node belongs to (its alternative branches, itself
 * included). The root's siblings are just the root. */
export function siblings(nodes: TurnMap, rootId: string | null, id: string): string[] {
  const n = nodes[id]
  if (!n) return [id]
  if (!n.parentId) return rootId ? [rootId] : [id]
  // A `parentId` whose node isn't loaded means no VISIBLE parent: a bounded
  // transcript page may omit its real parent, so this turn temporarily stands in
  // as a root. Never dereference the absent parent; older pages can supply it.
  const parent = nodes[n.parentId]
  if (!parent) return [id]
  return parent.children || [id]
}

/* Bundled export mirroring the prototype's `window.TREE`. */
export const TREE = { pathToNode, activePath, activeChildFor, descendants, siblings }
