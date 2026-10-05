import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Oaken/Compact Panel',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'oaken-compact-panel' },
  parameters: {
    docs: {
      description: {
        component:
          'A compact planning companion for active work. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
