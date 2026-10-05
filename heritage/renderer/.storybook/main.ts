import type { StorybookConfig } from '@storybook/react-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const config: StorybookConfig = {
  stories: ['../packages/**/*.stories.tsx', '../apps/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  addons: ['@storybook/addon-docs', '@storybook/addon-themes', '@storybook/addon-a11y'],
  async viteFinal(config) {
    // The app-level vite.config also declares a Vitest project; keep the
    // component catalogue independent of that test-runner configuration.
    config.plugins = [...(config.plugins || []), svelte()]
    config.resolve = { ...config.resolve, alias: {
      '@arbol/design-system/tokens.css': source('../packages/design-system/src/tokens.css'),
      '@arbol/design-system': source('../packages/design-system/src/index.ts'),
      '@arbol/events': source('../packages/events/src/index.ts'),
    } }
    return config
  },
}
export default config
