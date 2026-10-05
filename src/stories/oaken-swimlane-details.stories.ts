import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Oaken/Swimlane Details',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'oaken-swimlane-details' },
  parameters: {
    docs: {
      description: {
        component:
          'Timeline and linked work share one selected lane. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
