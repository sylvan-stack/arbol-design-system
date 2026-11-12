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
          'The Intelligence Providers page opens on Subscriptions with sample accounts, followed by Vigor and Routing.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
