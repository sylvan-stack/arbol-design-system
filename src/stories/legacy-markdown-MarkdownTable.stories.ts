import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../../heritage/renderer/packages/design-system/src/markdown/MarkdownTable.svelte';
const meta = {
  title: 'Heritage/Interactive/Markdown/MarkdownTable',
  component: Component,
  args: {
    header: ['Workspace', 'Purpose', 'Primary pattern'],
    rows: [
      ['Seqoya', 'Administration', 'Collection'],
      ['Elma', 'Conversation', 'Response'],
      ['Willo', 'Attention', 'StationSummary'],
      ['Oaken', 'Planning', 'TimelineBoard'],
    ],
  },
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
