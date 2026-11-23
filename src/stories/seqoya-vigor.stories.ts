import type { Meta, StoryObj } from '@storybook/svelte-vite';
import VigorPanel from '../sections/VigorPanel.svelte';
import type { SubscriptionRecord } from '../sections/seqoya-subscriptions';
import { defaultVigorSettings, type VigorPriorityView } from '../sections/seqoya-vigor-priority';

const now = Date.parse('2026-11-23T12:00:00Z');
const resetsAt = '2026-11-26T12:00:00Z';
const account: SubscriptionRecord = {
  id: 'project', family: 'chatgpt', label: 'Project account', auth: 'vendor_login', state: 'signed_in',
  userScore: 0.7,
  metrics: {
    windows: [{ label: 'Weekly', windowMinutes: 10_080, resetsAt, outputTokensRemaining: 180_000 }],
    price: { label: 'ChatGPT Pro 200', amount: 200, currency: 'USD', months: 1, source: 'list' },
    estimatedTokenCost: {
      window: 'Weekly', perMillion: 200 / (52 / 12), currency: 'USD',
      basis: 'Fictional monthly charge of 200 USD ÷ (1M weekly output-token equivalents × 52/12) × 1M. The weekly calibration uses 400K observed equivalents ÷ 40% of the weekly quota.',
    },
    limitResets: { count: 1, entries: [{ label: 'Full reset', expiresAt: '2026-11-25T12:00:00Z' }] },
  },
};
const writing: SubscriptionRecord = {
  ...account, id: 'writing', family: 'anthropic', label: 'Writing account', userScore: 0.85,
  metrics: {
    ...account.metrics,
    windows: [{ label: 'Weekly', windowMinutes: 10_080, resetsAt, outputTokensUsed: 360_000, outputTokensRemaining: 640_000 }],
    limitResets: undefined,
  },
};
const exampleView: VigorPriorityView = {
  priority: { now, listing: { drivers: [
    { driver: 'codex', subscriptions: [account] },
    { driver: 'claude', subscriptions: [
      writing,
      { ...writing, id: 'review', label: 'Review account', userScore: 0.4,
        metrics: { ...writing.metrics, windows: [{ label: 'Weekly', windowMinutes: 10_080, resetsAt: '2026-11-23T19:30:00Z',
          outputTokensUsed: 1_000_000, outputTokensRemaining: 0, remainingPercent: 0 }] } },
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
    'The weekly ranking follows docs/design-system/seqoya-vigor.md. Compare content-sized weekly columns, expand a priced account to trace the token-cost estimate, or configure thresholds.',
  } } },
} satisfies Meta<typeof VigorPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AutomaticRules: Story = {
  args: { view: { ...exampleView, priority: {
    ...exampleView.priority, now,
    settings: { ...defaultVigorSettings, dashThresholds: { requiredPace: 1.4, potentialLoss: 10, projectedEtc: 40 } },
    monthlyForecasts: {
      [JSON.stringify(['claude', 'writing', null])]: {
        start: Date.parse('2026-11-01T00:00:00Z'), end: Date.parse('2026-12-01T00:00:00Z'),
        charge: 80, currency: 'USD', used: 250_000, expected: 750_000, recordedAt: now,
      },
    },
  } } },
};
export const Loading: Story = { args: { view: { loading: true } } };
export const Empty: Story = { args: { view: { priority: { now, listing: { drivers: [] } } } } };
export const Partial: Story = {
  args: { view: { ...exampleView, accountIssues: ['Another account could not refresh its usage.'] } },
};
export const FailedRefresh: Story = {
  args: { view: { ...exampleView, error: 'Could not refresh account usage.' } },
};
