import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Refresher',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-refresher' },
  parameters: {
    docs: {
      description: {
        component:
          'Resolve source drift and stale knowledge without losing context. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
