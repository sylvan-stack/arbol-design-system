import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Oaken/Swimlanes',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'oaken-swimlanes' },
  parameters: {
    docs: {
      description: {
        component:
          'Time moves upward. Plan work around estimates, targets and firm deadlines. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
