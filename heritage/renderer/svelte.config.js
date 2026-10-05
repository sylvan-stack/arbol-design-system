import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/* Svelte 5 config for every Arbol UI. WKWebView SPAs (no SSR/routing), so plain
 * Svelte + Vite — not SvelteKit. `vitePreprocess` enables <script lang="ts">. */
export default {
  preprocess: vitePreprocess(),
}
