import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Elma/Document Panel',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'elma-document-panel' },
  parameters: {
    docs: {
      description: {
        component:
          'Read and edit an artifact beside the conversation. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
