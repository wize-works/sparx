// Bound collection section — count toolbar + product grid + pagination.

import type { CollectionProductsConfig } from '@sparx/sitebuilder-schemas';

import { Pagination } from '@/components/pagination';
import { ProductGrid } from '@/components/product-grid';
import type { SectionContext } from '../section-renderer';

export function CollectionProductsSection({
  config,
  ctx,
}: {
  config: CollectionProductsConfig;
  ctx: SectionContext;
}) {
  const collection = ctx.collection;
  const extras = ctx.collectionExtras;
  if (!collection || !extras) return null;
  const totalPages = Math.max(1, Math.ceil(extras.total / extras.perPage));
  return (
    <>
      {config.showCount ? (
        <div className="sf-toolbar">
          <span className="sf-toolbar__count">
            {extras.total} {extras.total === 1 ? 'product' : 'products'}
          </span>
        </div>
      ) : null}

      <ProductGrid
        products={extras.items}
        tenantSlug={ctx.tenantSlug}
        currency={ctx.currency}
        locale={ctx.locale}
      />

      {totalPages > 1 ? (
        <Pagination
          basePath={`/collections/${collection.handle}`}
          currentParams={extras.currentParams}
          page={extras.page}
          totalPages={totalPages}
        />
      ) : null}
    </>
  );
}
