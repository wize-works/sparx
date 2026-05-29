// checkoutService — multi-step state machine driving cart → order.
// All side effects (payment intent, shipping rate, tax calculation) are
// captured as provider refs on CheckoutSession so the flow is idempotent
// across reloads. complete() is the single function that creates an
// Order via @sparx/crm's orderService.

import type {
  CheckoutSessionSnapshot,
  CompleteCheckoutInput,
  StartCheckoutInput,
  SubmitContactInput,
  SubmitPaymentInput,
  SubmitShippingInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

export function start(
  _ctx: ServiceContext,
  _input: StartCheckoutInput
): Promise<{ sessionId: string }> {
  return notImplemented('checkoutService.start');
}

export function get(
  _ctx: ServiceContext,
  _sessionId: string
): Promise<CheckoutSessionSnapshot | null> {
  return notImplemented('checkoutService.get');
}

export function submitContact(_ctx: ServiceContext, _input: SubmitContactInput): Promise<void> {
  return notImplemented('checkoutService.submitContact');
}

export function submitShipping(_ctx: ServiceContext, _input: SubmitShippingInput): Promise<void> {
  return notImplemented('checkoutService.submitShipping');
}

export function submitPayment(_ctx: ServiceContext, _input: SubmitPaymentInput): Promise<void> {
  return notImplemented('checkoutService.submitPayment');
}

/** Final commit. Creates an Order via @sparx/crm.orderService.create,
 *  fires order.placed + inventory.adjusted + email.send events
 *  post-commit. Idempotent via input.idempotencyKey. */
export function complete(
  _ctx: ServiceContext,
  _input: CompleteCheckoutInput
): Promise<{ orderId: string; orderNumber: string }> {
  return notImplemented('checkoutService.complete');
}

export function expire(_ctx: ServiceContext, _sessionId: string): Promise<void> {
  return notImplemented('checkoutService.expire');
}
