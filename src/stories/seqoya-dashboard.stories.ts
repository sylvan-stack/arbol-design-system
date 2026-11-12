import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/WorkspacePage.svelte';
import SeqoyaLab from '../pages/SeqoyaLab.svelte';
import { exampleListing } from '../fixtures/seqoya-subscriptions';
import { exampleVigor } from '../fixtures/seqoya-vigor';
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
  parameters: { docs: { description: { story: 'The native Seqoya layout opens Intelligence Providers on Subscriptions with sample accounts. Vigor shows a sample ranking. Preferences change this preview only.' } } },
  render: () => ({
    Component: SeqoyaLab,
    props: {
      trunk: 'trivial',
      subscriptions: { connected: true, listing: exampleListing },
      vigor: { rollup: exampleVigor },
    },
  }),
};
