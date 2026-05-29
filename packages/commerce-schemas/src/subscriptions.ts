// Subscriptions — first-class auto-ship. Drives dogfood / diesel-additive
// recurring delivery. Backed by SubscriptionBilling provider (Stripe by
// default); the worker advances the schedule and emits an Order with
// channel='subscription' on each occurrence.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

import { ConfigurationSelection } from './bundles';
import { AddressSnapshot, Channel, Currency, MoneyCents } from './common';

export const SubscriptionStatus = z.enum(['trialing', 'active', 'past_due', 'paused', 'cancelled']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const IntervalUnit = z.enum(['day', 'week', 'month', 'year']);
export type IntervalUnit = z.infer<typeof IntervalUnit>;

export const SubscriptionScheduleInput = z.object({
  intervalUnit: IntervalUnit,
  intervalCount: z.number().int().positive().max(365),
  deliveriesPerCycle: z.number().int().positive().default(1),
  // Days of the month / week the renewal anchors to (when meaningful).
  anchorDayOfMonth: z.number().int().min(1).max(31).optional(),
  anchorDayOfWeek: z.number().int().min(0).max(6).optional(),
  endAfterOccurrences: z.number().int().positive().optional(),
  endOnDate: z.string().datetime().optional(),
});
export type SubscriptionScheduleInput = z.infer<typeof SubscriptionScheduleInput>;

export const SubscriptionItemInput = z.object({
  variantId: Uuid,
  quantity: z.number().int().positive().default(1),
  configuration: ConfigurationSelection.optional(),
  unitPriceCents: MoneyCents,
  // For configurator-driven add-ons rooted under another sub item.
  addonOfId: Uuid.optional(),
});
export type SubscriptionItemInput = z.infer<typeof SubscriptionItemInput>;

export const CreateSubscriptionInput = z.object({
  customerId: Uuid,
  channel: Channel.default('storefront'),
  currency: Currency,
  schedule: SubscriptionScheduleInput,
  items: z.array(SubscriptionItemInput).min(1).max(50),
  shippingAddress: AddressSnapshot,
  billingAddress: AddressSnapshot.optional(),
  paymentProviderSlug: z.string().min(1).max(63),
  paymentMethodRef: z.string().min(1).max(255),
  trialDays: z.number().int().nonnegative().max(365).optional(),
  startAt: z.string().datetime().optional(),
});
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionInput>;

export const UpdateSubscriptionItemsInput = z.object({
  subscriptionId: Uuid,
  items: z.array(SubscriptionItemInput).min(1).max(50),
});
export type UpdateSubscriptionItemsInput = z.infer<typeof UpdateSubscriptionItemsInput>;

export const PauseSubscriptionInput = z.object({
  subscriptionId: Uuid,
  until: z.string().datetime().optional(), // null = indefinite
  reason: z.string().max(2000).optional(),
});
export type PauseSubscriptionInput = z.infer<typeof PauseSubscriptionInput>;

export const ResumeSubscriptionInput = z.object({
  subscriptionId: Uuid,
});
export type ResumeSubscriptionInput = z.infer<typeof ResumeSubscriptionInput>;

export const SkipNextOccurrenceInput = z.object({
  subscriptionId: Uuid,
  reason: z.string().max(2000).optional(),
});
export type SkipNextOccurrenceInput = z.infer<typeof SkipNextOccurrenceInput>;

export const CancelSubscriptionInput = z.object({
  subscriptionId: Uuid,
  atPeriodEnd: z.boolean().default(true),
  reason: z.string().max(2000).optional(),
});
export type CancelSubscriptionInput = z.infer<typeof CancelSubscriptionInput>;

export const UpdateSubscriptionScheduleInput = z.object({
  subscriptionId: Uuid,
  schedule: SubscriptionScheduleInput,
});
export type UpdateSubscriptionScheduleInput = z.infer<typeof UpdateSubscriptionScheduleInput>;

export const ChangeSubscriptionAddressInput = z.object({
  subscriptionId: Uuid,
  shippingAddress: AddressSnapshot.optional(),
  billingAddress: AddressSnapshot.optional(),
});
export type ChangeSubscriptionAddressInput = z.infer<typeof ChangeSubscriptionAddressInput>;

// Dunning policy — how the platform retries a failed renewal charge.
// Stored per-tenant on `commerce_storefront_settings` and reused by every
// subscription unless overridden.
export const DunningPolicy = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(4),
  retryDelaysHours: z.array(z.number().int().positive()).max(10).default([24, 72, 168, 336]),
  finalOutcome: z.enum(['cancel', 'pause', 'mark_past_due']).default('pause'),
  notifyCustomerOnFirstFailure: z.boolean().default(true),
  notifyCustomerOnFinalFailure: z.boolean().default(true),
});
export type DunningPolicy = z.infer<typeof DunningPolicy>;
