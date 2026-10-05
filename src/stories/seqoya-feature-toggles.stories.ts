import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
const meta = {
  title: 'Pages/Seqoya/Feature Toggles',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-feature-toggles' },
  parameters: {
    docs: {
      description: {
        component:
          'Global feature availability and cue detection. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
