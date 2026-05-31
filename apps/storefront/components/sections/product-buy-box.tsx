// Bound product section — the buy box: gallery + title/price + variants +
// add-to-cart. Re-houses the existing interactive <ProductDetail> behind the
// section registry (docs/handoffs/sitebuilder-phase3-spec.md §4.2). Renders
// nothing outside a product binding. The presentation config (gallery layout,
// sticky, show vendor/sku) is forward-looking — wired into ProductDetail in a
// later refinement; 3.2 renders it exactly as today's PDP for parity.

import type { ProductBuyBoxConfig } from '@sparx/sitebuilder-schemas';

import { ProductDetail } from '@/components/product-detail';
import type { SectionContext } from '../section-renderer';

export function ProductBuyBoxSection({
  ctx,
}: {
  config: ProductBuyBoxConfig;
  ctx: SectionContext;
}) {
  if (!ctx.product) return null;
  return (
    <ProductDetail
      product={ctx.product}
      tenantSlug={ctx.tenantSlug}
      currency={ctx.currency}
      locale={ctx.locale}
      showStockBelow={ctx.showStockBelow ?? 0}
    />
  );
}
