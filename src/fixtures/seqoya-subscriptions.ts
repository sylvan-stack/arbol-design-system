import type { SubscriptionListing, SubscriptionWindow } from '../sections/seqoya-subscriptions';

const read = '2026-11-11T16:00:00Z';
const weeklyReset = '2026-11-16T09:00:00Z';
const weekly: SubscriptionWindow = {
  label: 'Weekly', windowMinutes: 10_080, resetsAt: weeklyReset, remainingMinutes: 6_780,
  usedPercent: 42, remainingPercent: 58, observedAt: read,
};

export const exampleListing: SubscriptionListing = {
  drivers: [
    {
      driver: 'claude',
      subscriptions: [{
        id: 'anthropic', label: 'Writing account', family: 'anthropic', auth: 'vendor_login',
        state: 'signed_in', metrics: { windows: [
          { label: 'Five hours', windowMinutes: 300, resetsAt: '2026-11-11T20:00:00Z',
            remainingMinutes: 240, usedPercent: 18, remainingPercent: 82, observedAt: read },
          weekly,
        ] }, lastUsage: {
          plan: 'Sample plan', fetchedAt: '2026-11-11T16:00:00Z',
          windows: [
            { label: 'Five hours', usedPercent: 18, resetsAt: '2026-11-11T20:00:00Z' },
            { label: 'Weekly', usedPercent: 42, resetsAt: '2026-11-16T09:00:00Z' },
          ],
        },
      }],
    },
    {
      driver: 'codex',
      subscriptions: [{
        id: 'chatgpt', label: 'Project account', family: 'chatgpt', auth: 'vendor_login',
        modelLabels: [
          { model: 'Sample model A', performance: 'Top', cost: 'Expensive' },
          { model: 'Sample model B', performance: 'Top', cost: 'Expensive' },
        ],
        state: 'signed_in', metrics: {
          windows: [{
            ...weekly, usedPercent: 100, remainingPercent: 0, outputTokensUsed: 800_000,
            outputTokensRemaining: 0, outputTokensPerHour: 0, model: 'Sample model A',
          }],
          limitResets: { count: 1, observedAt: read, entries: [
            { label: 'Full reset', expiresAt: '2026-11-30T17:00:00Z' },
          ] },
        }, lastUsage: {
          fetchedAt: '2026-11-11T15:30:00Z',
          windows: [{ label: 'Weekly', usedPercent: 100, limitReached: true, resetsAt: '2026-11-17T18:00:00Z' }],
        },
      }],
    },
    {
      driver: 'pi',
      subscriptions: [
        {
          id: 'deepseek', label: 'DeepSeek', family: 'deepseek', auth: 'key', state: 'signed_in',
          modelLabels: [{ performance: 'Medium', cost: 'Cheap' }],
          metrics: { windows: [
            { label: 'API balance', resetsAt: null, outputTokensRemaining: 10_000_000,
              model: 'Sample model', observedAt: read },
          ] },
          lastUsage: {
            fetchedAt: '2026-11-11T16:30:00Z', windows: [],
            extra: { balances: [{ currency: 'USD', amount: '12.34' }], apiAvailable: true },
          },
        },
        {
          id: 'chatgpt', label: 'Sample ChatGPT', family: 'chatgpt', auth: 'vendor_login',
          state: 'signed_in', metrics: { windows: [{
            ...weekly, label: 'Shared weekly quota', source: 'ChatGPT dashboard snapshot',
            usedPercent: 39, remainingPercent: 61,
          }] },
        },
        {
          id: 'kimi-coding', label: 'Kimi Code', family: 'kimi-coding', auth: 'vendor_login',
          state: 'signed_in', metrics: { windows: [{
            label: 'Five hours', windowMinutes: 300, resetsAt: '2026-11-11T21:00:00Z', remainingMinutes: 300,
            observedAt: read,
          }] }, lastUsage: {
            fetchedAt: '2026-11-11T16:30:00Z',
            windows: [{ label: 'Five hours', resource: 'calls', resetsAt: '2026-11-11T21:00:00Z' }],
          },
        },
        {
          id: 'zai', label: 'Coding Plan', family: 'zai', auth: 'key', state: 'signed_in',
          metrics: { windows: [
            { label: 'Five hours', windowMinutes: 300, usedPercent: 17, remainingPercent: 83, observedAt: read },
            { ...weekly, usedPercent: 36, remainingPercent: 64 },
          ], limitResets: { count: 0, observedAt: read, entries: [] } },
          lastUsage: {
            fetchedAt: '2026-11-11T16:30:00Z',
            windows: [
              { label: 'Five hours', resource: 'tokens', usedPercent: 17, resetsAt: '2026-11-11T21:00:00Z' },
              { label: 'Weekly', resource: 'tokens', usedPercent: 36, resetsAt: '2026-11-15T15:00:00Z' },
            ],
          },
        },
      ],
    },
    {
      driver: 'mimo',
      subscriptions: [{
        id: 'xiaomi', label: 'Xiaomi MiMo', family: 'xiaomi', auth: 'vendor_login', state: 'signed_in',
        metrics: { windows: [{
          label: 'Monthly credits', windowMinutes: 44_640, resetsAt: '2026-11-27T23:59:59Z',
          expiresAt: '2026-11-27T23:59:59Z', terminal: true, remainingMinutes: 23_520,
          usedPercent: 10, remainingPercent: 90, outputTokensUsed: 666_667, outputTokensRemaining: 6_000_000,
          outputTokensPerHour: 15_306, model: 'Sample model', observedAt: read,
        }] },
        activity: { runCount: 4, inputTokens: '28900', outputTokens: '3800', lastRunAt: '2026-11-11T15:45:00Z' },
      }],
    },
  ],
};
