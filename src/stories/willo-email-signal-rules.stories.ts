import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Willo/Email Signal Rules',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'willo-email-signal-rules' },
  parameters: {
    docs: {
      description: {
        component:
          'Test on retained email; activate only for future mail. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
