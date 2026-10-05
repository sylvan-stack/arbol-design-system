import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Intelligence Providers',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-intelligence-providers' },
  parameters: {
    docs: {
      description: {
        component:
          'Accounts own usage. Providers define how you work. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
