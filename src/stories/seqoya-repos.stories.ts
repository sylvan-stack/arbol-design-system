import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Repos',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-repos' },
  parameters: {
    docs: {
      description: {
        component:
          'Source, corpora, embedding profiles and Git health. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
