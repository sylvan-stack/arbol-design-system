import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Monitoring',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-monitoring' },
  parameters: {
    docs: {
      description: {
        component:
          'Event Stream and Journal Log, with scoped filters and payload detail. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
