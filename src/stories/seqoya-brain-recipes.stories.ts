import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Brain Recipes',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-brain-recipes' },
  parameters: {
    docs: {
      description: {
        component:
          'Ordered routes and a global fallback. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
