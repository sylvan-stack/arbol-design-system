import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/StationSummary.svelte';
import { exampleStation } from '../fixtures/willo-chat-sessions';
const meta = {
  title: 'Sections/StationSummary',
  component: Component,
  tags: ['autodocs'],
  args: exampleStation,
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
export const OtherChats: Story = {
  args: { status: 'Complete', ongoing: false, condensed: true, readOnly: true, usage: undefined },
};
export const Compact: Story = { args: { density: 'compact' } };
export const Minimal: Story = { args: { density: 'minimal' } };
export const UnreadCompletion: Story = {
  args: { status: 'Complete', unread: true, ongoing: false },
};
export const Failure: Story = {
  args: { status: 'Failed', failure: 'Connection interrupted. Your work is preserved.' },
};
export const OpenInElma: Story = { args: { inElma: true } };
export const Draft: Story = { args: { status: 'Draft', ongoing: false, usage: 'Not sent · Local Draft' } };
