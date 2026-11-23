import {
  allowanceWindowType, defaultSubscriptionUserScore, isSubscriptionUserScore, subscriptionKey,
  subscriptionName, subscriptionVendor, type EstimatedTokenCost, type SubscriptionListing,
  type SubscriptionRecord,
} from './seqoya-subscriptions';
import type { VigorView } from './seqoya-vigor';

const week = 7 * 24 * 60 * 60_000;

export type QuotaDashChoice = { windowEnd: number; marked: boolean };
export type QuotaDashChoices = Record<string, QuotaDashChoice>;

export interface VigorPriorityView extends VigorView {
  priority?: {
    listing?: SubscriptionListing;
    now: number;
    choices?: QuotaDashChoices;
    setChoice?: (key: string, choice: QuotaDashChoice) => void;
  };
}

type Currency = EstimatedTokenCost['currency'];
type Loss = { amount: number; currency: Currency; basis: string };

interface PriorityRow {
  key: string;
  name: string;
  windowEnd?: number;
  dash: boolean;
  reason?: string;
  loss?: Loss;
  userScore?: number;
  score?: number;
}

function automaticDeadline(driver: string, account: SubscriptionRecord, now: number, end: number) {
  const metrics = account.metrics;
  const inventory = metrics?.limitResets;
  if (inventory?.count === 0) return undefined;
  const deadlines = inventory?.entries.flatMap(grant => {
    const coversWeek = driver === 'claude' && /^weekly reset$/i.test(grant.label)
      || driver === 'codex' && /^full reset$/i.test(grant.label)
        && /^ChatGPT (Plus|Pro)( |$)/.test(metrics?.price?.label ?? '');
    const expires = typeof grant.expiresAt === 'string' ? Date.parse(grant.expiresAt) : NaN;
    return coversWeek && !grant.expired && expires > now && expires <= end + week / 2
      ? [expires] : [];
  }) ?? [];
  return deadlines.length ? Math.min(...deadlines) : undefined;
}

function priorityRow(driver: string, account: SubscriptionRecord, now: number, choices: QuotaDashChoices): PriorityRow {
  const key = JSON.stringify([driver, account.id, account.createdAt ?? null]);
  const name = subscriptionName(driver, account);
  const userScore = isSubscriptionUserScore(account.userScore) ? account.userScore : defaultSubscriptionUserScore;
  if (account.state !== 'signed_in' || account.metrics?.balance) return { key, name, dash: false, userScore };
  const rate = account.metrics?.estimatedTokenCost;
  const weekly = account.metrics?.windows.filter(window => allowanceWindowType(window) === 'week'
    && !window.next && !window.pendingStart && Date.parse(window.resetsAt ?? '') > now) ?? [];
  const window = weekly.find(window => window.label === rate?.window) ?? weekly[0];
  if (!window) return { key, name, dash: false, userScore };

  const windowEnd = Date.parse(window.resetsAt ?? '');
  const choice = choices[key]?.windowEnd === windowEnd ? choices[key] : undefined;
  const deadline = automaticDeadline(driver, account, now, windowEnd);
  const dash = choice?.marked ?? (deadline !== undefined);
  const reason = choice ? (choice.marked ? 'Marked manually for this weekly window.' : 'Dismissed for this weekly window.')
    : deadline === undefined ? undefined : 'A weekly reset expires ' + new Date(deadline).toLocaleString() + '.';
  const remaining = window.outputTokensRemaining;
  const amount = rate && rate.window === window.label && remaining !== undefined && remaining >= 0
    && rate.perMillion >= 0 ? remaining * rate.perMillion / 1_000_000 : undefined;
  const loss = rate && amount !== undefined && Number.isFinite(amount)
    ? { amount, currency: rate.currency, basis: rate.basis } : undefined;

  return { key, name, windowEnd, dash, reason, loss, userScore };
}

export function vigorPriorityRows(view: VigorPriorityView, choices: QuotaDashChoices): PriorityRow[] | undefined {
  const { listing, now } = view.priority ?? { now: Date.now() };
  if (!listing) return view.rollup?.subscriptions.map(entry => ({
    key: subscriptionKey(entry.driver, entry.subscription), name: entry.label || subscriptionVendor(entry.driver, entry.family), dash: false,
  }));
  const rows = listing.drivers.flatMap(({ driver, subscriptions }) =>
    (subscriptions ?? []).map(account => priorityRow(driver, account, now, choices)));
  const currencies = new Set(rows.flatMap(row => row.loss ? [row.loss.currency] : []));
  const maxLoss = currencies.size === 1 ? Math.max(0, ...rows.map(row => row.loss?.amount ?? 0)) : 0;
  for (const row of rows) {
    if (row.windowEnd === undefined || row.userScore === undefined) continue;
    const lossFactor = maxLoss > 0 ? (row.loss?.amount ?? 0) / maxLoss : 0;
    row.score = (row.dash ? 0.51 : 0) + 0.49 * (lossFactor + row.userScore) / 2;
  }
  return rows.sort((left, right) => (right.score ?? -1) - (left.score ?? -1) || left.name.localeCompare(right.name));
}
