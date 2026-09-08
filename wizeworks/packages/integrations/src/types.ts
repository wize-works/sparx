// The shared vocabulary for every outside service a business connects to sparx.
//
// WHY THIS EXISTS — one shelf, many kinds.
//
// Payments, shipping, tax, sales channels, social accounts, dropship suppliers and
// AI accounts each grew their own registry, their own catalog shape and their own
// bootstrap. Five of those registries are the same forty lines of `Map` + accessors,
// copied one from the next — the source comments say so ("Mirrors @wizeworks/channels'
// registry"). The copies then drifted: three of them independently invented an
// `availability`/`isConfigured` concept and the provider framework never got one,
// which is why four finished bundles (paypal, easypost, taxjar, avalara) shipped
// unregistered and invisible for months. A duplicated mechanism does not cost
// tidiness; it costs the capability that only one copy happens to have.
//
// The tenant paid for it too: connecting a shipping carrier lived under Integrations
// while choosing how to get paid lived four tabs deep under commerce, so finding
// either one required already knowing which module owned it.
//
// THE RULE. One registry, many contracts.
//
//   - The LOOKUP is shared. Collision policy, availability, listing, the catalog
//     projection and the marketplace row are generic over the value type, so they
//     live here once and every category gets them at the same time.
//   - The CONTRACT is not. `PaymentGateway` and `SocialAdapter` have no method in
//     common; merging them yields either forty optional fields or an untyped
//     `dispatch(kind, op, …)`. That merge was already attempted once — the provider
//     framework's `ProviderBundle.payment` claims a payment contract that nothing
//     dispatches, while every real payment goes through `@wizeworks/payments` — and the
//     duplicate abstraction is the result. Each domain keeps its own typed adapter
//     and its own dispatch; only the descriptor is common.
//
// Everything in this file is pure data with no I/O and no domain imports, so the
// API, the workbench and the marketplace can all read the same shapes.

/**
 * What an integration DOES, in the tenant's terms.
 *
 * A category earns a place here only when this registry actually dispatches it —
 * the thing whose absence let a dead payment contract sit in the provider framework
 * for months looking alive. Adding a category means there is a live adapter behind
 * it, not that we intend one.
 */
export type IntegrationCategory =
  'payments' | 'shipping' | 'tax' | 'sales_channels' | 'social' | 'dropship' | 'ai';

export const INTEGRATION_CATEGORIES: readonly IntegrationCategory[] = [
  'payments',
  'shipping',
  'sales_channels',
  'social',
  'dropship',
  'tax',
  'ai',
];

// `subscription_billing` and `identity` were here and are gone, under the rule above.
// Neither had a single implementer: `identity` was marked "future" the day it was
// written, and `subscription_billing`'s contract has now been deleted from the
// provider framework for the same reason `PaymentProvider` was. Listing them cost a
// real thing — the panel rendered two headings with nothing beneath them — which is
// what a category with nothing to dispatch always looks like from the outside.
// Add them back the same day something implements them, not the day someone plans to.

/**
 * Whether a tenant can connect this TODAY, and if not, whose problem it is.
 *
 * Three states rather than a boolean, because the two failure modes have different
 * audiences and different fixes:
 *
 *   - `available`            — connectable now.
 *   - `needs_platform_setup` — the integration is built and registered, but SPARX has
 *                              not configured its side (an OAuth app id/secret missing
 *                              from ops env). Nothing the tenant can do; it lights up
 *                              with no code change the moment ops sets the variable.
 *                              This is what `ChannelAdapter.isConfigured()` and
 *                              `SocialAdapter.isConfigured()` already meant, given a
 *                              name so every category can say it.
 *   - `coming_soon`          — registered so the catalog can honestly say sparx will
 *                              talk to it, but the adapter's methods throw. A surface
 *                              rendering one MUST disable its connect control and give
 *                              the reason rather than letting the throw surface as a
 *                              failure the tenant caused.
 *
 * Defaults to `available`: an integration that works should not have to declare it.
 */
export type IntegrationAvailability = 'available' | 'needs_platform_setup' | 'coming_soon';

/** How a tenant hands over the credential, which decides what the connect flow looks like. */
export type ConnectMethod =
  /** Redirect to the vendor, come back with a token. No secret is typed. */
  | 'oauth'
  /** The tenant pastes keys from the vendor's dashboard into a form. */
  | 'api_keys'
  /** sparx owns the vendor relationship; the tenant just switches it on. */
  | 'sparx_hosted'
  /** No live connection — a file the tenant uploads, or hand-run steps. */
  | 'manual';

/** One value the connect form collects. Mirrors what the gateway catalog, the dropship
 *  vendor catalog and the provider JSON Schema were each describing separately. */
export interface CredentialField {
  key: string;
  label: string;
  /** Where in the vendor's dashboard the tenant finds this. */
  help?: string;
  placeholder?: string;
  /** Encrypted at rest and rendered masked. Never echoed back to the client. */
  secret: boolean;
  required: boolean;
  /** `select` carries `options`; everything else renders as its named control. */
  type: 'text' | 'password' | 'select' | 'boolean' | 'url';
  options?: readonly string[];
}

/**
 * The public face of one integration — everything a catalog, a connect card or a
 * marketplace listing needs, and nothing that requires loading adapter code.
 *
 * Serializable by construction: this crosses the API to the workbench and the
 * marketplace, so no functions and no class instances.
 */
export interface IntegrationDescriptor {
  category: IntegrationCategory;
  /** Unique WITHIN a category. `meta` is a sales channel and a social platform; they
   *  are different integrations and both keep the obvious slug. */
  slug: string;
  /** What the tenant calls it. "Your own Stripe", not "stripe_direct". */
  name: string;
  /** Who makes it — "Stripe, Inc.", "sparx". Rendered as "by …". */
  vendor: string;
  /** One or two sentences, in a non-technical owner's vocabulary. */
  blurb: string;
  /**
   * Who published this integration into the registry.
   *
   * `sparx` for first-party. An approved contributor's slug for an uploaded one —
   * the same publisher identity the theme/component/blueprint shelf already uses, so
   * a third-party integration lists next to ours with no separate code path and can
   * be retracted by the same publisher-scoped prune.
   */
  publisher: string;
  availability: IntegrationAvailability;
  /** Shown when availability is not `available`, in the tenant's terms. Required for
   *  `coming_soon` so a disabled control always explains itself. */
  unavailableReason?: string;
  /** At most one per category should set this — the one a business without an existing
   *  vendor relationship should pick. */
  recommended?: boolean;
  connect: ConnectMethod;
  credentialFields: readonly CredentialField[];
  /** Short capability phrases in the tenant's words ("Printed labels", "Live rates").
   *  Rendered as-is; not an enum, because what a channel does and what a gateway does
   *  do not share a vocabulary. */
  capabilities: readonly string[];
  /** ISO-3166-1 alpha-2. Empty means no geographic restriction. */
  regions?: readonly string[];
  logoUrl?: string;
  docsUrl?: string;
  /** Ordering within a category; higher sorts first. Ties fall back to `name`. */
  sortWeight?: number;
}

/** Presentation for a category — the heading and the one line under it, in the owner's
 *  words. Kept beside the descriptor so the panel, the marketplace and any future
 *  surface describe a category identically. */
export interface CategoryDescriptor {
  category: IntegrationCategory;
  label: string;
  hint: string;
  /** The module that must be on for this category to be usable. `null` = always
   *  available (AI accounts and identity are not gated on selling). */
  module: string | null;
}
