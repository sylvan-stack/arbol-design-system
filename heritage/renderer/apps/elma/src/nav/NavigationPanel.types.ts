/* Navigation Panel — shared types (extracted so the .svelte component can import
 * the exported `RepoSlot` type, which cannot live in a .svelte instance script). */
export type RepoSlot = { key: string; name: string; path: string }
