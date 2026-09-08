// Public checkout write surface for the storefront — the multi-step flow that
// turns a cart into an order.
//
//   POST /v1/public/commerce/checkout                  ?tenant= { cartId, email? } → { sessionId }
//   GET  /v1/public/commerce/checkout/:sessionId       ?tenant=
//   POST /v1/public/commerce/checkout/:sessionId/contact   { email, name?, phone?, acceptsMarketing? }
//   POST /v1/public/commerce/checkout/:sessionId/shipping-quote → { deliveryOffered, rates }
//   POST /v1/public/commerce/checkout/:sessionId/shipping  { shippingRateRef, shippingProviderSlug, shippingAddress?, billingAddress? }
//   POST /v1/public/commerce/checkout/:sessionId/payment-intent → { clientSecret, paymentRef, providerSlug }
//   POST /v1/public/commerce/checkout/:sessionId/payment   { paymentProviderSlug, paymentRef, poNumber? }
//   POST /v1/public/commerce/checkout/:sessionId/complete  { idempotencyKey?, expectedTotalCents? } → { orderId, orderNumber }
//
// Ownership is proven the same way as the cart routes: the session's underlying
// cart must match the caller's x-cart-token.

import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  cartService,
  checkoutService,
  discountService,
  offerService,
  shippingService,
  type ServiceContext,
} from '@wizeworks/commerce';
import { SubmitPaymentInput } from '@wizeworks/commerce-schemas';
import { withTenant } from '@wizeworks/db';
import { ok } from '@wizeworks/api-core/envelope';
import { badRequest, notFound } from '@wizeworks/api-core/errors';

import {
  assertCartToken,
  assertCartTokenForWrite,
  publicCommerceContext,
} from '../../../lib/public-commerce-context.js';
import { resolveOrderAttribution } from '../../../lib/attribution.js';
import { reconcileCompletedCheckoutPayment } from '../../../lib/payment-webhook-reconcile.js';

const SessionParam = z.object({ sessionId: z.string().uuid() });

const StartBody = z.object({
  cartId: z.string().uuid(),
  email: z.string().email().optional(),
});

const ContactBody = z.object({
  email: z.string().email(),
  // The buyer's name, asked for beside the email rather than buried in a
  // delivery address — see the shipping-quote route below (issue 064).
  name: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  acceptsMarketing: z.boolean().optional(),
});

const Address = z.object({
  name: z.string().min(1).max(255),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).optional(),
  city: z.string().min(1).max(127),
  region: z.string().max(127).optional(),
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2),
  phone: z.string().max(50).optional(),
});

const ShippingQuoteBody = z.object({
  // Full destination address, sent once the shopper's shipping form is
  // filled in (the checkout form collects it before "Get shipping rates" is
  // clickable). Live carrier rating needs the real street/city — a carrier
  // geocodes the full address to rate, not just the ZIP — so without this,
  // live rates are silently unreachable and every quote falls back to the
  // manual/flat rate regardless of provider installed. `destinationCountry`/
  // `destinationPostal` remain as a fallback for a caller that only has
  // those (still enough for manual-zone matching, just not live rating).
  destinationAddress: Address.optional(),
  destinationCountry: z.string().length(2).optional(),
  destinationPostal: z.string().max(20).optional(),
});

const ShippingBody = z.object({
  // Optional, and only genuinely optional for a collection rate — the service
  // refuses a delivery with nothing to deliver to (issue 064).
  shippingAddress: Address.optional(),
  billingAddress: Address.optional(),
  shippingRateRef: z.string().min(1).max(255),
  shippingProviderSlug: z.string().min(1).max(63),
  // Stable identity of the chosen rate, so submitShipping can re-find it after a
  // re-quote even when the carrier's single-use ref has rotated (BUG-010).
  shippingService: z.string().min(1).max(255).optional(),
  shippingCarrier: z.string().min(1).max(255).optional(),
});

// The storefront's checkout form collects the recipient's name into this
// route's own `Address.name`, but the canonical AddressSnapshot shape stored
// on the order (wizeworks/packages/crm-schemas) keys it `recipientName`. Map at this
// boundary — without it the name silently never lands on the order, and a
// merchant can't buy a real carrier label later (Shippo requires a complete
// recipient name to purchase, though it tolerates a missing one for a quote).
function toAddressSnapshot(addr: z.infer<typeof Address>): Record<string, unknown> {
  const { name, ...rest } = addr;
  return { ...rest, recipientName: name };
}

const IntentBody = z.object({
  // The storefront's post-payment return URL for hosted-redirect gateways (docs/111 D4).
  returnUrl: z.string().url().max(2048).optional(),
  cancelUrl: z.string().url().max(2048).optional(),
});

const CompleteBody = z.object({
  idempotencyKey: z.string().min(8).max(127).optional(),
  // The total on the button the shopper pressed. The service refuses rather than
  // write an order for a figure she was never shown (issues 298, 300).
  expectedTotalCents: z.number().int().nonnegative().optional(),
});

const DiscountBody = z.object({
  code: z.string().min(1).max(64),
});

const OfferAcceptBody = z.object({
  /** The SHOWING being accepted, not the offer. See the route. */
  impressionId: z.string().uuid(),
});

// Resolve the session → its cart, and assert the caller owns that cart.
async function assertSessionOwner(
  request: Parameters<typeof assertCartToken>[0],
  ctx: ServiceContext,
  tenantId: string,
  sessionId: string
): Promise<{ cartId: string }> {
  const session = await withTenant({ tenantId }, (tx) =>
    tx.checkoutSession.findFirst({ where: { id: sessionId }, select: { cartId: true } })
  );
  if (!session) throw notFound('CheckoutSession', sessionId);
  await assertCartToken(request, tenantId, session.cartId);
  return { cartId: session.cartId };
}

const publicCheckoutRoutes: FastifyPluginAsync = async (app) => {
  // Start a checkout session from a cart.
  app.post('/v1/public/commerce/checkout', async (request) => {
    const body = StartBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);
    // Starting a checkout on a basket the sweep had marked quiet is the
    // strongest "came back" there is - they are here to pay for it.
    await assertCartTokenForWrite(request, ctx, tenantId, body.cartId);
    const currency = await withTenant({ tenantId }, (tx) =>
      tx.cart.findFirst({ where: { id: body.cartId }, select: { currency: true } })
    );
    const { sessionId } = await checkoutService.start(ctx, {
      cartId: body.cartId,
      channel: 'storefront',
      currency: currency?.currency ?? 'USD',
      ...(body.email ? { customerEmail: body.email } : {}),
    });
    return ok(await checkoutService.get(ctx, sessionId));
  });

  app.get('/v1/public/commerce/checkout/:sessionId', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertSessionOwner(request, ctx, tenantId, sessionId);
    return ok(await checkoutService.get(ctx, sessionId));
  });

  app.post('/v1/public/commerce/checkout/:sessionId/contact', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    const body = ContactBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertSessionOwner(request, ctx, tenantId, sessionId);
    await checkoutService.submitContact(ctx, {
      sessionId,
      email: body.email,
      ...(body.name ? { name: body.name } : {}),
      ...(body.phone ? { phone: body.phone } : {}),
      acceptsMarketing: body.acceptsMarketing ?? false,
    });
    return ok(await checkoutService.get(ctx, sessionId));
  });

  app.post('/v1/public/commerce/checkout/:sessionId/shipping-quote', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    const body = ShippingQuoteBody.parse(request.body ?? {});
    const { tenantId, ctx } = await publicCommerceContext(request);
    const { cartId } = await assertSessionOwner(request, ctx, tenantId, sessionId);

    // Quote the cart via the SHARED server-authoritative helper — the same one
    // checkout's submitShipping uses to price the option the shopper picks, so the
    // quoted price and the charged price can never drift apart (BUG-005).
    //
    // Zone matching only reads toAddress.country, so that alone is enough for manual
    // rates. Live carrier rating needs the full street+city too — a carrier geocodes
    // the destination, and a placeholder always returns zero live rates even though
    // shipment creation "succeeds" — so when the checkout form has already collected
    // the shopper's full address, forward it as a real toAddress. With NO address at
    // all (checkout's opening question, before it has asked the shopper for
    // anything) `quoteForCart` rates against its own stand-in.
    const toAddress =
      body.destinationAddress ??
      (body.destinationCountry || body.destinationPostal
        ? {
            line1: '—',
            city: '—',
            country: body.destinationCountry ?? 'US',
            ...(body.destinationPostal ? { postalCode: body.destinationPostal } : {}),
          }
        : undefined);
    const [rates, deliveryOffered] = await Promise.all([
      shippingService.quoteForCart(ctx, { cartId, ...(toAddress ? { toAddress } : {}) }),
      // Whether this shop delivers AT ALL, answered from what it has set up
      // rather than from whether this particular quote came back empty. That
      // difference is what lets checkout skip the address form for a
      // collection-only shop without hiding a connected carrier's rates from a
      // shop that has one and no manual zones (issue 064).
      shippingService.deliveryIsConfigured(ctx, { cartId }),
    ]);

    // Map the service RateOption shape → the storefront's ShippingRate shape.
    return ok({
      deliveryOffered,
      rates: rates.map((r) => ({
        providerSlug: r.providerSlug,
        rateRef: r.rateRef,
        service: r.service,
        carrier: r.carrier,
        amountCents: r.amountCents,
        estimatedDays: r.estimatedDeliveryDays ?? null,
      })),
    });
  });

  app.post('/v1/public/commerce/checkout/:sessionId/shipping', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    const body = ShippingBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertSessionOwner(request, ctx, tenantId, sessionId);
    await checkoutService.submitShipping(ctx, {
      sessionId,
      ...(body.shippingAddress ? { shippingAddress: toAddressSnapshot(body.shippingAddress) } : {}),
      ...(body.billingAddress ? { billingAddress: toAddressSnapshot(body.billingAddress) } : {}),
      shippingRateRef: body.shippingRateRef,
      shippingProviderSlug: body.shippingProviderSlug,
      ...(body.shippingService ? { shippingService: body.shippingService } : {}),
      ...(body.shippingCarrier ? { shippingCarrier: body.shippingCarrier } : {}),
    });
    return ok(await checkoutService.get(ctx, sessionId));
  });

  // Create the payment intent. Inline (Stripe-family) gateways return a clientSecret
  // the storefront confirms with Stripe.js; hosted-redirect gateways (docs/111 D4)
  // return a redirectUrl the storefront sends the shopper to. The storefront passes its
  // post-payment returnUrl for the hosted gateways.
  app.post('/v1/public/commerce/checkout/:sessionId/payment-intent', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    const body = IntentBody.parse(request.body ?? {});
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertSessionOwner(request, ctx, tenantId, sessionId);
    const intent = await checkoutService.createPaymentIntent(ctx, {
      sessionId,
      ...(body.returnUrl ? { returnUrl: body.returnUrl } : {}),
      ...(body.cancelUrl ? { cancelUrl: body.cancelUrl } : {}),
    });
    return ok({
      paymentRef: intent.paymentRef,
      providerSlug: intent.providerSlug,
      ...(intent.clientSecret ? { clientSecret: intent.clientSecret } : {}),
      // Only set for stripe_direct — the merchant's own key, which the browser needs
      // to confirm an intent that lives on the merchant's account (docs/94 §7).
      ...(intent.publishableKey ? { publishableKey: intent.publishableKey } : {}),
      ...(intent.redirectUrl ? { redirectUrl: intent.redirectUrl } : {}),
      amountCents: intent.amountCents,
      currency: intent.currency,
      status: intent.status,
    });
  });

  // Record the confirmed payment ref on the session (advances to 'payment').
  app.post('/v1/public/commerce/checkout/:sessionId/payment', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    // sessionId rides in the path, not the body — the client never sends it.
    const body = SubmitPaymentInput.omit({ sessionId: true }).parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertSessionOwner(request, ctx, tenantId, sessionId);
    await checkoutService.submitPayment(ctx, { sessionId, ...body });
    return ok(await checkoutService.get(ctx, sessionId));
  });

  // Apply a code to the checkout session's underlying cart — a discount or a
  // gift card, because the shopper has one code and no way to tell which it is.
  // Validates it, enforces usage limits, and returns the updated session so the
  // storefront can re-render totals. Idempotent — re-applying the same discount
  // for the same cart returns the existing saving without erroring.
  //
  // The discount is tried first: an unknown discount code costs the shopper
  // nothing, while reserving the wrong gift card takes money off a balance. Same
  // rule, same order, as the cart's own code route.
  const applyCode = async (request: FastifyRequest) => {
    const { sessionId } = SessionParam.parse(request.params);
    const body = DiscountBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);
    const { cartId } = await assertSessionOwner(request, ctx, tenantId, sessionId);
    let discountError: Error | null = null;
    try {
      await discountService.redeemCode(ctx, { cartId, code: body.code });
      return ok(await checkoutService.get(ctx, sessionId));
    } catch (err) {
      discountError = err as Error;
    }
    try {
      await discountService.applyGiftCardToCart(ctx, { cartId, code: body.code });
      return ok(await checkoutService.get(ctx, sessionId));
    } catch {
      throw badRequest(discountError?.message || 'That code can’t be applied.');
    }
  };

  app.post('/v1/public/commerce/checkout/:sessionId/code', applyCode);
  // The older name for the same handler, sharing one implementation so the two
  // cannot answer differently.
  app.post('/v1/public/commerce/checkout/:sessionId/discount', applyCode);

  app.delete('/v1/public/commerce/checkout/:sessionId/gift-card', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    const { tenantId, ctx } = await publicCommerceContext(request);
    const { cartId } = await assertSessionOwner(request, ctx, tenantId, sessionId);
    await discountService.removeGiftCardFromCart(ctx, { cartId });
    return ok(await checkoutService.get(ctx, sessionId));
  });

  // ── The order bump (docs/151 §12.1, docs/152 E1) ─────────────────────────
  //
  // Shown during checkout, before anything is charged. There is deliberately NO
  // payment work here: taking it is a cart line, so pricing, discounts, tax,
  // inventory commitment and the eventual refund are all the cart's, exactly as
  // they are for anything else in the basket.

  // What to offer this basket, if anything. Nothing to offer is the common case
  // and returns `{ offer: null }` rather than a 404 — a checkout with no add-on
  // configured is a normal checkout.
  app.get('/v1/public/commerce/checkout/:sessionId/offer', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    const { tenantId, ctx } = await publicCommerceContext(request);
    const { cartId } = await assertSessionOwner(request, ctx, tenantId, sessionId);

    const session = await withTenant({ tenantId }, (tx) =>
      tx.checkoutSession.findFirst({
        where: { id: sessionId },
        select: { cart: { select: { propertyId: true } } },
      })
    );
    const propertyId = session?.cart.propertyId;
    // A cart with no site cannot be offered a site's add-on.
    if (!propertyId) return ok({ offer: null });

    const items = await withTenant({ tenantId }, (tx) =>
      tx.cartItem.findMany({ where: { cartId }, select: { variantId: true } })
    );
    const offer = await offerService.offerFor(ctx, {
      propertyId,
      placement: 'bump',
      inBasketVariantIds: items.map((i) => i.variantId),
      checkoutSessionId: sessionId,
    });
    return ok({ offer });
  });

  // Take it. `impressionId` rather than an offer id, because what is being
  // accepted is a SHOWING — accepting an offer nobody was shown would put a yes
  // in the numerator with nothing under it.
  app.post('/v1/public/commerce/checkout/:sessionId/offer', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    const body = OfferAcceptBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);
    const { cartId } = await assertSessionOwner(request, ctx, tenantId, sessionId);

    // Re-read the offer from the impression rather than trusting a variant id in
    // the request: otherwise "accept the bump" is an endpoint that adds any
    // variant a caller names, at a price the shop never offered.
    const impression = await withTenant({ tenantId }, (tx) =>
      tx.commerceOfferImpression.findFirst({
        where: { id: body.impressionId, tenantId, checkoutSessionId: sessionId },
        select: { id: true, offer: { select: { variantId: true, active: true } } },
      })
    );
    if (!impression) throw notFound('Offer', body.impressionId);
    // An offer switched off between the showing and the click is not an offer.
    if (!impression.offer.active) throw badRequest('That offer is no longer available.');

    await cartService.addItem(ctx, {
      cartId,
      variantId: impression.offer.variantId,
      quantity: 1,
    });
    await offerService.acceptOffer(ctx, { impressionId: impression.id });
    return ok(await checkoutService.get(ctx, sessionId));
  });

  // Finalize → creates the Order, decrements stock, fires order.placed.
  app.post('/v1/public/commerce/checkout/:sessionId/complete', async (request) => {
    const { sessionId } = SessionParam.parse(request.params);
    const body = CompleteBody.parse(request.body ?? {});
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertSessionOwner(request, ctx, tenantId, sessionId);
    const result = await checkoutService.complete(ctx, {
      sessionId,
      idempotencyKey: body.idempotencyKey ?? randomUUID(),
      ...(body.expectedTotalCents !== undefined
        ? { expectedTotalCents: body.expectedTotalCents }
        : {}),
    });

    // Session attribution (docs/128): match this buyer's visitor-day hash to their
    // earliest pageview today and stamp the derived source onto the order. POST-
    // commit and self-guarded — the order is already placed, so this can never
    // block or fail the sale. Skipped for held B2B orders (no web-traffic
    // attribution, docs/128 §5) and for idempotent retries of an already-placed
    // order (only the fresh placement resolves; re-resolving would be a no-op
    // anyway since resolvedAt is already set).
    if (result.freshlyPlaced && !result.pendingApproval) {
      await resolveOrderAttribution({
        tenantId,
        orderId: result.orderId,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
        now: new Date(),
      });
    }

    // Close the client-confirm race (BUG-002): because the card is confirmed in
    // the browser, `payment_intent.succeeded` can reach the webhook BEFORE the
    // OrderPayment we just created existed — the webhook then no-ops and the order
    // is stranded "Not paid". Now that `complete()` has committed the pending
    // OrderPayment, finish the capture here if the intent already succeeded. Idempotent
    // (a no-op when the webhook captured normally) and best-effort — the order is
    // already placed, so this can never block or fail the sale; the webhook/sweep
    // remain the backstop. Skipped for held B2B orders (no capture until approved).
    if (result.paymentRef && result.paymentProviderSlug && !result.pendingApproval) {
      try {
        await reconcileCompletedCheckoutPayment(
          request.log,
          tenantId,
          result.paymentProviderSlug,
          result.paymentRef
        );
      } catch (err) {
        request.log.error(
          { err, orderId: result.orderId, paymentRef: result.paymentRef },
          'checkout complete: post-commit payment reconcile failed (webhook/sweep will recover)'
        );
      }
    }

    return ok(result);
  });

  return Promise.resolve();
};

export default publicCheckoutRoutes;
