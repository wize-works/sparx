// The gateway catalog (docs/111 §1 D1) — the data-driven list of every payment
// gateway sparx can run. ONE source of truth: the dashboard renders cards + credential
// forms from it (via an API mirror), api-rest validates captured credentials against
// it, and each entry pairs with a `PaymentGateway` adapter resolved by `id`. Adding a
// gateway is a descriptor here + an adapter in ./gateways — no new UI branches, no new
// routes.
//
// Pure data, no SDK imports — safe to surface over the catalog endpoint. Secrets are
// NEVER in here; `credentialFields[].secret` marks which captured fields are write-only
// and encrypted at rest (docs/111 §2).

import { fillPlatformName, platformBrandIdentity } from '@wizeworks/brand-core';

/** How a tenant turns the gateway on. */
export type GatewayOnboarding =
  // Stripe Connect Express — sparx hosts onboarding, nothing to capture (sparx Pay).
  | 'sparx_hosted'
  // The merchant pastes API keys from their processor dashboard (captured + encrypted).
  | 'api_keys'
  // No online processing — record payments by hand (manual).
  | 'manual';

/** How the shopper pays at checkout. */
export type GatewayCheckout =
  // sparx-rendered card form (Stripe Elements) — Stripe-family only.
  | 'inline'
  // Redirect to the vendor's hosted payment page, resume on return (everyone else).
  | 'redirect'
  // No online checkout (manual).
  | 'none';

/** One captured credential field. `secret: true` ⇒ write-only + encrypted at rest;
 *  `secret: false` ⇒ a non-sensitive value kept in the clear for display/the client
 *  SDK (a public client key, a location id, a hosted URL). */
export interface CredentialField {
  key: string;
  label: string;
  placeholder?: string;
  secret: boolean;
  help?: string;
  optional?: boolean;
}

export interface GatewayCapabilities {
  refunds: boolean;
  /** Auth-then-capture (manual capture) supported server-side. */
  capture: boolean;
  /** Hosted payment links for invoices. */
  paymentLinks: boolean;
  webhooks: boolean;
  /** Can vault a payment method and charge it later with the customer ABSENT
   *  (card-on-file / merchant-initiated). This is what recurring billing needs
   *  and what nothing else in the interface provides — a subscription on a
   *  gateway without it collects by invoice + payment link instead of by card
   *  (docs/142 §8). Requires `createSetupSession` + `chargeStoredMethod` on the
   *  adapter; `false` is an honest answer, not a missing one. */
  storedMethods: boolean;
}

export interface GatewayDescriptor {
  id: string;
  name: string;
  /** The company whose account, dashboard and settings the merchant actually
   *  has — used wherever a sentence says "your X account". It is NOT always the
   *  shelf name: the shelf has to distinguish "Your own Stripe" from the
   *  platform's own gateway, and interpolating that into a possessive produced
   *  "your Your own Stripe account" on the live screen. Absent means the shelf
   *  name reads correctly on its own (Square, PayPal). */
  processor?: string;
  tagline?: string;
  blurb: string;
  /** Whether a tenant can switch this on TODAY. Omitted means `available` — a gateway
   *  that works should not have to declare it. `coming_soon` keeps the entry visible
   *  and honest while its adapter is unwritten: the catalog says sparx will support it,
   *  and the surface disables the control instead of offering a button that throws. */
  availability?: 'available' | 'coming_soon';
  /** sparx Pay leads the picker (docs/111 D7). */
  recommended?: boolean;
  onboarding: GatewayOnboarding;
  checkout: GatewayCheckout;
  capabilities: GatewayCapabilities;
  /** Captured for `api_keys` onboarding; empty for hosted/manual. */
  credentialFields: CredentialField[];
  /** Whether the gateway has a sandbox/production toggle. */
  environments: boolean;
  /** Whether sparx takes a per-transaction fee on this gateway. */
  sparxFee: boolean;
  feeNote: string;
  /** ISO country codes the gateway broadly supports (display only). */
  regions: string[];
  docsUrl?: string;
}

/** A full-service card gateway: everything, including a vault it can charge
 *  off-session. Shared by every gateway whose adapter implements the vault
 *  against the vendor's published contract — the two Stripe-backed ones, Square
 *  (Cards API), Authorize.net (CIM) and PayPal (Payment Method Tokens v3). The
 *  checkout STYLE differs; the server-side capabilities do not. */
const CARD_CAPS: GatewayCapabilities = {
  refunds: true,
  capture: true,
  paymentLinks: true,
  webhooks: true,
  storedMethods: true,
};

const CATALOG_TEMPLATE: readonly GatewayDescriptor[] = [
  {
    id: 'sparx_pay',
    name: '{platform} Pay',
    tagline: 'Recommended',
    blurb:
      'Accept cards in minutes. {platform} handles disputes, settlement, and PCI, and pays out to your bank automatically. Flat 0.5% per transaction — no monthly fee, and better blended rates as you grow.',
    recommended: true,
    onboarding: 'sparx_hosted',
    checkout: 'inline',
    capabilities: CARD_CAPS,
    credentialFields: [],
    environments: false,
    sparxFee: true,
    feeNote: 'Flat 0.5% per transaction. No monthly fee.',
    regions: ['US'],
  },
  {
    id: 'stripe_direct',
    name: 'Your own Stripe',
    processor: 'Stripe',
    blurb:
      'Route checkout to your own Stripe account. No {platform} fee — you own disputes, PCI, and payouts. Paste your secret key and webhook signing secret from the Stripe dashboard.',
    onboarding: 'api_keys',
    checkout: 'inline',
    capabilities: CARD_CAPS,
    credentialFields: [
      {
        key: 'secret_key',
        label: 'Secret key',
        placeholder: 'sk_live_…',
        secret: true,
        help: 'Stripe → Developers → API keys → Secret key.',
      },
      {
        key: 'publishable_key',
        label: 'Publishable key',
        placeholder: 'pk_live_…',
        secret: false,
        help: 'Used by the storefront to mount the card form.',
      },
      {
        key: 'webhook_secret',
        label: 'Webhook signing secret',
        placeholder: 'whsec_…',
        secret: true,
        optional: true,
        help: 'From the webhook endpoint you point at {platform}. Optional but recommended.',
      },
    ],
    environments: false,
    sparxFee: false,
    feeNote: 'No {platform} fee — you pay Stripe’s rates directly.',
    regions: ['US', 'CA', 'GB', 'EU', 'AU'],
    docsUrl: 'https://dashboard.stripe.com/apikeys',
  },
  {
    id: 'square',
    name: 'Square',
    blurb:
      'Use your existing Square account. Great if you also sell in person — your online and POS sales land in one Square balance. Shoppers pay on a Square-hosted page; no {platform} fee.',
    onboarding: 'api_keys',
    checkout: 'redirect',
    capabilities: CARD_CAPS,
    credentialFields: [
      {
        key: 'access_token',
        label: 'Access token',
        placeholder: 'EAAA…',
        secret: true,
        help: 'Square → Developer → your app → Production access token.',
      },
      {
        key: 'application_id',
        label: 'Application ID',
        placeholder: 'sq0idp-…',
        secret: false,
        help: 'Your Square application id (safe to expose).',
      },
      {
        key: 'location_id',
        label: 'Location ID',
        placeholder: 'L…',
        secret: false,
        help: 'The Square location to attribute sales to.',
      },
      {
        key: 'webhook_signature_key',
        label: 'Webhook signature key',
        secret: true,
        optional: true,
        help: 'From your Square webhook subscription. Optional but recommended.',
      },
    ],
    environments: true,
    sparxFee: false,
    feeNote: 'No {platform} fee — you pay Square’s rates directly.',
    regions: ['US', 'CA', 'GB', 'AU', 'JP'],
    docsUrl: 'https://developer.squareup.com/apps',
  },
  {
    id: 'authorize_net',
    name: 'Authorize.net',
    blurb:
      'The classic for established US merchants. Keep your Authorize.net account and gateway rates — {platform} routes checkout to an Authorize.net hosted payment page. No {platform} fee.',
    onboarding: 'api_keys',
    checkout: 'redirect',
    capabilities: CARD_CAPS,
    credentialFields: [
      {
        key: 'api_login_id',
        label: 'API Login ID',
        secret: false,
        help: 'Authorize.net → Account → Settings → API Credentials & Keys.',
      },
      {
        key: 'transaction_key',
        label: 'Transaction Key',
        secret: true,
        help: 'Generated alongside your API Login ID.',
      },
      {
        key: 'signature_key',
        label: 'Signature Key',
        secret: true,
        optional: true,
        help: 'For webhook verification. Optional but recommended.',
      },
      {
        // Needed only to SAVE a card for repeat orders (docs/142): Accept.js runs
        // in the shopper's browser and exchanges the card for a one-time token,
        // so the card itself never reaches sparx. Still captured while
        // `storedMethods` is false — the credential is what the sandbox exercise
        // needs, and a merchant who has already pasted it does not have to come
        // back when the capability turns on.
        key: 'public_client_key',
        label: 'Public Client Key',
        secret: false,
        optional: true,
        help: 'Authorize.net → Account → Settings → Manage Public Client Key. Only needed for saved cards, which are not switched on for Authorize.net yet.',
      },
    ],
    environments: true,
    sparxFee: false,
    feeNote: 'No {platform} fee — you pay your Authorize.net rates directly.',
    regions: ['US', 'CA', 'GB', 'AU'],
    docsUrl: 'https://account.authorize.net/',
  },
  {
    id: 'first_pay',
    name: '1stPayGateway',
    blurb:
      'Common with ISO/agent-sold merchant accounts. Keep your 1stPayGateway processing — {platform} routes checkout to a 1stPay hosted page. No {platform} fee.',
    onboarding: 'api_keys',
    checkout: 'redirect',
    // `storedMethods: false` here means UNVERIFIED, not impossible — 1stPay's
    // card-on-file support has not been confirmed against their API. Subscriptions
    // on this gateway collect by invoice until it is.
    capabilities: {
      refunds: true,
      capture: false,
      paymentLinks: true,
      webhooks: true,
      storedMethods: false,
    },
    credentialFields: [
      {
        key: 'gateway_id',
        label: 'Transaction Center ID',
        secret: false,
        help: 'Your 1stPayGateway Transaction Center / merchant id.',
      },
      {
        key: 'api_key',
        label: 'API key',
        secret: true,
        help: 'Your 1stPayGateway API key.',
      },
    ],
    environments: true,
    sparxFee: false,
    feeNote: 'No {platform} fee — you pay your 1stPayGateway rates directly.',
    regions: ['US'],
    docsUrl: 'https://secure.1stpaygateway.net/',
  },
  {
    id: 'custom',
    name: 'Custom gateway',
    processor: 'payment processor',
    blurb:
      'Use any other processor. Point {platform} at your gateway’s hosted checkout URL and credentials; {platform} redirects shoppers there and reconciles on return. For full control, a developer can drop in a code adapter — see the plugin contract.',
    onboarding: 'api_keys',
    checkout: 'redirect',
    // A generic hosted redirect has no vault seam to reach through, so there is
    // nowhere to put a saved card.
    capabilities: {
      refunds: false,
      capture: false,
      paymentLinks: true,
      webhooks: true,
      storedMethods: false,
    },
    credentialFields: [
      {
        key: 'hosted_url',
        label: 'Hosted checkout URL',
        placeholder: 'https://pay.yourgateway.com/checkout',
        secret: false,
        help: 'Where {platform} sends shoppers to pay. {platform} appends amount, reference, and return URL.',
      },
      {
        key: 'api_key',
        label: 'API key',
        secret: true,
        optional: true,
        help: 'Sent as a bearer token when {platform} confirms/queries the payment, if your gateway needs one.',
      },
      {
        key: 'webhook_secret',
        label: 'Webhook secret',
        secret: true,
        optional: true,
        help: 'Shared secret {platform} verifies inbound webhooks against, if your gateway signs them.',
      },
    ],
    environments: true,
    sparxFee: false,
    feeNote: 'No {platform} fee — your processor’s rates apply.',
    regions: [],
  },
  {
    // PayPal lives HERE, in the gateway catalog, and not as a provider bundle.
    //
    // It used to be `@sparx/provider-paypal`: 85 lines implementing the provider
    // framework's `PaymentProvider`, every method throwing, purely so the catalog could
    // say "coming soon". That contract was a second model of payments — nothing
    // dispatched it, while every real payment went through this catalog — and the stub
    // was the only thing keeping it alive. A catalog entry with `availability` says the
    // same sentence without a parallel abstraction behind it.
    id: 'paypal',
    name: 'PayPal',
    blurb:
      'Let customers pay with their PayPal balance, Venmo, or Pay Later. Customers can save their PayPal account for repeat orders. No {platform} fee — you pay PayPal’s rates directly.',
    onboarding: 'api_keys',
    checkout: 'redirect',
    // PayPal's vault is the Payment Method Tokens v3 API — the shopper approves
    // ONCE and the merchant charges the saved PayPal account thereafter. It
    // saves an ACCOUNT rather than a card, so a saved method here has no brand
    // or last-4; everything else about it behaves like a card on file.
    capabilities: CARD_CAPS,
    credentialFields: [
      {
        key: 'client_id',
        label: 'Client ID',
        placeholder: 'A21AA…',
        secret: false,
        help: 'PayPal Developer Dashboard → Apps & Credentials → your app.',
      },
      {
        key: 'client_secret',
        label: 'Client secret',
        secret: true,
        help: 'Alongside the Client ID on the same PayPal app.',
      },
      {
        key: 'webhook_secret',
        label: 'Webhook secret',
        secret: true,
        optional: true,
        help: 'Shared secret {platform} verifies inbound PayPal webhooks against. Optional but recommended.',
      },
    ],
    environments: true,
    sparxFee: false,
    feeNote: 'No {platform} fee — you pay PayPal’s rates directly.',
    regions: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'NL', 'IT', 'ES', 'JP'],
  },
  {
    id: 'manual',
    name: 'Manual payments',
    blurb:
      'Record check, cash, wire, or ACH by hand. No online card payments and no fee — you mark orders and invoices paid yourself.',
    onboarding: 'manual',
    checkout: 'none',
    // No processor at all — cash, cheque, bank transfer. A recurring order here
    // is a standing invoice, which is exactly what invoice mode produces.
    capabilities: {
      refunds: false,
      capture: false,
      paymentLinks: false,
      webhooks: false,
      storedMethods: false,
    },
    credentialFields: [],
    environments: false,
    sparxFee: false,
    feeNote: 'No fee. No online card processing.',
    regions: [],
  },
] as const;

// -- Resolving the platform's name -------------------------------------------
//
// Every string above that names the product carries a `{platform}` token rather
// than a product name, because this catalog is SHARED code and the platform runs
// more than one brand off it. Written literally, the strings were right for one
// brand and wrong for the other at all times -- and this is a screen about
// MONEY, which is the worst place to name a company somebody has never heard of.
//
// Found by walking a Piggles bakery through her own checkout: the provider
// picker read "No sparx fee -- you pay Stripe's rates directly", seven times
// down one page, to an owner who signed up to Piggles.
//
// `{platform} Pay` is a RESOLVE and not a REMOVE: it is a real first-party
// product, and the Piggles one is called Piggles Pay. Its `id` stays
// `sparx_pay` -- that is a wire value and a stored column, read by adapters and
// by rows already in the database, and it reaches nobody's eyes.
//
// THE TRAP, written down so the next person does not fall into it: the danger in
// this shape is converting the data and leaving ONE caller reading the raw
// array, because an unresolved `{platform}` on a live screen looks exactly like
// working software. That is why `CATALOG_TEMPLATE` is not exported. The only
// route to a descriptor is an accessor that resolves, so a caller cannot forget.

/** Resolved catalogs, per brand. The data is static and the substitution is not
 *  free; the provider picker reads this on every render. */
const resolvedCatalogs = new Map<string, readonly GatewayDescriptor[]>();

function fillDescriptor(g: GatewayDescriptor, brand: string): GatewayDescriptor {
  const fill = (text: string) => fillPlatformName(text, brand);
  return {
    ...g,
    name: fill(g.name),
    blurb: fill(g.blurb),
    feeNote: fill(g.feeNote),
    ...(g.processor ? { processor: fill(g.processor) } : {}),
    ...(g.tagline ? { tagline: fill(g.tagline) } : {}),
    credentialFields: g.credentialFields.map((field) => ({
      ...field,
      label: fill(field.label),
      ...(field.help ? { help: fill(field.help) } : {}),
      ...(field.placeholder ? { placeholder: fill(field.placeholder) } : {}),
    })),
  };
}

/**
 * The catalog with `{platform}` STILL IN IT.
 *
 * Exactly one legitimate caller: the integration registry, which is built once
 * at boot for every brand at once and therefore has no brand to resolve
 * against. The route that serves those descriptors resolves them per tenant.
 *
 * Named to be alarming, because it is. If you are about to render this, you
 * want `gatewayCatalog(brand)` instead — an unresolved token on a live screen
 * reads as working software right up until somebody points at it.
 */
export function gatewayCatalogTemplate(): readonly GatewayDescriptor[] {
  return CATALOG_TEMPLATE;
}

/** The catalog as a person of THIS brand reads it. */
export function gatewayCatalog(brand?: string | null): readonly GatewayDescriptor[] {
  // Keyed on the resolved NAME rather than the brand key, so two brand keys that
  // resolve to the same name share one build instead of two identical ones.
  const name = platformBrandIdentity(brand).name;
  const cached = resolvedCatalogs.get(name);
  if (cached) return cached;
  const built = CATALOG_TEMPLATE.map((g) => fillDescriptor(g, brand ?? ''));
  resolvedCatalogs.set(name, built);
  return built;
}

/**
 * One gateway, resolved.
 *
 * `brand` is optional because most callers want the CAPABILITIES -- does this
 * gateway support refunds, which credential fields does it capture -- and never
 * render a word of it. Those are identical across brands. Pass the brand
 * wherever the result reaches a person.
 */
export function getGatewayDescriptor(
  id: string,
  brand?: string | null
): GatewayDescriptor | undefined {
  return gatewayCatalog(brand).find((g) => g.id === id);
}

/** Every gateway id the catalog knows. Ids are wire values -- no brand in them. */
export const CATALOG_GATEWAY_IDS: readonly string[] = CATALOG_TEMPLATE.map((g) => g.id);

/** The subset whose credentials a tenant captures + we encrypt (api_keys onboarding). */
export function isApiKeyGateway(id: string): boolean {
  return getGatewayDescriptor(id)?.onboarding === 'api_keys';
}
