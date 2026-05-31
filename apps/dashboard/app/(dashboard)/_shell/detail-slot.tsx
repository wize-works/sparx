import 'server-only';
import * as React from 'react';
import { ModuleProvider, type SparxModule } from '@sparx/ui';
import { parseDetailToken } from './detail-registry';
import { AuthorDetailContent } from '../cms/authors/[id]/_content';
import { CmsPageDetailContent } from '../cms/[id]/_content';
import { MediaAssetDetailContent } from '../cms/media/[id]/_content';
import { MenuDetailContent } from '../cms/navigation/menu-detail';
import { TaxonomyDetailContent } from '../cms/taxonomy/[key]/_content';
import { B2bAccountDetailContent } from '../crm/b2b/[id]/_content';
import { CustomerDetailContent } from '../crm/customers/[id]/_content';
import { DealDetailContent } from '../crm/deals/[id]/_content';
import { OrderDetailContent } from '../crm/orders/[id]/_content';
import { QuoteDetailContent } from '../crm/quotes/[id]/_content';
import { SegmentDetailContent } from '../crm/segments/[id]/_content';
import { BundleDetailContent } from '../commerce/bundles/[id]/_content';
import { CartDetailContent } from '../commerce/carts/[id]/_content';
import { CollectionDetailContent } from '../commerce/collections/[id]/_content';
import { ConfiguratorTemplateDetailContent } from '../commerce/configurator/[id]/_content';
import { PriceListDetailContent } from '../commerce/pricing/[id]/_content';
import { ProductDetailContent } from '../commerce/products/[id]/_content';
import { ProviderInstallationDetailContent } from '../commerce/providers/[id]/_content';
import { QuestionDetailContent } from '../commerce/qa/[id]/_content';
import { ReturnDetailContent } from '../commerce/returns/[id]/_content';
import { ReviewDetailContent } from '../commerce/reviews/[id]/_content';
import { ShippingProfileDetailContent } from '../commerce/shipping/profiles/[id]/_content';
import { ShippingZoneDetailContent } from '../commerce/shipping/zones/[id]/_content';
import { SubscriptionDetailContent } from '../commerce/subscriptions/[id]/_content';
import { TaxZoneDetailContent } from '../commerce/tax/zones/[id]/_content';
import { WarehouseDetailContent } from '../commerce/warehouses/[id]/_content';

// Server-only registry mapping a manifest entity type id → its detail content
// component. These are React Server Components that fetch their own data
// (session, REST, DB), so they can only ever be rendered on the server — the
// `@detail` parallel route is the single place that does so.
//
// The `server-only` import above is a tripwire: if anything in the client
// graph ever imports this module, the build fails loudly here instead of
// surfacing as an opaque "next/headers in a Client Component" error.

type DetailComponent = React.ComponentType<{ id: string }>;

const detailComponents: Record<string, DetailComponent> = {
  // CMS
  page: CmsPageDetailContent,
  media: MediaAssetDetailContent,
  author: AuthorDetailContent,
  taxonomy: TaxonomyDetailContent,
  menu: MenuDetailContent,
  // CRM
  customer: CustomerDetailContent,
  'b2b-account': B2bAccountDetailContent,
  deal: DealDetailContent,
  quote: QuoteDetailContent,
  order: OrderDetailContent,
  segment: SegmentDetailContent,
  // Commerce
  product: ProductDetailContent,
  collection: CollectionDetailContent,
  warehouse: WarehouseDetailContent,
  review: ReviewDetailContent,
  'qa-question': QuestionDetailContent,
  subscription: SubscriptionDetailContent,
  return: ReturnDetailContent,
  bundle: BundleDetailContent,
  cart: CartDetailContent,
  'provider-installation': ProviderInstallationDetailContent,
  'price-list': PriceListDetailContent,
  'configurator-template': ConfiguratorTemplateDetailContent,
  'shipping-profile': ShippingProfileDetailContent,
  'shipping-zone': ShippingZoneDetailContent,
  'tax-zone': TaxZoneDetailContent,
};

// Each entity type's owning module. The `@detail` slot renders OUTSIDE any
// module `layout.tsx`, so without this the drawer/modal content inherits the
// `:root` default of `--module-active` (storefront indigo) — the Publish
// button, section rules, and badges all come out indigo regardless of which
// module the record belongs to. Wrapping the content in the right
// ModuleProvider restores the correct accent (CMS teal, CRM cyan, etc.).
const detailModules: Record<string, SparxModule> = {
  // CMS
  page: 'cms',
  media: 'cms',
  author: 'cms',
  taxonomy: 'cms',
  menu: 'cms',
  // CRM
  customer: 'crm',
  'b2b-account': 'crm',
  deal: 'crm',
  quote: 'crm',
  order: 'crm',
  segment: 'crm',
  // Commerce
  product: 'commerce',
  collection: 'commerce',
  warehouse: 'commerce',
  review: 'commerce',
  'qa-question': 'commerce',
  subscription: 'commerce',
  return: 'commerce',
  bundle: 'commerce',
  cart: 'commerce',
  'provider-installation': 'commerce',
  'price-list': 'commerce',
  'configurator-template': 'commerce',
  'shipping-profile': 'commerce',
  'shipping-zone': 'commerce',
  'tax-zone': 'commerce',
};

// Renders the detail content for a given (typeId, id), or null when the type
// has no registered server component. Returns a node — callers wrap it in a
// Suspense boundary so the fetch streams. The content is wrapped in its
// module's provider so the drawer/modal adopts the correct accent color.
export function renderDetailContent(typeId: string, id: string): React.ReactNode {
  const Content = detailComponents[typeId];
  if (!Content) return null;
  return (
    <ModuleProvider module={detailModules[typeId] ?? 'platform'}>
      <Content id={id} />
    </ModuleProvider>
  );
}

// The `@detail` parallel-slot page. Both the index slot and the catch-all
// slot re-export this so the detail resolves on every route under (dashboard)
// — the detail is keyed by the query string, not the path. Reads the same
// `?modal=` / `?drawer=` token as the client `useDetailTarget()` (modal wins),
// dispatches through the registry, and wraps the (async) content in a Suspense
// boundary so it streams.
export default async function DetailSlot({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = pickOne(sp.modal) ?? pickOne(sp.drawer);
  const target = parseDetailToken(token);
  if (!target) return null;

  return (
    <React.Suspense key={`${target.typeId}:${target.entityId}`} fallback={null}>
      {renderDetailContent(target.typeId, target.entityId)}
    </React.Suspense>
  );
}

function pickOne(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
