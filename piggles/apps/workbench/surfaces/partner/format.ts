// Partner display helpers — money, dates, plain-language labels, and the
// semantic tone every status wears.
//
// The audience is a business owner, not a payments engineer: a row says "First
// payment received", "Waiting to be paid" and "In your bank", never the raw enum.
// Status is its own color axis (docs/23) — resolved to a `Badge` tone here so it
// stays independent of the partner module hue.

import type {
  BootcampFormat,
  BootcampStatus,
  CommissionStatus,
  CommissionType,
  PartnerKind,
  PartnerStatus,
  PartnerTier,
  PayoutStatus,
  ReferralStatus,
} from './data';
import { productCopy } from '../../lib/product';

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/** Cents → a currency string. Money always arrives as integer cents; this is the
 *  only place it becomes a decimal, so no call site divides by 100 by hand. */
export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A percentage from the Decimal-as-string rate ("0.3000" → "30%"). */
export function formatRate(rate: string): string {
  const n = Number.parseFloat(rate);
  if (!Number.isFinite(n)) return '—';
  return `${String(Math.round(n * 100))}%`;
}

/** What a referral earns, in words. A one-time referral pays a share of the
 *  business's FIRST payment to sparx; an ongoing one (certified, managed
 *  accounts) pays a cut of EVERY payment they make. */
export function commissionEarningLabel(rate: string, type: CommissionType): string {
  const pct = formatRate(rate);
  return type === 'ongoing' ? `${pct} of every payment` : `${pct} of first payment`;
}

/* ── Plain-language labels ────────────────────────────────────────────────── */

export function kindLabel(kind: PartnerKind): string {
  switch (kind) {
    case 'freelance':
      return 'Freelancer';
    case 'agency':
      return 'Agency';
    case 'developer':
      return 'Developer';
    default:
      return 'Other';
  }
}

export const PARTNER_KINDS: { value: PartnerKind; label: string }[] = [
  { value: 'freelance', label: 'Freelancer' },
  { value: 'agency', label: 'Agency' },
  { value: 'developer', label: 'Developer' },
  { value: 'other', label: 'Other' },
];

/** The directory's known specialty facets — free-text on the backend, but these
 *  drive the picker and are the canonical labels. */
export const KNOWN_SPECIALTIES = [
  'ecommerce',
  'b2b',
  'crm',
  'email',
  'design',
  'seo',
  'content',
  'migration',
  'automation',
  'analytics',
] as const;

export function formatLabel(format: BootcampFormat): string {
  switch (format) {
    case 'in_person':
      return 'In person';
    case 'virtual':
      return 'Online';
    case 'hybrid':
      return 'In person & online';
    default:
      return 'Learn at your own pace';
  }
}

export const BOOTCAMP_FORMATS: { value: BootcampFormat; label: string }[] = [
  { value: 'virtual', label: 'Online' },
  { value: 'in_person', label: 'In person' },
  { value: 'hybrid', label: 'In person & online' },
  { value: 'async', label: 'Learn at your own pace' },
];

/* ── Status tones ─────────────────────────────────────────────────────────── */

export function partnerStatusState(status: PartnerStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'success' };
    case 'pending':
      return { label: 'In review', tone: 'warning' };
    case 'suspended':
      return { label: 'Suspended', tone: 'error' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/** A referral's lifecycle, in words. Active means the referred business made its
 *  first payment, which is what earns the commission. */
export function referralState(status: ReferralStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'First payment made', tone: 'success' };
    case 'pending':
      return { label: 'Signed up', tone: 'info' };
    case 'churned':
      return { label: productCopy('partner.status.left', 'Left sparx'), tone: 'neutral' };
    case 'forfeited':
      return { label: 'No commission', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/** A commission's lifecycle — from accrued to actually paid out. */
export function commissionState(status: CommissionStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'paid':
      return { label: 'Paid to you', tone: 'success' };
    case 'approved':
      return { label: 'Cleared to pay', tone: 'info' };
    case 'pending':
      return { label: 'Waiting to clear', tone: 'warning' };
    case 'forfeited':
      return { label: 'Forfeited', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

export function commissionKindLabel(kind: CommissionType): string {
  return kind === 'ongoing' ? 'Ongoing (managed account)' : 'First payment';
}

/** A payout run's state — has the deposit reached the partner's bank? */
export function payoutState(status: PayoutStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'paid':
      return { label: 'In your bank', tone: 'success' };
    case 'processing':
      return { label: 'On its way', tone: 'info' };
    case 'pending':
      return { label: 'Queued', tone: 'warning' };
    case 'failed':
      return { label: 'Failed', tone: 'error' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/** A bootcamp's publishing state. */
export function bootcampState(status: BootcampStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'published':
      return { label: 'Published', tone: 'success' };
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'error' };
    case 'completed':
      return { label: 'Finished', tone: 'info' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/* ── The tier ladder ──────────────────────────────────────────────────────── */

export interface TierMeta {
  tier: PartnerTier;
  label: string;
  /** One-line commission summary. */
  commission: string;
  /** What this tier unlocks over the one below it. */
  unlocks: string[];
  /** How a partner reaches this tier. */
  howToReach: string;
}

export const TIER_ORDER: readonly PartnerTier[] = ['informal', 'registered', 'certified'] as const;

export const TIERS: Record<PartnerTier, TierMeta> = {
  informal: {
    tier: 'informal',
    label: 'Informal',
    commission: '20% of a referral’s first payment',
    unlocks: [
      'A personal referral link',
      '20% commission on each referral’s first payment',
      'Access to the partner resources',
    ],
    howToReach: 'Instant — join the program and you’re in.',
  },
  registered: {
    tier: 'registered',
    label: 'Registered',
    commission: '30% of a referral’s first payment',
    unlocks: [
      'Everything in Informal',
      '30% commission on each referral’s first payment',
      productCopy('partner.perk.directory', 'A public listing in the sparx partner directory'),
      'Draft bootcamps to build your training program',
    ],
    howToReach: 'Apply for review — we confirm your practice within 3 business days.',
  },
  certified: {
    tier: 'certified',
    label: 'Certified',
    commission: '30% first payment + 5% ongoing on managed accounts',
    unlocks: [
      'Everything in Registered',
      '5% ongoing commission on the accounts you manage',
      productCopy('partner.perk.bootcamps', 'Publish bootcamps publicly on sparx'),
      'Priority placement in the partner directory',
    ],
    howToReach: productCopy(
      'partner.tier.apply',
      'Apply once you have a track record of successful client launches on sparx.'
    ),
  },
};

/** The tier immediately above `tier`, or null when already Certified. */
export function nextTier(tier: PartnerTier): PartnerTier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? (TIER_ORDER[i + 1] ?? null) : null;
}
