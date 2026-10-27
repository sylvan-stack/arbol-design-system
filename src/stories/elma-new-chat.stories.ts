import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Elma/New Chat',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'elma-new-chat' },
  parameters: {
    docs: {
      description: {
        component:
          'Start a conversation with a task, question or entity. Accepted First Sapling composition using shared ElmaFrame and Exchange controls. Fictional local state; no native or backend service.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
