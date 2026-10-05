export type ChatTag = { name: string; value?: string; symbol?: string }
export type ChatTagDefinition = { name: string; vip: boolean; symbol?: string }

const NAME_LIMIT = 64
const VALUE_LIMIT = 256
export const COLLAPSED_TAG_LIMIT = 10

export function defaultTagSymbol(name: string): string {
  return Array.from(name.trim()).slice(0, 4).join('').toLocaleUpperCase().padEnd(3, '·')
}

export function withTagSymbol(tag: ChatTag, rawSymbol: string): ChatTag | null {
  const symbol = rawSymbol.trim() || defaultTagSymbol(tag.name)
  const length = Array.from(symbol).length
  if (length < 3 || length > 4) return null
  return { ...tag, symbol }
}

/** Parse the currently edited token. `name=` intentionally remains incomplete. */
export function parseTagToken(raw: string): ChatTag | null {
  const token = raw.trim()
  if (!token) return null
  const equals = token.indexOf('=')
  const name = (equals < 0 ? token : token.slice(0, equals)).trim()
  const value = equals < 0 ? undefined : token.slice(equals + 1).trim()
  if (!name || name.length > NAME_LIMIT || /[\s=,]/.test(name)) return null
  if (equals >= 0 && (!value || value.length > VALUE_LIMIT)) return null
  return value === undefined ? { name } : { name, value }
}

export function addOrReplaceTag(tags: ChatTag[], tag: ChatTag): ChatTag[] {
  const key = tag.name.toLocaleLowerCase()
  const index = tags.findIndex((item) => item.name.toLocaleLowerCase() === key)
  if (index < 0) return [...tags, tag]
  const next = [...tags]
  next[index] = tag
  return next
}

export function removeTag(tags: ChatTag[], name: string): ChatTag[] {
  const key = name.toLocaleLowerCase()
  return tags.filter((tag) => tag.name.toLocaleLowerCase() !== key)
}

export function hasTag(tags: ChatTag[], name: string): boolean {
  const key = name.toLocaleLowerCase()
  return tags.some((tag) => tag.name.toLocaleLowerCase() === key)
}

/** VIP definitions lead, including inactive VIPs; ordinary assigned tags follow. */
export function cockpitTags(tags: ChatTag[], definitions: ChatTagDefinition[]): Array<{
  tag: ChatTag
  vip: boolean
  active: boolean
}> {
  const assigned = new Map(tags.map((tag) => [tag.name.toLocaleLowerCase(), tag]))
  const vip = definitions
    .filter((item) => item.vip)
    .map((item) => ({
      tag: assigned.get(item.name.toLocaleLowerCase()) ?? {
        name: item.name,
        ...(item.symbol ? { symbol: item.symbol } : {}),
      },
      vip: true,
      active: assigned.has(item.name.toLocaleLowerCase()),
    }))
  const vipNames = new Set(vip.map((item) => item.tag.name.toLocaleLowerCase()))
  const ordinary = tags
    .filter((tag) => !vipNames.has(tag.name.toLocaleLowerCase()))
    .map((tag) => ({ tag, vip: false, active: true }))
  return [...vip, ...ordinary]
}

/**
 * Apply text from the input that follows the rendered Chips.
 *
 * A leading `=` belongs to the immediately preceding Chip, allowing a tag
 * accepted via Tab/click/comma to receive or replace its value without first
 * removing that Chip. Other input continues to create or replace a normal
 * `name`/`name=value` tag.
 */
export function applyTagInput(tags: ChatTag[], raw: string): ChatTag[] | null {
  const token = raw.trim()
  if (token.startsWith('=')) {
    if (!tags.length) return null
    const value = token.slice(1).trim()
    if (!value || value.length > VALUE_LIMIT) return null
    const next = [...tags]
    next[next.length - 1] = { ...next[next.length - 1], value }
    return next
  }

  const tag = parseTagToken(token)
  return tag ? addOrReplaceTag(tags, tag) : null
}

export function matchingTagSuggestion(
  knownNames: string[],
  raw: string,
  applied: ChatTag[],
): string | null {
  const token = raw.trim()
  if (!token || token.includes('=')) return null
  const query = token.toLocaleLowerCase()
  const appliedNames = new Set(applied.map((tag) => tag.name.toLocaleLowerCase()))
  return knownNames.find((name) =>
    name.toLocaleLowerCase().startsWith(query)
    && name.toLocaleLowerCase() !== query
    && !appliedNames.has(name.toLocaleLowerCase()),
  ) ?? null
}
