import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Willo/Blueprint Runs',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'willo-blueprint-runs' },
  parameters: {
    docs: {
      description: {
        component:
          'Invocations of reusable work. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
