import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Quick Text',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-quick-text' },
  parameters: {
    docs: {
      description: {
        component:
          'Reusable text, available through explicit activation keys. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
