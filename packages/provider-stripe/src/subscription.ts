// Stripe Subscriptions — drives the auto-ship schedule for Sparx
// Subscriptions. Stripe Customer Portal handles the customer-side
// pause/skip/cancel; subscription-billing-worker advances Sparx state on
// the back of subscription webhook events.

import type {
  ProviderRunContext,
  ScheduleRef,
  SubscriptionBilling,
  SubscriptionPlanInput,
} from '@sparx/integration-framework';
import { ProviderUnsupportedError } from '@sparx/integration-framework';

import { stripeMetadata } from './metadata';

function unimplemented(method: string): Promise<never> {
  return Promise.reject(new ProviderUnsupportedError('stripe', `${method} (Phase 0 stub)`));
}

export const stripeSubscriptionBilling: SubscriptionBilling = {
  metadata: stripeMetadata,

  createSchedule(_ctx: ProviderRunContext, _plan: SubscriptionPlanInput): Promise<ScheduleRef> {
    return unimplemented('createSchedule');
  },

  pause(
    _ctx: ProviderRunContext,
    _input: { providerScheduleRef: string; until?: string }
  ): Promise<void> {
    return unimplemented('pause');
  },

  resume(_ctx: ProviderRunContext, _input: { providerScheduleRef: string }): Promise<void> {
    return unimplemented('resume');
  },

  skipNextOccurrence(
    _ctx: ProviderRunContext,
    _input: { providerScheduleRef: string }
  ): Promise<void> {
    return unimplemented('skipNextOccurrence');
  },

  cancel(
    _ctx: ProviderRunContext,
    _input: { providerScheduleRef: string; atPeriodEnd: boolean }
  ): Promise<void> {
    return unimplemented('cancel');
  },

  changeQuantity(
    _ctx: ProviderRunContext,
    _input: {
      providerScheduleRef: string;
      items: { sku: string; quantity: number; unitPriceCents: number }[];
    }
  ): Promise<void> {
    return unimplemented('changeQuantity');
  },

  createPortalSession(
    _ctx: ProviderRunContext,
    _input: { providerCustomerRef: string; returnUrl: string }
  ): Promise<{ portalUrl: string }> {
    return unimplemented('createPortalSession');
  },
};
