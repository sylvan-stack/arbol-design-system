import type { Meta, StoryObj } from '@storybook/svelte-vite';
import { useArgs } from 'storybook/preview-api';
import type { ComponentProps } from 'svelte';
import SubscriptionList from '../sections/SubscriptionList.svelte';
import { subscriptionKey, type SubscriptionView } from '../sections/seqoya-subscriptions';
import { exampleListing } from '../fixtures/seqoya-subscriptions';

const observedAt = '2026-11-11T15:45:00Z';
const loaded: SubscriptionView = { connected: true, listing: {
  drivers: exampleListing.drivers.map((entry) => {
    if (entry.driver === 'pi') return { ...entry, subscriptions: [...entry.subscriptions ?? [], {
      id: 'chatgpt', family: 'chatgpt', label: 'Sample ChatGPT', auth: 'vendor_login', state: 'signed_in',
      activity: { runCount: 0 },
      allowance: { quota: {
        source: 'ChatGPT dashboard snapshot', observedAt, plan: 'ChatGPT Plus',
        note: 'Pi can use up to 100% of the shared plan.',
        windows: [{ label: 'Shared weekly quota', remainingPercent: 61, resetsAt: '2026-11-15T15:00:00Z' }],
      } },
    }] };
    if (entry.driver !== 'mimo') return entry;
    return { ...entry, subscriptions: entry.subscriptions?.map((account) => ({
      ...account, allowance: {
        quota: {
          source: 'Xiaomi Token Plan', plan: 'Sample plan', observedAt,
          credits: { total: '4000000000', remaining: '3600000000' },
          windows: [{ label: 'Monthly quota', remainingPercent: 90, resetsAt: '2026-11-27T23:59:59Z' }],
        },
        capacity: {
          total: 6666667, remaining: 6000000, model: 'Sample model', source: 'Published output rate',
          calculation: '3,600,000,000 credits ÷ 600 credits per output token.',
        },
      },
    })) };
  }),
} };
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
      onOpenUsage: (destination) => updateArgs({ view: {
        ...(args.view ?? loaded), usageLinkErrors: { [destination]: 'Opening vendor usage requires the App.' },
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
          ...subscription, activity: undefined, activityError: 'Could not read activity for this Root.',
          allowance: { issues: ['No MiMo quota reading. Open the Xiaomi console.'] },
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
