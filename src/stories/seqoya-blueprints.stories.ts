import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Blueprints',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-blueprints' },
  parameters: {
    docs: {
      description: {
        component:
          'Typed inputs, outputs and repeatable instructions. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
