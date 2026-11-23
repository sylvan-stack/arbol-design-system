import {
  allowanceWindowType, defaultSubscriptionUserScore, isSubscriptionUserScore, subscriptionKey,
  subscriptionName, subscriptionVendor, type EstimatedTokenCost, type SubscriptionListing,
  type SubscriptionRecord,
} from './seqoya-subscriptions';
import type { VigorView } from './seqoya-vigor';

const hour = 60 * 60_000;
const weeklyHours = 7 * 24;
const week = weeklyHours * hour;

export const vigorFactors = [
  { key: 'dash', variable: 'D', coefficient: 'a₁', label: 'Quota Dash' },
  { key: 'time', variable: 'T', coefficient: 'a₂', label: 'Time urgency' },
  { key: 'tokens', variable: 'Q', coefficient: 'a₃', label: 'Available equivalents' },
  { key: 'loss', variable: 'L', coefficient: 'a₄', label: 'Potential weekly quota loss' },
  { key: 'user', variable: 'U', coefficient: 'a₅', label: 'User score' },
] as const;

type Factor = (typeof vigorFactors)[number]['key'];
export type VigorCurrency = EstimatedTokenCost['currency'];
export const vigorCurrencies = ['USD', 'EUR', 'CNY'] as const satisfies readonly VigorCurrency[];

export interface VigorSettings {
  weights: Record<Factor, number>;
  tokenScale: number;
  lossScale: number;
  lossCurrency: VigorCurrency;
}

export const defaultVigorSettings: VigorSettings = {
  weights: { dash: 51, time: 20, tokens: 12, loss: 10, user: 7 },
  tokenScale: 400_000,
  lossScale: 6,
  lossCurrency: 'USD',
};

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isVigorSettings(value: unknown): value is VigorSettings {
  if (!value || typeof value !== 'object') return false;
  const { weights, tokenScale, lossScale, lossCurrency } = value as Partial<VigorSettings>;
  if (!weights || typeof weights !== 'object' || !vigorFactors.every(({ key }) => nonnegative(weights[key]))) return false;
  const total = vigorFactors.reduce((sum, { key }) => sum + weights[key], 0);
  return total > 0 && Number.isFinite(total)
    && nonnegative(tokenScale) && tokenScale > 0 && nonnegative(lossScale) && lossScale > 0
    && lossCurrency !== undefined && vigorCurrencies.includes(lossCurrency);
}

export type QuotaDashChoice = { windowEnd: number; marked: boolean };
export type QuotaDashChoices = Record<string, QuotaDashChoice>;

export interface VigorPriorityView extends VigorView {
  priority?: {
    listing?: SubscriptionListing;
    now: number;
    choices?: QuotaDashChoices;
    setChoice?: (key: string, choice: QuotaDashChoice) => void;
    settings?: VigorSettings;
    setSettings?: (settings: VigorSettings) => void;
  };
}

type Loss = { amount: number; currency: VigorCurrency; perMillion: number; basis: string };

export interface VigorCalculation {
  dash: boolean;
  hoursLeft: number;
  tokens?: number;
  loss?: Loss;
  userScore: number;
  terms: { factor?: number; weight: number; contribution: number }[];
  partial: boolean;
  sum: number;
  score: number;
  exhausted: boolean;
}

interface PriorityRow {
  key: string;
  name: string;
  windowEnd?: number;
  dash: boolean;
  reason?: string;
  userScore?: number;
  resetReady?: boolean;
  current?: VigorCalculation;
  next?: VigorCalculation;
}

function eligibleResetDeadlines(driver: string, account: SubscriptionRecord, now: number): number[] {
  const metrics = account.metrics;
  const inventory = metrics?.limitResets;
  if (inventory?.count === 0) return [];
  return inventory?.entries.flatMap(grant => {
    const coversWeek = driver === 'claude' && /^weekly reset$/i.test(grant.label)
      || driver === 'codex' && /^full reset$/i.test(grant.label)
        && /^ChatGPT (Plus|Pro)( |$)/.test(metrics?.price?.label ?? '');
    const expires = grant.expiresAt === 0 ? Infinity : Date.parse(grant.expiresAt ?? '');
    return coversWeek && !grant.expired && expires > now ? [expires] : [];
  }) ?? [];
}

function potentialLoss(tokens: number | undefined, rate: EstimatedTokenCost | undefined): Loss | undefined {
  if (tokens === undefined || !rate || !nonnegative(rate.perMillion)) return undefined;
  const amount = tokens / 1_000_000 * rate.perMillion;
  return Number.isFinite(amount) ? { amount, currency: rate.currency, perMillion: rate.perMillion, basis: rate.basis } : undefined;
}

function saturate(value: number, scale: number): number {
  return 1 / (1 + scale / value);
}

function calculate(
  settings: VigorSettings,
  dash: boolean,
  hoursLeft: number,
  tokens: number | undefined,
  rate: EstimatedTokenCost | undefined,
  userScore: number,
  exhausted = false,
): VigorCalculation {
  const loss = potentialLoss(tokens, rate);
  const factors: Record<Factor, number | undefined> = {
    dash: Number(dash),
    time: 1 - Math.min(weeklyHours, Math.max(0, hoursLeft)) / weeklyHours,
    tokens: tokens === undefined ? undefined : saturate(tokens, settings.tokenScale),
    loss: loss && loss.currency === settings.lossCurrency ? saturate(loss.amount, settings.lossScale) : undefined,
    user: userScore,
  };
  const totalWeight = vigorFactors.reduce((sum, { key }) => sum + settings.weights[key], 0);
  const terms = vigorFactors.map(({ key }) => {
    const weight = settings.weights[key] / totalWeight;
    const factor = factors[key];
    return { factor, weight, contribution: weight * (factor ?? 0) };
  });
  const sum = terms.reduce((total, term) => total + term.contribution, 0);
  return { dash, hoursLeft, tokens, loss, userScore, terms, sum, score: exhausted ? 0 : sum, exhausted,
    partial: terms.some(term => term.weight > 0 && term.factor === undefined) };
}

function priorityRow(driver: string, account: SubscriptionRecord, now: number, choices: QuotaDashChoices, settings: VigorSettings): PriorityRow {
  const key = JSON.stringify([driver, account.id, account.createdAt ?? null]);
  const name = subscriptionName(driver, account);
  const userScore = isSubscriptionUserScore(account.userScore) ? account.userScore : defaultSubscriptionUserScore;
  const base = { key, name, dash: false, userScore };
  if (account.state !== 'signed_in' || account.metrics?.balance) return base;

  const price = account.metrics?.estimatedTokenCost;
  const weekly = account.metrics?.windows.filter(window => allowanceWindowType(window) === 'week'
    && !window.next && !window.pendingStart && Date.parse(window.resetsAt ?? '') > now) ?? [];
  const window = weekly.find(window => window.label === price?.window) ?? weekly[0];
  if (!window) return base;

  const windowEnd = Date.parse(window.resetsAt ?? '');
  const rate = price?.window === window.label ? price : undefined;
  const choice = choices[key]?.windowEnd === windowEnd ? choices[key] : undefined;
  const deadlines = eligibleResetDeadlines(driver, account, now);
  const deadline = Math.min(...deadlines);
  const automatic = deadline <= windowEnd + week / 2;
  const dash = choice?.marked ?? automatic;
  const reason = choice ? (choice.marked ? 'Marked manually for this weekly window.' : 'Dismissed for this weekly window.')
    : automatic ? 'A weekly reset expires ' + new Date(deadline).toLocaleString() + '.' : undefined;
  const exhausted = window.outputTokensRemaining === 0 || window.remainingPercent === 0 || window.usedPercent === 100;
  const tokens = exhausted ? 0 : nonnegative(window.outputTokensRemaining) ? window.outputTokensRemaining : undefined;
  const resetReady = exhausted && dash && deadlines.length > 0;
  const current = calculate(settings, dash, (windowEnd - now) / hour, tokens, rate, userScore, exhausted && !resetReady);

  let next: VigorCalculation | undefined;
  if (exhausted) {
    const full = nonnegative(window.outputTokensUsed) && window.outputTokensUsed > 0 ? window.outputTokensUsed : undefined;
    const nextDash = deadlines.some(expiry => expiry > windowEnd && expiry <= windowEnd + week * 1.5);
    next = calculate(settings, nextDash, weeklyHours, full, rate, userScore);
  }
  return { ...base, windowEnd, dash, reason, resetReady, current, next };
}

export function vigorPriorityRows(view: VigorPriorityView, choices: QuotaDashChoices, settings: VigorSettings): PriorityRow[] | undefined {
  const { listing, now } = view.priority ?? { now: Date.now() };
  if (!listing) return view.rollup?.subscriptions.map(entry => ({
    key: subscriptionKey(entry.driver, entry.subscription), name: entry.label || subscriptionVendor(entry.driver, entry.family), dash: false,
  }));
  return listing.drivers.flatMap(({ driver, subscriptions }) =>
    (subscriptions ?? []).map(account => priorityRow(driver, account, now, choices, settings)))
    .sort((left, right) => (right.current?.score ?? -1) - (left.current?.score ?? -1) || left.name.localeCompare(right.name));
}
