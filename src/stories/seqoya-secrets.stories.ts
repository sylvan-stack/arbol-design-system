import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Secrets',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-secrets' },
  parameters: {
    docs: {
      description: {
        component:
          'Credentials stay concealed; connection state stays visible. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
