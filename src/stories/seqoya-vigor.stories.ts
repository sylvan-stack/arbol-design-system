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
    windows: [{ label: 'Weekly', windowMinutes: 10_080, resetsAt, outputTokensRemaining: 180_000,
      outputTokensTotal: 1_000_000,
      calibrationDetail: 'GPT-6.2 Sol calibration · 400K output tokens across 40 percentage points · rounding range 0.98M–1.03M.' }],
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
const kimi = {
  id: 'kimi-coding', family: 'kimi-coding', label: 'Kimi Code', auth: 'vendor_login', state: 'signed_in',
  metrics: {
    windows: [
      { label: 'Five hours', windowMinutes: 300, resetsAt: '2026-11-23T15:00:00Z', outputTokensRemaining: 160_000 },
      { label: 'Monthly, Kimi Code', windowMinutes: 43_200, resetsAt, expiresAt: resetsAt, terminal: true,
        outputTokensTotal: 4_000_000, outputTokensUsed: 2_000_000, outputTokensRemaining: 2_000_000 },
    ],
    estimatedTokenCost: {
      window: 'Monthly, Kimi Code', perMillion: 20, currency: 'USD',
      basis: 'Fictional monthly charge of 80 USD ÷ 4M monthly output-token equivalents × 1M.',
    },
  },
} satisfies SubscriptionRecord;
const mimo = {
  id: 'xiaomi', family: 'xiaomi', label: 'Xiaomi MiMo', auth: 'api_key', state: 'signed_in',
  metrics: {
    windows: [{ label: 'Token Plan', windowMinutes: 43_200, resetsAt: '2026-11-27T23:59:59Z',
      terminal: true, outputTokensUsed: 3_000_000, outputTokensRemaining: 60_000_000 }],
    estimatedTokenCost: {
      window: 'Token Plan', perMillion: 30 / 63, currency: 'USD',
      basis: 'Fictional monthly charge of 30 USD ÷ 63M monthly output-token equivalents × 1M.',
    },
  },
} satisfies SubscriptionRecord;
const api: SubscriptionRecord = {
  id: 'deepseek', family: 'deepseek', label: 'DeepSeek', auth: 'api_key', state: 'signed_in',
  metrics: { windows: [], balance: { availableTokens: 2_000_000, estimateBasis: 'Fictional API balance.' } },
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
    { driver: 'pi', subscriptions: [kimi, api] },
    { driver: 'mimo', subscriptions: [mimo] },
  ] } },
};

const meta = {
  title: 'Pages/Seqoya/Vigor',
  component: VigorPanel,
  tags: ['autodocs'],
  args: { view: exampleView },
  parameters: { docs: { description: { component:
    'The ranking follows docs/design-system/seqoya-vigor.md. Expand a weekly, Kimi Code or MiMo row to see its total window tokens, available equivalents and reference cost.',
  } } },
} satisfies Meta<typeof VigorPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const TimedAllowanceDetails: Story = {
  args: { view: { priority: { now, listing: { drivers: [
    { driver: 'pi', subscriptions: [{
      ...kimi, label: 'Kimi Code without price',
      metrics: { windows: kimi.metrics.windows.map(window => window.label === 'Monthly, Kimi Code'
        ? { ...window, outputTokensUsed: 4_000_000, outputTokensRemaining: 0 } : window) },
    }, {
      ...kimi, id: 'priced-timed', family: 'example', label: 'Priced short allowance',
      metrics: { windows: kimi.metrics.windows.map(window => window.label === 'Monthly, Kimi Code'
        ? { ...window, label: 'Monthly' } : window),
        estimatedTokenCost: { window: 'Five hours', perMillion: 2, currency: 'USD', basis: 'Fictional short-window reference rate.' } },
    }] },
    { driver: 'mimo', subscriptions: [{
      ...mimo, label: 'MiMo without duration',
      metrics: { windows: mimo.metrics.windows.map(window => ({ ...window, windowMinutes: undefined })) },
    }] },
  ] } } } },
};
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
  args: { view: { accountIssues: ['Another account could not refresh its usage.'], priority: { now, listing: { drivers: [
    { driver: 'codex', subscriptions: [{ ...account, metrics: { windows: [
      { label: 'Weekly', windowMinutes: 10_080, resetsAt, usedPercent: 8,
        calibrationDetail: 'Collecting GPT-6.2 Sol calibration · 8 of 20 percentage points.' },
    ] } }] },
  ] } } } },
};
export const FailedRefresh: Story = {
  args: { view: { ...exampleView, error: 'Could not refresh account usage.' } },
};
