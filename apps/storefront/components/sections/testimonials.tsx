// Testimonials section — social-proof cards with an optional avatar and star
// rating. Columns come from config; rows wrap responsively below.

import type { TestimonialsConfig } from '@sparx/sitebuilder-schemas';

import { RatingStars } from '@/components/rating-stars';
import { mediaUrl } from '@/lib/media';
import type { SectionContext } from '../section-renderer';

export function TestimonialsSection({
  config,
  ctx,
}: {
  config: TestimonialsConfig;
  ctx: SectionContext;
}) {
  const items = config.items.filter((t) => t.quote);
  if (items.length === 0) return null;

  return (
    <section className="sf-container sf-section">
      {config.heading ? (
        <div className="sf-section__head">
          <h2 className="sf-h2">{config.heading}</h2>
        </div>
      ) : null}
      <div className="sf-grid" data-cols={config.columns}>
        {items.map((t, i) => {
          const avatar = mediaUrl(t.avatarMediaId ?? null, ctx.tenantSlug);
          return (
            <figure key={i} className="sf-sb-quote">
              {typeof t.rating === 'number' ? (
                <RatingStars rating={t.rating} compact />
              ) : null}
              <blockquote className="sf-sb-quote__text">{t.quote}</blockquote>
              <figcaption className="sf-sb-quote__by">
                {avatar ? (
                  <img className="sf-sb-quote__avatar" src={avatar} alt="" loading="lazy" />
                ) : null}
                <span>
                  {t.authorName ? <strong>{t.authorName}</strong> : null}
                  {t.authorTitle ? (
                    <span className="sf-muted"> · {t.authorTitle}</span>
                  ) : null}
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
