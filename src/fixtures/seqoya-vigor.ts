import type { VigorEntry, VigorRollup } from '../sections/seqoya-vigor';

export const exampleVigor: VigorRollup & { subscriptions: VigorEntry[] } = {
  moment: '2026-11-12T09:10:00Z',
  headline: { driver: 'codex', subscription: 'chatgpt', label: 'Project account', vigor: 0.4230357142857143 },
  subscriptions: [
    {
      driver: 'codex', subscription: 'chatgpt', family: 'chatgpt', label: 'Project account',
      result: {
        moment: '2026-11-12T09:09:00Z', vigor: 0.4230357142857143, exhausted: false, predicted: false, stale: null, unknown: null,
        nextChange: { at: '2026-11-12T12:00:00Z', vigor: 0 },
        windows: [{
          label: 'Weekly', usedPercent: 56, resetsAt: '2026-11-12T12:00:00Z', windowMinutes: 10080,
          loss: 0.4230357142857143, weight: 1, contribution: 0.4230357142857143, predicted: false, reason: null,
        }],
      },
    },
    {
      driver: 'pi', subscription: 'deepseek', family: 'deepseek', label: 'DeepSeek',
      result: null,
      estimate: {
        score: 0.25, reason: 'Estimate from the saved API balance.',
        budget: { amount: '1.20', tokens: 1_000_000, currency: 'USD', rate: 1.2, referenceTokens: 1_000_000, ceiling: 0.5 },
      },
    },
    {
      driver: 'pi', subscription: 'chatgpt', family: 'chatgpt', label: 'ChatGPT',
      result: null,
      estimate: { score: 0.05, reason: 'Provisional score while usable allowance data is missing.' },
      activity: { runCount: 2, inputTokens: '20000', outputTokens: '2500', lastRunAt: '2026-11-12T08:00:00Z' },
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
    { driver: 'mimo', subscription: 'xiaomi', family: 'xiaomi', label: 'MiMo', result: null, unavailable: 'Signed out.', activity: { runCount: 0 } },
  ],
  failures: {},
};
