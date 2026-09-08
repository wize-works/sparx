/**
 * Shared attribution types (docs/80 §5.2). The `AttributionSnapshot` is the one
 * shape projected onto every touch and every stored attribution column, at both
 * levels (L-PLAT acquisition, L-TEN commerce).
 */

/**
 * The normalized bucket a touch rolls up to. Derived deterministically from
 * (medium, click ids, referrer, user-agent) by {@link classify}. `mcp_ai` is a
 * first-class channel by design (docs/80 §5.4) — traffic that arrives because an
 * AI agent surfaced the tenant or WizeWorks.
 */
export type Channel =
  | 'direct'
  | 'organic_search'
  | 'paid_search'
  | 'organic_social'
  | 'paid_social'
  | 'display'
  | 'referral'
  | 'email'
  | 'affiliate'
  | 'community'
  | 'mcp_ai'
  | 'internal';

/** Attribution models (docs/80 §9). First/last are stored; the rest compute from the retained touch path. */
export type AttributionModel =
  'first' | 'last' | 'last_non_direct' | 'linear' | 'position_based' | 'time_decay';

/** The five canonical UTM parameters plus the optional paid `utm_id`. */
export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
  id?: string;
}

/**
 * Ad-platform click identifiers. Captured ONLY with `marketing` consent
 * (docs/80 §5.5) and used for the server-side conversion loop (docs/80 §13).
 */
export interface ClickIds {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  ttclid?: string;
  li_fat_id?: string;
  msclkid?: string;
}

/** A single resolved inbound touch (docs/80 §5.2). */
export interface AttributionSnapshot {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  channel: Channel;
  /** document.referrer host+path, PII-stripped. */
  referrer: string | null;
  /** first path seen on this surface. */
  landingPath: string | null;
  clickIds: ClickIds;
  /** ISO timestamp; edge-set, never the client clock for ordering. */
  capturedAt: string;
}
