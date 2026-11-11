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
        state: 'signed_in', lastUsage: {
          fetchedAt: '2026-11-11T15:30:00Z',
          windows: [{ label: 'Weekly', usedPercent: 100, limitReached: true, resetsAt: '2026-11-17T18:00:00Z' }],
        },
      }],
    },
    {
      driver: 'pi',
      subscriptions: [
        { id: 'deepseek', label: 'DeepSeek', family: 'deepseek', auth: 'key', state: 'signed_out' },
        {
          id: 'kimi-coding', label: 'Kimi Code', family: 'kimi-coding', auth: 'vendor_login',
          state: 'signed_in', lastUsage: {
            fetchedAt: '2026-11-11T16:30:00Z',
            windows: [{ label: 'Five hours', resource: 'calls', resetsAt: '2026-11-11T21:00:00Z' }],
          },
        },
        {
          id: 'zai', label: 'Coding Plan', family: 'zai', auth: 'key', state: 'needs_attention',
          problem: { message: 'The provider rejected the saved credential.' },
        },
      ],
    },
    {
      driver: 'mimo',
      subscriptions: [{ id: 'xiaomi', label: 'Xiaomi MiMo', family: 'xiaomi', auth: 'vendor_login', state: 'signing_in' }],
    },
  ],
};
