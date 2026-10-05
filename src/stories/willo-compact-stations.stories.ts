import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Willo/Compact Stations',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'willo-compact-stations' },
  parameters: {
    docs: {
      description: {
        component:
          'Ambient work monitoring with explicit expansion. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
