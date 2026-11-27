import type { Meta, StoryObj } from '@storybook/svelte-vite';
import { useArgs } from 'storybook/preview-api';
import type { ComponentProps } from 'svelte';
import SubscriptionList from '../sections/SubscriptionList.svelte';
import { subscriptionKey, type SubscriptionRecord, type SubscriptionView } from '../sections/seqoya-subscriptions';
import { exampleListing } from '../fixtures/seqoya-subscriptions';

const loaded: SubscriptionView = { connected: true, listing: exampleListing };
const meta = {
  title: 'Pages/Seqoya/Subscriptions',
  component: SubscriptionList,
  tags: ['autodocs'],
  args: { view: loaded },
  parameters: { docs: { description: { component:
    'Each timed allowance shows its full estimated total in millions. The exhausted sample weekly allowance still shows 0.80M. API balances have no window total.',
  } } },
  render: (args) => {
    const [, updateArgs] = useArgs();
    const view = args.view ?? loaded;
    function updateAccount(driver: string, account: SubscriptionRecord, edit: Pick<Partial<SubscriptionRecord>, 'label' | 'userScore'>) {
      updateArgs({ view: { ...view, listing: view.listing && { drivers: view.listing.drivers.map(entry =>
        entry.driver !== driver ? entry : ({
          ...entry, subscriptions: entry.subscriptions?.map(row => row.id === account.id ? { ...row, ...edit } : row),
        }),
      ) } } });
    }
    const props: ComponentProps<typeof SubscriptionList> = {
      ...args, onRefresh: () => updateArgs({ view: loaded }),
      view: { ...view, saveUserScore: (driver, account, userScore) => updateAccount(driver, account, { userScore }) },
      onRenameSubscription: async (driver, account, label) => {
        if (view.usageRequests?.[subscriptionKey(driver, account.id)]?.error) {
          throw new Error('The Driver could not save this name. Your text is kept.');
        }
        updateAccount(driver, account, { label });
      },
      onOpenUsage: (driver, subscription) => updateArgs({ view: {
        ...(args.view ?? loaded), usageLinkErrors: { [subscriptionKey(driver, subscription)]: 'Opening this subscription’s usage requires the App.' },
      } }),
    };
    return { Component: SubscriptionList, props };
  },
} satisfies Meta<typeof SubscriptionList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
const codexAccount = exampleListing.drivers.find(({ driver }) => driver === 'codex')!.subscriptions![0];
const codexKey = subscriptionKey('codex', codexAccount.id);

export const OpeningUsage: Story = {
  args: { view: { ...loaded, usageOpening: codexKey } },
  parameters: { docs: { description: { story: 'Seqoya shows this state while the signed Browser prepares the bound dashboard. The native Browser comes forward when the dashboard is ready.' } } },
};
export const OpenedUsage: Story = { args: { view: { ...loaded, usageOpened: {
  key: codexKey, createdAt: codexAccount.createdAt, family: codexAccount.family,
} } } };

export const Loading: Story = { args: { view: { connected: true, loading: true } } };
export const Empty: Story = { args: { view: { connected: true, listing: { drivers: [] } } } };
export const Partial: Story = {
  args: { view: { connected: true, listing: {
    drivers: exampleListing.drivers.map((driver) => {
      if (driver.driver === 'codex') return { driver: 'codex', error: { message: 'The driver did not answer in time.' } };
      if (driver.driver === 'pi') return {
        ...driver,
        subscriptions: driver.subscriptions?.map((subscription) => subscription.family !== 'deepseek' ? subscription : {
          ...subscription, metrics: { ...subscription.metrics, windows: [],
            issues: ['The DeepSeek dashboard could not be reached. The last Browser balance is shown.'] },
        }),
      };
      if (driver.driver !== 'mimo') return driver;
      return {
        ...driver,
        subscriptions: driver.subscriptions?.map((subscription) => ({
          ...subscription, metrics: { windows: [], issues: ['This subscription has no matching Arbol Browser profile.'] },
        })),
      };
    }),
  } } },
};
export const DriverUnavailable: Story = {
  args: { view: { connected: true, listing: {
    drivers: exampleListing.drivers.map((driver) => {
      if (driver.driver === 'pi') return { driver: 'pi', error: { message: 'The driver is unavailable.' } };
      if (driver.driver === 'mimo') return { ...driver, error: { message: 'The driver did not answer in time.' } };
      return driver;
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
  parameters: { docs: { description: { story: 'Hover or focus a Time remaining value for its reset tooltip. A five-hour window can stay pending until ordinary use starts it and a dashboard refresh reports the new window.' } } },
};
export const Unavailable: Story = {
  args: { view: { connected: true, error: 'The backend did not answer in time.' } },
};
export const Stale: Story = {
  args: { view: { ...loaded, error: 'The backend did not answer in time.' } },
};
export const Disconnected: Story = { args: { view: { ...loaded, connected: false } } };
