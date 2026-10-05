import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/DateTimeInput.svelte';
const meta = {
  title: 'Components/DateTimeInput',
  component: Component,
  tags: ['autodocs'],
  args: {},
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
