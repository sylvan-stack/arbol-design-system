import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/Badge.svelte';
const meta = {
  title: 'Components/Badge',
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
export const Running: Story = { args: { label: 'Running', tone: 'working' } };
export const Complete: Story = { args: { label: 'Complete', tone: 'success' } };
export const Failed: Story = { args: { label: 'Failed', tone: 'failure' } };
export const Waiting: Story = { args: { label: 'Waiting', tone: 'warning' } };
export const Unread: Story = { args: { label: 'Unread', tone: 'neutral' } };
