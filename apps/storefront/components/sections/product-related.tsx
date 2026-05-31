// Bound product section — a "you may also like" rail of related products.

import type { ProductRelatedConfig } from '@sparx/sitebuilder-schemas';

import { ProductCard } from '@/components/product-card';
import type { SectionContext } from '../section-renderer';

export function ProductRelatedSection({
  config,
  ctx,
}: {
  config: ProductRelatedConfig;
  ctx: SectionContext;
}) {
  const related = ctx.productExtras?.related ?? [];
  if (related.length === 0) return null;
  const items = related.slice(0, config.limit);
  return (
    <section className="sf-section">
      <div className="sf-section__head">
        <h2 className="sf-h2">{config.heading}</h2>
      </div>
      <div className="sf-grid">
        {items.map((p) => (
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
