import type { Meta, StoryObj } from '@storybook/svelte-vite';
import VigorPanel from '../sections/VigorPanel.svelte';
import { exampleVigor } from '../fixtures/seqoya-vigor';

const meta = {
  title: 'Pages/Seqoya/Vigor',
  component: VigorPanel,
  tags: ['autodocs'],
  args: { view: { rollup: exampleVigor } },
} satisfies Meta<typeof VigorPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { view: { loading: true } } };
export const Empty: Story = { args: { view: { rollup: { ...exampleVigor, headline: null, subscriptions: [] } } } };
export const Partial: Story = {
  args: { view: { rollup: { ...exampleVigor, failures: { kimi: 'The driver could not list its accounts.' } } } },
};
export const FailedRefresh: Story = {
  args: { view: { rollup: exampleVigor, error: 'Could not read Vigor for this Root.' } },
};
