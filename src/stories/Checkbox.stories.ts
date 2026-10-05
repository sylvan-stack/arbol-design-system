import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/Checkbox.svelte';
const meta = {
  title: 'Components/Checkbox',
  component: Component,
  tags: ['autodocs'],
  args: { label: 'Include archived items' },
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
export const Checked: Story = { args: { checked: true } };
export const Disabled: Story = { args: { disabled: true } };
