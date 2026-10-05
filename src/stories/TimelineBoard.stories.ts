import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/TimelineBoard.svelte';
const meta = {
  title: 'Sections/TimelineBoard',
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
export const Empty: Story = { args: { empty: true } };
export const Compact: Story = { args: { compact: true } };
export const Agenda: Story = { args: { initialView: 'Agenda' } };
