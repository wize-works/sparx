// Product tile for the PLP, collections, search, and "related" rails.
// Token-driven via the .sf-card classes in storefront.css so merchant theme
// overrides flow through automatically.

import Link from 'next/link';

import { formatMoney, formatPriceRange } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import type { PublicProductListItem } from '@/lib/commerce';
import { RatingStars } from './rating-stars';

export interface ProductCardProps {
  product: PublicProductListItem;
  tenantSlug: string;
  currency?: string;
  locale?: string;
}

export function ProductCard({
  product,
  tenantSlug,
  currency = 'USD',
  locale = 'en-US',
}: ProductCardProps) {
  const img = mediaUrl(product.primaryImageId, tenantSlug);
  const onSale =
    product.compareAtCents != null &&
    product.priceMinCents != null &&
    product.compareAtCents > product.priceMinCents;

  return (
    <Link href={`/products/${product.handle}`} className="sf-card">
      <div className="sf-card__media">
        {onSale ? <span className="sf-badge sf-badge--sale">Sale</span> : null}
        {!product.inStock ? <span className="sf-badge sf-badge--out">Sold out</span> : null}
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element -- cross-origin media via api-rest redirect
          <img src={img} alt={product.title} loading="lazy" decoding="async" />
        ) : (
          <div className="sf-card__media sf-card__media--empty" aria-hidden="true">
            <span style={{ fontSize: '2rem' }}>◳</span>
          </div>
        )}
      </div>
      <div className="sf-card__body">
        {product.vendor ? <span className="sf-card__vendor">{product.vendor}</span> : null}
        <span className="sf-card__title">{product.title}</span>
        {product.reviewCount > 0 && product.averageRating != null ? (
          <RatingStars rating={product.averageRating} count={product.reviewCount} compact />
        ) : null}
        <PriceLine
          min={product.priceMinCents}
          max={product.priceMaxCents}
          compareAt={onSale ? product.compareAtCents : null}
          currency={currency}
          locale={locale}
        />
      </div>
    </Link>
  );
}

function PriceLine({
  min,
  max,
  compareAt,
  currency,
  locale,
}: {
  min: number | null;
  max: number | null;
  compareAt: number | null;
  currency: string;
  locale: string;
}) {
  const range = formatPriceRange(min, max, currency, locale);
  if (!range) return null;
  return (
    <span className="sf-card__price">
      {range}
      {compareAt != null ? (
        <span className="sf-card__compare">{formatMoney(compareAt, currency, locale)}</span>
      ) : null}
    </span>
  );
}
