// SubscriptionBilling — drives the actual charge schedule for a
// Sparx Subscription. Stripe implements this with Stripe Subscriptions;
// future providers (Braintree, Recurly) plug in here without touching
// subscriptionService.

import type { Currency, DunningPolicy, IntervalUnit, MoneyCents } from '@sparx/commerce-schemas';

import type { ProviderRunContext } from './context';
import type { ProviderMetadataDescriptor } from './metadata';

export interface SubscriptionPlanInput {
  /** Sparx-side Subscription.id, used for idempotency + correlation. */
  subscriptionId: string;
  providerCustomerRef: string;
  paymentMethodRef: string;
  currency: Currency;
  schedule: {
    intervalUnit: IntervalUnit;
    intervalCount: number;
    anchorAt?: string; // ISO
    trialDays?: number;
    endAfterOccurrences?: number;
    endOnDate?: string;
  };
  items: {
    sku: string;
    description: string;
    quantity: number;
    unitPriceCents: MoneyCents;
    metadata?: Record<string, string>;
  }[];
  dunning?: DunningPolicy;
}

export interface ScheduleRef {
  providerScheduleRef: string;
  nextOccurrenceAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export interface SubscriptionBilling {
  readonly metadata: ProviderMetadataDescriptor;

  createSchedule(ctx: ProviderRunContext, plan: SubscriptionPlanInput): Promise<ScheduleRef>;

  pause(
    ctx: ProviderRunContext,
    input: { providerScheduleRef: string; until?: string }
  ): Promise<void>;

  resume(ctx: ProviderRunContext, input: { providerScheduleRef: string }): Promise<void>;

  skipNextOccurrence(
    ctx: ProviderRunContext,
    input: { providerScheduleRef: string }
  ): Promise<void>;

  cancel(
    ctx: ProviderRunContext,
    input: { providerScheduleRef: string; atPeriodEnd: boolean }
  ): Promise<void>;

  changeQuantity(
    ctx: ProviderRunContext,
    input: {
      providerScheduleRef: string;
      items: { sku: string; quantity: number; unitPriceCents: MoneyCents }[];
    }
  ): Promise<void>;

  /** Issue a customer portal session token so the storefront can deep-link
   *  the customer into the provider's hosted self-service surface (Stripe
   *  Customer Portal). Optional — implementations may throw
   *  ProviderUnsupportedError. */
  createPortalSession?(
    ctx: ProviderRunContext,
    input: { providerCustomerRef: string; returnUrl: string }
  ): Promise<{ portalUrl: string }>;
}
