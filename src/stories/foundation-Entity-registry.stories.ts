import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from './Foundations.svelte';
const meta = {
  title: 'Foundations/Entity registry',
  component: Component,
  tags: ['autodocs'],
  args: { section: 'Entity registry' },
  parameters: {
    docs: {
      description: {
        component:
          'Successor design. Local fictional data. See the Design System chapter in docs/design-system for behavior and reconstruction guidance.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
