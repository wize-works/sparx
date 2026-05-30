// Responsive product grid wrapper. CSS Grid with auto-fit so the card
// minimum-width drives column count without media queries.

import type { PublicProductListItem } from '@/lib/commerce';
import { ProductCard } from './product-card';

export interface ProductGridProps {
  products: PublicProductListItem[];
  empty?: React.ReactNode;
}

export function ProductGrid({ products, empty }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div
        style={{
          padding: '4rem 1.5rem',
          textAlign: 'center',
          color: 'var(--color-text-muted, #6b7280)',
        }}
      >
        {empty ?? 'No products to show yet.'}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '1.5rem',
      }}
    >
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
