import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Elma/Permission Request',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'elma-permission-request' },
  parameters: {
    docs: {
      description: {
        component:
          'Explicit scope and a single decision lifecycle. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
