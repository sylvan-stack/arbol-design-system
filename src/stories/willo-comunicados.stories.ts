import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Willo/Comunicados',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'willo-comunicados' },
  parameters: {
    docs: {
      description: {
        component:
          'Notification species, sounds and delivery tests. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
