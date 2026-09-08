'use client';

// Modules — the parts of sparx a business has switched on, and the moves you can
// make on one.
//
// A module is a FEATURE FLAG, never a plan tier: there are no bronze/silver/gold
// levels here. Each part of sparx is turned on independently and billed on its
// own, and turning one off makes it stop entirely — its section leaves the rail,
// its workers stop, and it stores no new records. Activation is event-driven on
// the server (the toggle publishes `module.activated`, which seeds the module's
// defaults); this file only asks for the flip and lets the server do the rest.
//
// Every row comes from the SAME `/v1/tenant/modules` endpoint the rail reads, so
// the two never disagree about what is on. The richer fields (source, includedBy,
// requiredBy) let this surface explain WHY a module is on and when it cannot be
// turned off, which the rail does not need.

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { productCopy } from '../../lib/product';
import { apiErrorMessage } from '../../lib/api-error';
import {
  faAddressBook,
  faArrowProgress,
  faBagShopping,
  faBoxes,
  faCalendarClock,
  faCreditCard,
  faEnvelope,
  faFileText,
  faHandshake,
  faMessages,
  faReceipt,
  faShareNodes,
  faSparkles,
  faTableLayout,
  faTruck,
  faUsers,
} from '@fortawesome/pro-solid-svg-icons';
import type { PigglesIcon } from '@piggles/ui';

import { api } from '../../lib/api/client';
import type { WorkbenchModule } from '../../components/module-scope';

/** How a module comes to be on. `explicit` — the business turned it on and is
 *  billed for it. `bundled` — it rides along free with another module that is on
 *  (Invoicing and Stock come with the Online store or Wholesale). `off`. */
export type ModuleSource = 'explicit' | 'bundled' | 'off';

/** One module's state, exactly as `/v1/tenant/modules` returns it. */
export interface ModuleRow {
  slug: string;
  enabled: boolean;
  source: ModuleSource;
  /** When `bundled`, the module slugs that provide it for free. */
  includedBy: string[];
  /** Enabled modules that REQUIRE this one — while any is listed, this module
   *  cannot be turned off (turning it off would break them). */
  requiredBy: string[];
  /** Whether the person holding this session may actually open the module. Absent
   *  on older responses; treat absent as yes. */
  reachable?: boolean;
}

/** The fixed, human-facing description of a module — what to call it and what it
 *  does, in words a business owner reads without a glossary. The live on/off
 *  state is never here; it comes from the server. `hue` repoints the module's own
 *  color for its icon and its turn-on button (color follows functionality).
 *  `requires` is the tiny, stable dependency graph (only Wholesale needs the
 *  Online store) — carried here so the turn-on confirm can say so in plain words. */
export interface ModuleMeta {
  slug: string;
  name: string;
  hue: WorkbenchModule;
  icon: PigglesIcon;
  /** One plain-language line: what this actually does for the business. */
  blurb: string;
  /** Monthly list price in whole dollars — hand-synced from wizeworks/packages/billing
   *  MODULE_MONTHLY_CENTS (the SAME figures the marketing pricing switchboard and
   *  signup show), so the badge here reads "$49/mo" identically. A bundled module
   *  shows "Included" instead of its price while its provider is on. */
  price: number;
  /** Module slugs this one is built on and turns on alongside itself. */
  requires: string[];
}

// The closed catalogue, in the order it reads best: the everyday building blocks
// first, then the specialised ones. Every slug here is one the server knows about
// (@wizeworks/modules ALL_MODULES); a slug the server stops returning simply drops
// off the screen, and a new one it returns without an entry here is skipped
// rather than shown raw — see `MODULE_META_BY_SLUG`.
//
// That skip is the footgun: a module the server offers but this list has never
// heard of is INVISIBLE HERE, with no error anywhere, so it can never be turned
// on from the only screen that turns modules on. `finance` and `staff` were both
// in exactly that state — shipped end to end, absent from this grid. When you add
// a slug to @wizeworks/modules, grep an existing one across the repo; several lists
// re-declare this vocabulary and none of them are exhaustive over the union.
export const MODULE_META: ModuleMeta[] = [
  {
    slug: 'builder',
    name: 'Website',
    hue: 'builder',
    icon: faTableLayout,
    blurb: productCopy(
      'modules.builder.blurb',
      'Build and host your website with sparx — its pages, layout and your own look, all served for you.'
    ),
    price: 10,
    requires: [],
  },
  {
    slug: 'commerce',
    name: 'Online store',
    hue: 'commerce',
    icon: faBagShopping,
    blurb: 'Sell products online, with a catalog, a shopping cart, checkout and card payments.',
    price: 49,
    requires: [],
  },
  {
    slug: 'cms',
    name: 'Content',
    hue: 'cms',
    icon: faFileText,
    blurb:
      'Write and publish articles and pages, and manage the words and pictures across your site.',
    price: 49,
    requires: [],
  },
  {
    slug: 'crm',
    name: 'Customers',
    hue: 'crm',
    icon: faUsers,
    blurb:
      'Keep a record of the people and businesses you deal with, the work in progress with each, and your follow-ups.',
    price: 49,
    requires: [],
  },
  {
    slug: 'email',
    name: 'Email',
    hue: 'email',
    icon: faEnvelope,
    blurb: 'Send newsletters and automatic messages to your customers from your own address.',
    price: 29,
    requires: [],
  },
  {
    slug: 'funnels',
    name: 'Campaigns',
    hue: 'funnels',
    // The same mark the Campaigns surface carries in the rail, so the thing you
    // switch on here and the thing that appears there read as one module.
    icon: faArrowProgress,
    blurb: productCopy(
      'modules.funnels.blurb',
      'Give a promotion a name, and see how many people got from the first click to the sale — and where the rest stopped.'
    ),
    // Genuinely free, which is why it shows "Free" rather than a price: every
    // part a campaign measures is already paid for, and charging again to find
    // out whether it worked prices the answer away from the businesses that
    // most need it (docs/152 §1 #1).
    price: 0,
    requires: [],
  },
  {
    slug: 'scheduling',
    name: 'Bookings',
    hue: 'scheduling',
    icon: faCalendarClock,
    blurb: 'Let customers book appointments or services around your availability and calendar.',
    price: 29,
    requires: [],
  },
  {
    slug: 'chat',
    name: 'Live chat',
    hue: 'chat',
    icon: faMessages,
    blurb:
      'Talk with visitors on your site as they browse, with saved answers for the questions you get most.',
    price: 19,
    requires: [],
  },
  {
    slug: 'invoicing',
    name: 'Invoicing',
    hue: 'invoicing',
    icon: faReceipt,
    blurb: 'Send bills and quotes, and take payment against them.',
    price: 19,
    requires: [],
  },
  {
    slug: 'finance',
    name: 'Finance',
    hue: 'finance',
    icon: faCreditCard,
    blurb:
      'Track what you spend — parts, wages, rent, subscriptions — against what came in, and see which jobs actually made money.',
    price: 29,
    // Free alongside the Online store or Wholesale (BUNDLED_FREE), which the
    // server reports as `source: 'bundled'` — the badge says so on its own.
    requires: [],
  },
  {
    slug: 'staff',
    name: 'Your team',
    hue: 'staff',
    icon: faAddressBook,
    // Says what it is NOT, because someone reading "team" and "pay rates" will
    // otherwise buy this expecting payroll and find out after they have paid.
    blurb: productCopy(
      'modules.staff.blurb',
      'Keep hours, pay rates, shifts, time off and license renewals, so you know what an hour of work really costs. Not payroll — sparx hands the hours to whoever runs yours.'
    ),
    price: 29,
    requires: [],
  },
  {
    slug: 'inventory',
    name: 'Stock',
    hue: 'inventory',
    icon: faBoxes,
    blurb:
      'Track how much of each product you have across your locations, and get a nudge when something runs low.',
    price: 29,
    requires: [],
  },
  {
    slug: 'b2b',
    name: 'Wholesale',
    hue: 'b2b',
    icon: faHandshake,
    blurb:
      'Sell to other businesses with account pricing, agreed payment terms and order approvals.',
    price: 99,
    requires: ['commerce'],
  },
  {
    slug: 'dropship',
    name: 'Dropshipping',
    hue: 'dropship',
    icon: faTruck,
    blurb:
      'Offer products a supplier ships straight to your customer, so you never hold the stock yourself.',
    price: 29,
    requires: [],
  },
  {
    slug: 'ai',
    name: 'AI features',
    hue: 'ai',
    icon: faSparkles,
    blurb: productCopy(
      'modules.ai.blurb',
      'Turn on the AI-assisted tools throughout sparx. They run on an AI account you connect yourself.'
    ),
    price: 49,
    requires: [],
  },
  {
    slug: 'social',
    name: 'Social posts',
    hue: 'social',
    icon: faShareNodes,
    blurb:
      'Connect your Facebook, Instagram, Google and other social accounts and post to all of them from one place — on a schedule, or automatically.',
    price: 0,
    requires: [],
  },
];

export const MODULE_META_BY_SLUG = new Map(MODULE_META.map((m) => [m.slug, m]));

/** A module's on/off state in plain words, with its own color axis for the
 *  badge. `bundled` names the provider so "Included with the Online store" reads
 *  as an answer rather than a puzzle. Returns `null` for a plain off module —
 *  absence of a badge IS the off state, so the screen never carries a wall of
 *  grey "Off" pills (a status badge is for something that is on). */
export function moduleState(row: ModuleRow): { label: string; tone: 'success' | 'info' } | null {
  if (row.source === 'bundled') {
    const providers = row.includedBy
      .map((slug) => MODULE_META_BY_SLUG.get(slug)?.name ?? slug)
      .join(' or ');
    return { label: providers ? `Included with ${providers}` : 'Included', tone: 'info' };
  }
  if (row.enabled) return { label: 'On', tone: 'success' };
  return null;
}

export const MODULES_KEY = ['tenant', 'modules'];

/** Every module and its current state for this account. Shares the exact query
 *  key the rail uses, so turning a module on here refreshes the rail too. */
export function useModules() {
  return useQuery({
    queryKey: MODULES_KEY,
    queryFn: () => api.get<ModuleRow[]>('/v1/tenant/modules'),
  });
}

/** The account's billing picture — used only to make the turn-on message honest
 *  (is this in a free trial, or does it bill now?). Read-only; managing the
 *  subscription itself lives in billing, not here. */
export interface BillingState {
  configured: boolean;
  billingActive: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  planTotalCents: number;
  planType: 'standard' | 'enterprise';
}

export function useBilling() {
  return useQuery({
    queryKey: ['billing'],
    queryFn: () => api.get<BillingState>('/v1/billing'),
    staleTime: 300_000,
  });
}

/** Turn one module on or off. The server does the real work — fanning in required
 *  modules, publishing the activation event that seeds defaults, and keeping the
 *  subscription in step. A refused turn-off (a module something else still needs)
 *  comes back as a 409 whose sentence names what to turn off first, so that
 *  message is surfaced rather than swallowed. */
export function useToggleModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, enabled }: { slug: string; enabled: boolean }) =>
      api.patch<{ slug: string; enabled: boolean }>(`/v1/tenant/modules/${slug}`, { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MODULES_KEY });
      // Enabling a paid module changes the plan total; keep the context strip
      // and any billing surface in step.
      void queryClient.invalidateQueries({ queryKey: ['billing'] });
    },
  });
}

/** A module toggle's error, preferring the server's own sentence for a 4xx — the
 *  "turn off Wholesale first" conflict is written to be shown verbatim. */
export function moduleErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}
