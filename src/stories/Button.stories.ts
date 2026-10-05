import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/Button.svelte';
const meta = {
  title: 'Components/Button',
  component: Component,
  tags: ['autodocs'],
  args: { label: 'Save changes' },
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
export const Primary: Story = { args: { tone: 'primary' } };
export const Danger: Story = { args: { tone: 'danger', label: 'Delete item' } };
export const Ghost: Story = { args: { tone: 'ghost' } };
export const Disabled: Story = { args: { disabled: true } };
export const Saving: Story = { args: { busy: true, label: 'Saving…' } };
