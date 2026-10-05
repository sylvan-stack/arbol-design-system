import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Elma/Worktree Diff',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'elma-worktree-diff' },
  parameters: {
    docs: {
      description: {
        component:
          'Inspect the active worktree and ask about changes. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
