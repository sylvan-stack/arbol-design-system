/** Retired IPs remain in persisted history, but are absent from UI catalogs. */
export function isHiddenProvider(name: string | null | undefined): boolean {
  return name?.trim().toLowerCase() === 'universe'
}

export function visibleProviders<T extends { name: string }>(ips: T[]): T[] {
  return ips.filter(ip => !isHiddenProvider(ip.name))
}

/** Keep historical routes honest without advertising the retired IP. */
export function providerDisplayName(name: string): string {
  if (isHiddenProvider(name)) return 'Retired provider'
  return ({ codex: 'Codex', glm: 'z.ai' } as Record<string, string>)[name] || name
}

/** Normalize built-in catalog labels even when the daemon has older metadata. */
export function providerCatalogDisplayNames(method: string, result: any): any {
  const key = method === 'ip.list' ? 'ips' : method === 'subscription.list' ? 'subscriptions' : null
  if (!key || !Array.isArray(result?.[key])) return result
  const labels: Record<string, string> = key === 'ips'
    ? { codex: 'Codex', glm: 'z.ai' }
    : { 'codex-chatgpt': 'Codex Pro 20x', glm: 'z.ai Pro 6x' }
  return { ...result, [key]: result[key].map((item: any) =>
    labels[item.name] ? { ...item, label: labels[item.name] } : item) }
}
