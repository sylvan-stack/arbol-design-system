import type { VigorEntry, VigorRollup } from '../sections/seqoya-vigor';

export const exampleVigor: VigorRollup & { subscriptions: VigorEntry[] } = {
  moment: '2026-11-12T09:10:00Z',
  headline: { driver: 'codex', subscription: 'chatgpt', label: 'Project account', vigor: 0.42 },
  subscriptions: [
    {
      driver: 'codex', subscription: 'chatgpt', family: 'chatgpt', label: 'Project account',
      result: {
        moment: '2026-11-12T09:09:00Z', vigor: 0.42, exhausted: false, predicted: false, stale: null, unknown: null,
        nextChange: { at: '2026-11-12T12:00:00Z', vigor: 0.45 },
        windows: [{ label: 'Weekly', loss: 0.42, weight: 1, contribution: 0.42, predicted: false, reason: null }],
      },
    },
    {
      driver: 'pi', subscription: 'deepseek', family: 'deepseek', label: 'DeepSeek',
      result: null,
      estimate: {
        score: 0.25, reason: 'Estimate from the saved API balance.',
        budget: { tokens: 1_000_000, currency: 'USD', rate: 1.2, referenceTokens: 1_000_000, ceiling: 0.5 },
      },
    },
    {
      driver: 'claude', subscription: 'anthropic', family: 'anthropic', label: 'Writing account',
      result: {
        moment: '2026-11-12T09:09:00Z', vigor: 0, exhausted: true, predicted: true,
        stale: { reportAgeMinutes: 334 }, unknown: null, nextChange: { at: '2026-11-12T11:00:00Z', vigor: 0.17 },
        windows: [
          { label: 'Five hours', loss: 0, contribution: 0, predicted: false, reason: null },
          { label: 'Weekly', loss: 0, contribution: 0, predicted: true, reason: null },
        ],
      },
    },
    { driver: 'mimo', subscription: 'xiaomi', family: 'xiaomi', label: 'MiMo', result: null, unavailable: 'Signed out.' },
  ],
  failures: {},
};
