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
          'Start a conversation with a task, question or entity. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
