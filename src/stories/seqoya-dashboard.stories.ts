import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
import SeqoyaLab from '../pages/SeqoyaLab.svelte';
const meta = {
  title: 'Pages/Seqoya/Dashboard',
  component: Component,
  tags: ['autodocs'],
  args: { pageId: 'seqoya-dashboard' },
  parameters: {
    docs: {
      description: {
        component:
          'Knowledge health, connected repositories and recent activity. Interactive successor composition using shared components. Services are represented by local fixture state.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
export const LabLayout: StoryObj<typeof SeqoyaLab> = {
  render: () => ({
    Component: SeqoyaLab,
    props: {
      trunk: 'trivial',
    },
  }),
};
