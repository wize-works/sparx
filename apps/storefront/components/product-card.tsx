// Product tile used by PLP + collection pages. Inline styles only — the
// storefront's default theme will later become a token-driven @sparx/ui
// surface, but for the Phase 1 scaffold the inline approach keeps the
// dependency on @sparx/ui out of the storefront's runtime.

import Link from 'next/link';

import type { PublicProductListItem } from '@/lib/commerce';

export interface ProductCardProps {
  product: PublicProductListItem;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/products/${product.handle}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1.25rem',
        borderRadius: '12px',
        border: '1px solid var(--color-border-default, #e5e7eb)',
        background: 'var(--color-bg-surface, #ffffff)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        aria-hidden
        style={{
          aspectRatio: '1 / 1',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.04))',
          borderRadius: '8px',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {product.vendor && (
          <span
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted, #6b7280)',
            }}
          >
            {product.vendor}
          </span>
        )}
        <span style={{ fontSize: '1rem', fontWeight: 500, letterSpacing: '-0.01em' }}>
          {product.title}
        </span>
        <PriceRange min={product.priceMinCents} max={product.priceMaxCents} />
        {!product.inStock && (
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-warning, #b45309)',
              marginTop: '0.25rem',
            }}
          >
            Out of stock
          </span>
        )}
      </div>
    </Link>
  );
}

function PriceRange({ min, max }: { min: number | null; max: number | null }) {
  if (min === null) return null;
  const fmt = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  if (max === null || max === min) {
    return <span style={{ fontSize: '0.95rem' }}>{fmt(min)}</span>;
  }
  return (
    <span style={{ fontSize: '0.95rem' }}>
      {fmt(min)} – {fmt(max)}
    </span>
  );
}
