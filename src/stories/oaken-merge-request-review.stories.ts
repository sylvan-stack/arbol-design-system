import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Oaken/Merge Request Review',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'oaken-merge-request-review' },
  parameters: {
    docs: {
      description: {
        component:
          'Changes and review discussion, organized by file. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
