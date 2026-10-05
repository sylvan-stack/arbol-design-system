import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Reactions',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-reactions' },
  parameters: {
    docs: {
      description: {
        component:
          'Read-only automation summaries and their source signals. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
