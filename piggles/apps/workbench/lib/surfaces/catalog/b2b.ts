// Wholesale — selling to other businesses rather than to the public.
//
// The keys are the contract: a saved layout, a deep link and every cross-link
// from an account into its orders/quotes/invoices all name these strings, so
// they are immutable. Detail surfaces are `listed: false` — reachable from their
// list (and the nav's `+`), never opened cold from the launcher.

import {
  faBuilding,
  faCartShopping,
  faCheckCircle,
  faDollarSign,
  faFileText,
  faReceipt,
} from '@fortawesome/pro-solid-svg-icons';
import type { SurfaceDefinition } from '../registry';
import { AccountsListSurface } from '../../../surfaces/b2b/accounts-list';
import { AccountDetailSurface } from '../../../surfaces/b2b/account-detail';
import { WholesaleOrdersListSurface } from '../../../surfaces/b2b/orders-list';
import { QuotesListSurface } from '../../../surfaces/b2b/quotes-list';
import { QuoteDetailSurface } from '../../../surfaces/b2b/quote-detail';
import { InvoicesListSurface } from '../../../surfaces/b2b/invoices-list';
import { InvoiceDetailSurface } from '../../../surfaces/b2b/invoice-detail';
import { PricingTiersListSurface } from '../../../surfaces/b2b/pricing-tiers-list';
import { PricingTierDetailSurface } from '../../../surfaces/b2b/pricing-tier-detail';
import { ApprovalsSurface } from '../../../surfaces/b2b/approvals';

export const B2B_SURFACES: SurfaceDefinition[] = [
  {
    // Unsectioned on purpose: accounts are the module's centre — everything else
    // hangs off one — so they lead the panel above the Trade/Setup groups.
    key: 'b2b.accounts.list',
    title: 'Accounts',
    module: 'b2b',
    icon: faBuilding,
    order: 1,
    keywords: ['trade', 'companies', 'buyers', 'dealers', 'wholesale'],
    component: AccountsListSurface,
    createSurface: 'b2b.account.detail',
    createLabel: 'Add a trade account',
  },
  {
    key: 'b2b.account.detail',
    title: (params) => (params.id === 'new' ? 'New account' : 'Account'),
    module: 'b2b',
    icon: faBuilding,
    component: AccountDetailSurface,
    listed: false,
  },

  /* ── Trade ─────────────────────────────────────────────────────────────── */
  {
    key: 'b2b.orders.list',
    title: 'Wholesale orders',
    module: 'b2b',
    icon: faCartShopping,
    section: 'Trade',
    order: 10,
    keywords: ['trade orders', 'bulk'],
    component: WholesaleOrdersListSurface,
  },
  {
    key: 'b2b.quotes.list',
    title: 'Quotes',
    module: 'b2b',
    icon: faFileText,
    section: 'Trade',
    order: 11,
    keywords: ['rfq', 'estimate', 'request for quote', 'pricing request'],
    component: QuotesListSurface,
  },
  {
    key: 'b2b.quote.detail',
    title: 'Quote',
    module: 'b2b',
    icon: faFileText,
    component: QuoteDetailSurface,
    listed: false,
  },
  {
    key: 'b2b.invoices.list',
    title: 'Wholesale invoices',
    module: 'b2b',
    icon: faReceipt,
    section: 'Trade',
    order: 12,
    keywords: ['bills', 'terms', 'payment due', 'receivables'],
    component: InvoicesListSurface,
    createSurface: 'b2b.invoice.detail',
    createLabel: 'Raise an invoice',
  },
  {
    key: 'b2b.invoice.detail',
    title: (params) => (params.id === 'new' ? 'New invoice' : 'Invoice'),
    module: 'b2b',
    icon: faReceipt,
    component: InvoiceDetailSurface,
    listed: false,
  },

  /* ── Setup ─────────────────────────────────────────────────────────────── */
  {
    key: 'b2b.pricing-tiers.list',
    title: 'Price tiers',
    module: 'b2b',
    icon: faDollarSign,
    section: 'Setup',
    order: 20,
    keywords: ['trade price', 'levels', 'discount tier', 'volume'],
    component: PricingTiersListSurface,
    createSurface: 'b2b.pricing-tier.detail',
    createLabel: 'Add a price tier',
  },
  {
    key: 'b2b.pricing-tier.detail',
    title: (params) => (params.id === 'new' ? 'New price tier' : 'Price tier'),
    module: 'b2b',
    icon: faDollarSign,
    component: PricingTierDetailSurface,
    listed: false,
  },
  {
    key: 'b2b.approvals',
    title: 'Approvals',
    module: 'b2b',
    icon: faCheckCircle,
    section: 'Setup',
    order: 21,
    keywords: ['approval queue', 'authorize', 'authorise', 'sign off', 'credit limit'],
    component: ApprovalsSurface,
  },
];
