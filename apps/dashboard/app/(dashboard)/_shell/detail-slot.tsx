import 'server-only';
import * as React from 'react';
import { parseDetailToken } from './detail-registry';
import { AuthorDetailContent } from '../cms/authors/[id]/_content';
import { CmsPageDetailContent } from '../cms/[id]/_content';
import { MediaAssetDetailContent } from '../cms/media/[id]/_content';
import { MenuDetailContent } from '../cms/navigation/[location]/_content';
import { TaxonomyDetailContent } from '../cms/taxonomy/[key]/_content';
import { B2bAccountDetailContent } from '../crm/b2b/[id]/_content';
import { CustomerDetailContent } from '../crm/customers/[id]/_content';
import { DealDetailContent } from '../crm/deals/[id]/_content';
import { OrderDetailContent } from '../crm/orders/[id]/_content';
import { QuoteDetailContent } from '../crm/quotes/[id]/_content';
import { SegmentDetailContent } from '../crm/segments/[id]/_content';

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
  menu: MenuDetailContent,
  taxonomy: TaxonomyDetailContent,
  // CRM
  customer: CustomerDetailContent,
  'b2b-account': B2bAccountDetailContent,
  deal: DealDetailContent,
  quote: QuoteDetailContent,
  order: OrderDetailContent,
  segment: SegmentDetailContent,
};

// Renders the detail content for a given (typeId, id), or null when the type
// has no registered server component. Returns a node — callers wrap it in a
// Suspense boundary so the fetch streams.
export function renderDetailContent(typeId: string, id: string): React.ReactNode {
  const Content = detailComponents[typeId];
  if (!Content) return null;
  return <Content id={id} />;
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
