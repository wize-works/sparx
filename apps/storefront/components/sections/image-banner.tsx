// Image banner section — an image with optional overlay heading/copy and a CTA.
// Height preset (sm/md/lg) and text alignment come from config.

import type { ImageBannerConfig } from '@sparx/sitebuilder-schemas';

import { mediaUrl } from '@/lib/media';
import type { SectionContext } from '../section-renderer';
import { SbLink } from './_shared';

export function ImageBannerSection({
  config,
  ctx,
}: {
  config: ImageBannerConfig;
  ctx: SectionContext;
}) {
  const img = mediaUrl(config.imageMediaId ?? null, ctx.tenantSlug);
  const hasText = Boolean(
    config.heading || config.subheading || (config.ctaLabel && config.ctaUrl)
  );

  return (
    <section className="sf-container sf-section">
      <div
        className="sf-sb-banner"
        data-height={config.height}
        data-align={config.align}
        style={img ? { backgroundImage: `url("${img}")` } : undefined}
      >
        {hasText ? (
          <div className="sf-sb-banner__inner">
            {config.heading ? <h2 className="sf-sb-banner__title">{config.heading}</h2> : null}
            {config.subheading ? <p className="sf-sb-banner__sub">{config.subheading}</p> : null}
            <SbLink
              url={config.ctaUrl}
              label={config.ctaLabel}
              className="sf-btn sf-btn--primary"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
