// Hero section — full-width banner with an optional background image, an
// overlay scrim, heading/subheading, and a CTA. Token-driven; alignment and
// overlay opacity come from the section config.

import type { HeroConfig } from '@sparx/sitebuilder-schemas';

import { mediaUrl } from '@/lib/media';
import type { SectionContext } from '../section-renderer';
import { SbLink } from './_shared';

export function HeroSection({ config, ctx }: { config: HeroConfig; ctx: SectionContext }) {
  const bg = mediaUrl(config.backgroundMediaId ?? null, ctx.tenantSlug);
  const overlay = Math.min(100, Math.max(0, config.overlayOpacity)) / 100;

  return (
    <section
      className="sf-sb-hero"
      data-align={config.align}
      data-has-bg={bg ? 'true' : 'false'}
      style={bg ? { backgroundImage: `url("${bg}")` } : undefined}
    >
      {bg ? (
        <div className="sf-sb-hero__scrim" style={{ opacity: overlay }} aria-hidden="true" />
      ) : null}
      <div className="sf-container sf-sb-hero__inner">
        {config.heading ? <h1 className="sf-sb-hero__title">{config.heading}</h1> : null}
        {config.subheading ? <p className="sf-sb-hero__sub">{config.subheading}</p> : null}
        <SbLink
          url={config.ctaUrl}
          label={config.ctaLabel}
          className="sf-btn sf-btn--primary sf-btn--lg"
        />
      </div>
    </section>
  );
}
