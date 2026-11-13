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
      onRenameSubscription: async (driver, account, label) => {
        const view = args.view ?? loaded;
        if (view.usageRequests?.[subscriptionKey(driver, account.id)]?.error) {
          throw new Error('The Driver could not save this name. Your text is kept.');
        }
        updateArgs({ view: { ...view, listing: view.listing && { drivers: view.listing.drivers.map(entry =>
          entry.driver !== driver ? entry : ({
            ...entry, subscriptions: entry.subscriptions?.map(row => row.id === account.id ? { ...row, label } : row),
          }),
        ) } } });
      },
      onOpenUsage: (_destination, driver, subscription) => updateArgs({ view: {
        ...(args.view ?? loaded), usageLinkErrors: { [subscriptionKey(driver, subscription)]: 'Opening this subscription’s usage requires the App.' },
      } }),
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
          ...subscription, metrics: undefined,
          allowance: { issues: ['No MiMo quota reading. Open the Xiaomi console.'] },
        })),
      };
    }),
  } } },
};
const nextWindows: SubscriptionView = { ...loaded, listing: {
  drivers: exampleListing.drivers.filter(({ driver }) => driver === 'mimo').map((driver) => ({
    ...driver,
    subscriptions: driver.subscriptions?.map((account) => ({
      ...account,
      metrics: { windows: [
        { label: 'Token Plan', next: 'awaitingRenewal', windowMinutes: 43_200 },
        { label: 'Five hours', next: 'projected', pendingStart: true, windowMinutes: 300,
          usedPercent: 0, remainingPercent: 100, outputTokensUsed: 0, outputTokensRemaining: 1_280_000 },
        { label: 'Seven days', next: 'projected', windowMinutes: 10_080,
          resetsAt: (() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 51, 0, 0); return tomorrow.toISOString(); })(), remainingMinutes: 1440,
          usedPercent: 0, remainingPercent: 100, outputTokensUsed: 0,
          outputTokensRemaining: 403_200, outputTokensPerHour: 16_800 },
      ] },
    })),
  })),
} };
export const NextAllowances: Story = {
  args: { view: nextWindows },
  parameters: { docs: { description: { story: 'Hover or focus only a Time remaining value for its reset tooltip. Pending windows remain honest fictional states here; the production adapter starts a supported window with one minimal request and rereads provider usage.' } } },
};
export const Unavailable: Story = {
  args: { view: { connected: true, error: 'The backend did not answer in time.' } },
};
export const Stale: Story = {
  args: { view: { ...loaded, error: 'The backend did not answer in time.' } },
};
export const Disconnected: Story = { args: { view: { ...loaded, connected: false } } };
