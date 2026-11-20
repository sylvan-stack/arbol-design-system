import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/StationCollection.svelte';
import { exampleStations } from '../fixtures/willo-chat-sessions';
const meta = {
  title: 'Sections/StationCollection',
  component: Component,
  tags: ['autodocs'],
  args: { stations: exampleStations },
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
export const Agentic: Story = { args: { agentic: true } };
export const Compact: Story = { args: { compact: true } };
