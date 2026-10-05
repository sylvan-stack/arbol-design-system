import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../patterns/Collection.svelte';
const meta = {
  title: 'Patterns/Collection',
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
export const Table: Story = { args: { view: 'Table' } };
export const Cards: Story = { args: { view: 'Cards' } };
export const Loading: Story = { args: { state: 'loading' } };
export const Failure: Story = { args: { state: 'error' } };
export const Stale: Story = { args: { state: 'stale' } };
export const Empty: Story = { args: { items: [] } };
