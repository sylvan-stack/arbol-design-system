import type { Meta, StoryObj } from '@storybook/svelte-vite';
import VigorPanel from '../sections/VigorPanel.svelte';
import type { SubscriptionRecord } from '../sections/seqoya-subscriptions';
import type { VigorPriorityView } from '../sections/seqoya-vigor-priority';

const now = Date.parse('2026-11-23T12:00:00Z');
const resetsAt = '2026-11-26T12:00:00Z';
const account: SubscriptionRecord = {
  id: 'project', family: 'chatgpt', label: 'Project account', auth: 'vendor_login', state: 'signed_in',
  userScore: 0.7,
  metrics: {
    windows: [{ label: 'Weekly', windowMinutes: 10_080, resetsAt, outputTokensRemaining: 180_000 }],
    price: { label: 'ChatGPT Pro 200', amount: 200, currency: 'USD', months: 1, source: 'list' },
    estimatedTokenCost: { window: 'Weekly', perMillion: 20, currency: 'USD', basis: 'Fictional reference token cost.' },
    limitResets: { count: 1, entries: [{ label: 'Full reset', expiresAt: '2026-11-25T12:00:00Z' }] },
  },
};
const writing: SubscriptionRecord = {
  ...account, id: 'writing', family: 'anthropic', label: 'Writing account', userScore: 0.85,
  metrics: {
    ...account.metrics,
    windows: [{ label: 'Weekly', windowMinutes: 10_080, resetsAt, outputTokensRemaining: 640_000 }],
    limitResets: undefined,
  },
};
const exampleView: VigorPriorityView = {
  priority: { now, listing: { drivers: [
    { driver: 'codex', subscriptions: [account] },
    { driver: 'claude', subscriptions: [
      writing,
      { ...writing, id: 'review', label: 'Review account', userScore: 0.4,
        metrics: { ...writing.metrics, windows: [{ label: 'Weekly', windowMinutes: 10_080, resetsAt, outputTokensRemaining: 0 }] } },
    ] },
    { driver: 'pi', subscriptions: [
      { id: 'another', family: 'kimi-coding', label: 'Research account', auth: 'vendor_login', state: 'signed_in' },
    ] },
  ] } },
};

const meta = {
  title: 'Pages/Seqoya/Vigor',
  component: VigorPanel,
  tags: ['autodocs'],
  args: { view: exampleView },
  parameters: { docs: { description: { component:
    'The minimal ranking follows docs/design-system/seqoya-vigor.md. Toggle a Quota Dash for a fictional weekly window.',
  } } },
} satisfies Meta<typeof VigorPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { view: { loading: true } } };
export const Empty: Story = { args: { view: { priority: { now, listing: { drivers: [] } } } } };
export const Partial: Story = {
  args: { view: { ...exampleView, accountIssues: ['Another account could not refresh its usage.'] } },
};
export const FailedRefresh: Story = {
  args: { view: { ...exampleView, error: 'Could not refresh account usage.' } },
};
