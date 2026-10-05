import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/NativeSurface.svelte';
const meta = {
  title: 'Native adapters/Notification Feed',
  component: Component,
  tags: ['autodocs'],
  args: { surface: 'Notification Feed' },
  parameters: {
    docs: {
      description: {
        component:
          'Browser specification of the native surface. Platform window behavior and services are outside Storybook. External UI gaps are explicitly marked.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
