import type { SubscriptionListing } from '../sections/seqoya-subscriptions';

export const exampleListing: SubscriptionListing = {
  drivers: [
    {
      driver: 'claude',
      subscriptions: [{
        id: 'anthropic', label: 'Writing account', family: 'anthropic', auth: 'vendor_login',
        state: 'signed_in', lastUsage: {
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
        state: 'signed_in', lastUsage: {
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
          lastUsage: {
            fetchedAt: '2026-11-11T16:30:00Z', windows: [],
            extra: { balances: [{ currency: 'USD', amount: '12.34' }], apiAvailable: true },
          },
        },
        {
          id: 'kimi-coding', label: 'Kimi Code', family: 'kimi-coding', auth: 'vendor_login',
          state: 'signed_in', lastUsage: {
            fetchedAt: '2026-11-11T16:30:00Z',
            windows: [{ label: 'Five hours', resource: 'calls', resetsAt: '2026-11-11T21:00:00Z' }],
          },
        },
        {
          id: 'zai', label: 'Coding Plan', family: 'zai', auth: 'key', state: 'signed_in',
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
        activity: { runCount: 4, inputTokens: '28900', outputTokens: '3800', lastRunAt: '2026-11-11T15:45:00Z' },
      }],
    },
  ],
};
