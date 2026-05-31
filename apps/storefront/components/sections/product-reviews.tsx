// Bound product section — rating summary + write-a-review form.

import type { ProductReviewsConfig } from '@sparx/sitebuilder-schemas';

import { RatingStars } from '@/components/rating-stars';
import { ReviewForm } from '@/components/review-form';
import type { SectionContext } from '../section-renderer';

export function ProductReviewsSection({
  config,
  ctx,
}: {
  config: ProductReviewsConfig;
  ctx: SectionContext;
}) {
  const product = ctx.product;
  if (!product) return null;
  return (
    <section className="sf-section">
      <h2 className="sf-h2" style={{ marginBottom: '1rem' }}>
        {config.heading}
      </h2>
      {product.reviewCount > 0 && product.averageRating != null ? (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}
        >
          <RatingStars rating={product.averageRating} count={product.reviewCount} />
        </div>
      ) : (
        <p className="sf-muted" style={{ marginBottom: '1.25rem' }}>
          {config.emptyText}
        </p>
      )}
      {config.showForm ? <ReviewForm tenantSlug={ctx.tenantSlug} handle={product.handle} /> : null}
    </section>
  );
}
