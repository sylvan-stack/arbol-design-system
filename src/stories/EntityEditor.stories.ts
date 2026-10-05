import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from './OverlayDemo.svelte';
const meta = {
  title: 'Patterns/EntityEditor',
  component: Component,
  tags: ['autodocs'],
  args: { kind: 'editor' },
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
export const Edit: Story = { args: { mode: 'edit' } };
export const SaveFailure: Story = { args: { outcome: 'error' } };
export const PartialSave: Story = { args: { outcome: 'partial' } };
export const Conflict: Story = { args: { outcome: 'conflict' } };
export const UncertainOutcome: Story = { args: { outcome: 'uncertain' } };
