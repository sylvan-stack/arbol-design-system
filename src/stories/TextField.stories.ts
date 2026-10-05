import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/TextField.svelte';
const meta = {
  title: 'Components/TextField',
  component: Component,
  tags: ['autodocs'],
  args: { label: 'Name', hint: 'A short, descriptive title.' },
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
export const Required: Story = { args: { required: true } };
export const Invalid: Story = { args: { error: 'Enter a name before saving.' } };
export const Disabled: Story = { args: { disabled: true, value: 'Saved value' } };
