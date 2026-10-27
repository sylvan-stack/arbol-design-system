import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Elma/Conversation',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'elma-conversation' },
  parameters: {
    docs: {
      description: {
        component:
          'Readable responses, connected context and a reliable composer. Accepted First Sapling composition using shared ElmaFrame and Exchange controls. Fictional local state; no native or backend service.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
