/* Seqoya shared types — kept in .ts since types can't be exported from a
 * .svelte instance script in runes mode. */
import type { IpSettings, RepoRules } from './api'

export type PageId = 'dashboard' | 'intelligence-providers' | 'brain-recipes' | 'quick-text' | 'feature-toggles' | 'living-topics' | 'stewardship' | 'blueprints' | 'reactions' | 'organizations' | 'repos' | 'secrets' | 'chunks-viewer' | 'refresher' | 'artifacts' | 'retrieval' | 'monitoring'

export type PaletteAction = { label: string; hint?: string; run: () => void }

export type IpDetail = { settings: IpSettings; repo_rules: RepoRules }
