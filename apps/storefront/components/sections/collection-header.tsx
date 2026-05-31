// Bound collection section — hero image + name + description for the collection.

import Image from 'next/image';

import type { CollectionHeaderConfig } from '@sparx/sitebuilder-schemas';

import { mediaUrl } from '@/lib/media';
import type { SectionContext } from '../section-renderer';

export function CollectionHeaderSection({
  config,
  ctx,
}: {
  config: CollectionHeaderConfig;
  ctx: SectionContext;
}) {
  const collection = ctx.collection;
  if (!collection) return null;
  const hero = config.showHeroImage ? mediaUrl(collection.heroMediaId, ctx.tenantSlug) : null;
  return (
    <header
      style={{
        position: 'relative',
        borderRadius: 'var(--sf-radius-lg)',
        overflow: 'hidden',
        marginBottom: '2rem',
        background: hero ? undefined : 'var(--sf-bg-subtle)',
      }}
    >
      {hero ? (
        <Image
          src={hero}
          alt=""
          aria-hidden="true"
          width={1280}
          height={260}
          priority
          sizes="100vw"
          style={{ width: '100%', height: '260px', objectFit: 'cover', display: 'block' }}
        />
      ) : null}
      <div
        style={{
          padding: hero ? '2rem' : '2.5rem 0',
          ...(hero
            ? {
                position: 'absolute',
                inset: 'auto 0 0 0',
                background: 'linear-gradient(transparent, rgb(0 0 0 / 0.6))',
                color: '#fff',
              }
            : {}),
        }}
      >
        <h1 className="sf-h1" style={hero ? { color: '#fff' } : undefined}>
          {collection.name}
        </h1>
        {config.showDescription && collection.description ? (
          <p style={{ marginTop: '0.5rem', maxWidth: '60ch', lineHeight: 1.6 }}>
            {collection.description}
          </p>
        ) : null}
      </div>
    </header>
  );
}
