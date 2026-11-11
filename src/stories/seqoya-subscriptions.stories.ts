import type { Meta, StoryObj } from '@storybook/svelte-vite';
import { useArgs } from 'storybook/preview-api';
import type { ComponentProps } from 'svelte';
import SubscriptionList from '../sections/SubscriptionList.svelte';
import { subscriptionKey, type SubscriptionView } from '../sections/seqoya-subscriptions';
import { exampleListing } from '../fixtures/seqoya-subscriptions';

const loaded: SubscriptionView = { connected: true, listing: exampleListing };
const meta = {
  title: 'Pages/Seqoya/Subscriptions',
  component: SubscriptionList,
  tags: ['autodocs'],
  args: { view: loaded },
  render: (args) => {
    const [, updateArgs] = useArgs();
    const props: ComponentProps<typeof SubscriptionList> = {
      ...args, onRefresh: () => updateArgs({ view: loaded }),
      onRefreshUsage: (driver, subscription) => {
        const view = args.view ?? loaded;
        updateArgs({ view: {
          ...view, usageRequests: {
            ...view.usageRequests, [subscriptionKey(driver, subscription)]: {},
          },
        } });
      },
      onOpenMiMo: () => updateArgs({ view: { ...(args.view ?? loaded), consoleError: 'Opening the console requires the App.' } }),
    };
    return { Component: SubscriptionList, props };
  },
} satisfies Meta<typeof SubscriptionList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { view: { connected: true, loading: true } } };
export const Empty: Story = { args: { view: { connected: true, listing: { drivers: [] } } } };
export const Partial: Story = {
  args: { view: { connected: true, usageRequests: {
    [subscriptionKey('pi', 'deepseek')]: { error: 'DeepSeek could not be reached. The saved balance is shown.' },
  }, listing: {
    drivers: exampleListing.drivers.map((driver) => {
      if (driver.driver === 'codex') return { driver: 'codex', error: { message: 'The driver did not answer in time.' } };
      if (driver.driver !== 'mimo') return driver;
      return {
        ...driver,
        subscriptions: driver.subscriptions?.map((subscription) => ({
          ...subscription, activity: undefined, activityError: 'Could not read activity for this Root.',
        })),
      };
    }),
  } } },
};
export const Unavailable: Story = {
  args: { view: { connected: true, error: 'The backend did not answer in time.' } },
};
export const Stale: Story = {
  args: { view: { ...loaded, error: 'The backend did not answer in time.' } },
};
export const Disconnected: Story = { args: { view: { ...loaded, connected: false } } };
