import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../../heritage/renderer/packages/design-system/src/markdown/ArbolSeparator.svelte';
const meta = {
  title: 'Heritage/Interactive/Markdown/ArbolSeparator',
  component: Component,
  args: {},
  parameters: {
    docs: {
      description: {
        component:
          'Preserved original rendering component with synthetic content. Use as a visual reference; successor DocumentView owns the unified editing lifecycle.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
