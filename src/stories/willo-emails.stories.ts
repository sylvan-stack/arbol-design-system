import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Willo/Emails',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'willo-emails' },
  parameters: {
    docs: {
      description: {
        component:
          'Accounts, cached threads and future email rules. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
