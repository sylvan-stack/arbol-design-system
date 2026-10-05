import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Artifacts',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-artifacts' },
  parameters: {
    docs: {
      description: {
        component:
          'Browse, read and edit connected documents in one workspace. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
