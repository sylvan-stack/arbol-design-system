import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/MetaCockpit.svelte';

const meta = {
  title: 'Sections/MetaCockpit',
  component: Component,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { ontoggle: () => {} },
} satisfies Meta<typeof Component>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LargeTotals: Story = {
  args: { ongoing: true, inputTokens: 28_411_508, outputTokens: 156_492 },
};

export const NoUsage: Story = {};

export const SavingMark: Story = {
  args: { ongoing: true, busy: true, inputTokens: 9100, outputTokens: 2700 },
};

export const Working: Story = {
  args: { ongoing: true, working: true, inputTokens: 9100, outputTokens: 2700 },
  parameters: {
    docs: {
      description: {
        story: 'Increase either token count in Controls to see its estimated rate for the next sample.',
      },
    },
  },
};
