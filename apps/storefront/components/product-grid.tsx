// Responsive product grid. Auto-fill columns so the card min-width drives the
// column count without media queries.

import { EmptyState } from './empty-state';
import { ProductCard } from './product-card';
import type { PublicProductListItem } from '@/lib/commerce';

export interface ProductGridProps {
  products: PublicProductListItem[];
  tenantSlug: string;
  currency?: string;
  locale?: string;
  empty?: React.ReactNode;
}

export function ProductGrid({ products, tenantSlug, currency, locale, empty }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <>{empty ?? <EmptyState icon="🔍" title="No products found" description="Try adjusting your filters or search." />}</>
    );
  }
  return (
    <div className="sf-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          tenantSlug={tenantSlug}
          currency={currency}
          locale={locale}
        />
      ))}
    </div>
  );
}
