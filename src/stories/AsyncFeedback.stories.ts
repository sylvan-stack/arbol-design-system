import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/AsyncFeedback.svelte';
const meta = {
  title: 'Components/AsyncFeedback',
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
export const Saving: Story = { args: { state: 'saving' } };
export const Saved: Story = { args: { state: 'saved' } };
export const Error: Story = { args: { state: 'error' } };
export const Stale: Story = { args: { state: 'stale' } };
export const Partial: Story = { args: { state: 'partial' } };
export const Conflict: Story = { args: { state: 'conflict' } };
export const Uncertain: Story = { args: { state: 'uncertain' } };
