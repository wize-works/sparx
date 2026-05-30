// Featured products section — a grid of product tiles sourced from a
// collection, the newest published products, or a hand-picked list. Reuses the
// shared ProductCard so theming + sale/stock badges stay consistent with the
// PLP. Async server component (fetches from the public commerce API).

import type { FeaturedProductsConfig } from '@sparx/sitebuilder-schemas';

import {
  listProducts,
  listCollections,
  listCollectionProducts,
  getProductsByIds,
  type PublicProductListItem,
} from '@/lib/commerce';
import { ProductCard } from '@/components/product-card';
import type { SectionContext } from '../section-renderer';

async function resolveProducts(
  config: FeaturedProductsConfig,
  tenantSlug: string
): Promise<PublicProductListItem[]> {
  if (config.source === 'manual') {
    const items = await getProductsByIds(tenantSlug, config.productIds);
    return items.slice(0, config.limit);
  }
  if (config.source === 'collection' && config.collectionId) {
    // The public collection-products read keys on handle; resolve the
    // configured collection id → handle (collections are few per store).
    const collections = await listCollections(tenantSlug).catch(() => []);
    const match = collections.find((c) => c.id === config.collectionId);
    if (!match) return [];
    const { items } = await listCollectionProducts(tenantSlug, match.handle, 1, config.limit).catch(
      () => ({ items: [] as PublicProductListItem[], total: 0, page: 1, perPage: config.limit })
    );
    return items;
  }
  // newest (and the collection fallback when no collection is configured)
  const { items } = await listProducts(tenantSlug, {
    sort: 'newest',
    perPage: config.limit,
  }).catch(() => ({ items: [] as PublicProductListItem[], total: 0, page: 1, perPage: config.limit }));
  return items;
}

export async function FeaturedProductsSection({
  config,
  ctx,
}: {
  config: FeaturedProductsConfig;
  ctx: SectionContext;
}) {
  const products = await resolveProducts(config, ctx.tenantSlug);
  if (products.length === 0) return null;

  return (
    <section className="sf-container sf-section">
      {config.heading ? (
        <div className="sf-section__head">
          <h2 className="sf-h2">{config.heading}</h2>
        </div>
      ) : null}
      <div className="sf-grid" data-cols={config.columns}>
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            tenantSlug={ctx.tenantSlug}
            currency={ctx.currency}
            locale={ctx.locale}
          />
        ))}
      </div>
    </section>
  );
}
