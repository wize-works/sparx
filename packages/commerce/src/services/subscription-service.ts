// subscriptionService — auto-ship / recurring orders. Backed by a
// SubscriptionBilling provider (Stripe by default); the
// subscription-billing-worker advances the schedule and creates an
// Order with channel='subscription' on each occurrence.

import type {
  CancelSubscriptionInput,
  ChangeSubscriptionAddressInput,
  CreateSubscriptionInput,
  PauseSubscriptionInput,
  ResumeSubscriptionInput,
  SkipNextOccurrenceInput,
  SubscriptionStatus,
  UpdateSubscriptionItemsInput,
  UpdateSubscriptionScheduleInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

export interface SubscriptionSummary {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  nextOccurrenceAt: string | null;
  itemCount: number;
  monthlyRecurringRevenueCents: number;
  currency: string;
  providerSlug: string;
}

export function list(
  _ctx: ServiceContext,
  _filter: { status?: SubscriptionStatus; customerId?: string; take?: number; skip?: number } = {}
): Promise<{ items: SubscriptionSummary[]; total: number }> {
  return notImplemented('subscriptionService.list');
}

export function get(_ctx: ServiceContext, _subscriptionId: string): Promise<unknown> {
  return notImplemented('subscriptionService.get');
}

export function listForCustomer(
  _ctx: ServiceContext,
  _customerId: string
): Promise<SubscriptionSummary[]> {
  return notImplemented('subscriptionService.listForCustomer');
}

export function create(
  _ctx: ServiceContext,
  _input: CreateSubscriptionInput
): Promise<{ id: string; nextOccurrenceAt: string }> {
  return notImplemented('subscriptionService.create');
}

export function updateItems(
  _ctx: ServiceContext,
  _input: UpdateSubscriptionItemsInput
): Promise<void> {
  return notImplemented('subscriptionService.updateItems');
}

export function updateSchedule(
  _ctx: ServiceContext,
  _input: UpdateSubscriptionScheduleInput
): Promise<void> {
  return notImplemented('subscriptionService.updateSchedule');
}

export function changeAddress(
  _ctx: ServiceContext,
  _input: ChangeSubscriptionAddressInput
): Promise<void> {
  return notImplemented('subscriptionService.changeAddress');
}

export function pause(_ctx: ServiceContext, _input: PauseSubscriptionInput): Promise<void> {
  return notImplemented('subscriptionService.pause');
}

export function resume(_ctx: ServiceContext, _input: ResumeSubscriptionInput): Promise<void> {
  return notImplemented('subscriptionService.resume');
}

export function skipNextOccurrence(
  _ctx: ServiceContext,
  _input: SkipNextOccurrenceInput
): Promise<void> {
  return notImplemented('subscriptionService.skipNextOccurrence');
}

export function cancel(_ctx: ServiceContext, _input: CancelSubscriptionInput): Promise<void> {
  return notImplemented('subscriptionService.cancel');
}

// ─── Worker entry points ──────────────────────────────────────────────

/** Subscription-billing-worker tick. Returns subscriptions whose
 *  nextOccurrenceAt has passed; the worker iterates and calls
 *  processOccurrence on each. */
export function findDueOccurrences(
  _ctx: ServiceContext,
  _asOf: string,
  _limit: number
): Promise<string[]> {
  return notImplemented('subscriptionService.findDueOccurrences');
}

/** Generate a renewal order + advance the schedule. Idempotent on
 *  (subscriptionId, occurrenceAt). */
export function processOccurrence(
  _ctx: ServiceContext,
  _subscriptionId: string
): Promise<{ orderId: string | null; nextOccurrenceAt: string | null }> {
  return notImplemented('subscriptionService.processOccurrence');
}

/** Record a dunning attempt result and decide the next action per the
 *  policy. */
export function recordDunningAttempt(
  _ctx: ServiceContext,
  _input: {
    subscriptionId: string;
    paymentRef: string;
    outcome: 'succeeded' | 'failed' | 'retry_scheduled';
    nextRetryAt?: string;
  }
): Promise<void> {
  return notImplemented('subscriptionService.recordDunningAttempt');
}
