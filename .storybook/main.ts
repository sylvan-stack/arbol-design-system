import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/svelte-vite';
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts', '../src/**/*.mdx'],
  framework: '@storybook/svelte-vite',
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  staticDirs: [{ from: '../docs/design-system', to: '/design-system' }],
  async viteFinal(config) {
    config.resolve = {
      ...config.resolve,
      alias: {
        '@arbol/design-system/tokens.css': fileURLToPath(
          new URL('../src/styles/legacy-tokens.css', import.meta.url),
        ),
        '@arbol/design-system': fileURLToPath(
          new URL('../heritage/renderer/packages/design-system/src/index.ts', import.meta.url),
        ),
        '@arbol/events': fileURLToPath(
          new URL('../heritage/renderer/packages/events/src/index.ts', import.meta.url),
        ),
      },
    };
    return config;
  },
  core: { disableTelemetry: true },
};
export default config;
