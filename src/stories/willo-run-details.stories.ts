import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Willo/Run Details',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'willo-run-details' },
  parameters: {
    docs: {
      description: {
        component:
          'Run identity, progress, results and related chat. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
