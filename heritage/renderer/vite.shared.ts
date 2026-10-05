import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'
import type { UserConfig } from 'vite'

/* Shared vite config for every Arbol UI app (Svelte 5). Each app builds from the
 * renderer root (using renderer/node_modules) and resolves @arbol/design-system
 * to source. Output → app/resources/renderer/<outName>/ (one folder per UI). */
export function appConfig(appDir: string, outName: string): UserConfig {
  // Captured once per Vite invocation, so each renderer reports the build that
  // produced its currently loaded JS rather than the native host's timestamp.
  const uiBuiltAt = new Date().toISOString()
  const ds = resolve(appDir, '../../packages/design-system/src')
  const events = resolve(appDir, '../../packages/events/src')
  const stateProfile = process.env.ARBOL_BUILD_PROFILE === 'state'
  return {
    root: appDir,
    plugins: [svelte(), ...(stateProfile ? [{
      name: 'arbol-state-replay-boundary',
      moduleParsed(info: { id: string }) {
        if (info.id.replaceAll('\\', '/').endsWith('/packages/events/src/project.ts')) {
          throw new Error('state renderer imported legacy durable event fold diagnostics')
        }
      },
    }] : [])],
    base: './',
    define: {
      __ARBOL_UI_BUILT_AT__: JSON.stringify(uiBuiltAt),
      __ARBOL_UI_KEY__: JSON.stringify(outName),
    },
    resolve: {
      alias: {
        '@arbol/design-system/tokens.css': resolve(ds, 'tokens.css'),
        '@arbol/design-system': resolve(ds, 'index.ts'),
        // Preserve typed DTOs, Provider sequences, overlays and local invalidation.
        // The explicit state profile has no durable fold/replay entrypoint.
        '@arbol/events': resolve(events, stateProfile ? 'state.ts' : 'index.ts'),
      },
    },
    build: {
      outDir: resolve(appDir, `../../../app/resources/renderer/${outName}`),
      emptyOutDir: true,
      target: 'es2020',
    },
  }
}
