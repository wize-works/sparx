// Product detail page (PDP). Phase 1: hero block, variant picker
// (option-value swatches), price, fitment list. Cart-add lands in
// Phase 5; for now the CTA is a no-op label so the visual frame is
// already in place when checkout wires in.

import { notFound } from 'next/navigation';
import Link from 'next/link';

import { getProduct, type PublicProductVariant } from '@/lib/commerce';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ handle: string }>;
}

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export async function generateMetadata({ params }: PageProps) {
  const tenant = await resolveTenant();
  if (!tenant) return {};
  const { handle } = await params;
  const product = await getProduct(tenant.slug, handle);
  if (!product) return {};
  return {
    title: product.seoTitle ?? product.title,
    description: product.seoDescription ?? product.description ?? undefined,
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();
  const { handle } = await params;
  const product = await getProduct(tenant.slug, handle);
  if (!product) notFound();

  const defaultVariant: PublicProductVariant | undefined =
    product.variants.find((v) => v.isDefault) ?? product.variants[0];

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <nav style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        <Link
          href="/products"
          style={{ color: 'var(--color-text-muted, #6b7280)', textDecoration: 'none' }}
        >
          ← Back to all products
        </Link>
      </nav>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '3rem',
        }}
      >
        <Gallery alt={product.title} hasImages={product.images.length > 0} />
        <Details
          tenantName={tenant.name}
          title={product.title}
          vendor={product.vendor}
          description={product.description}
          defaultVariant={defaultVariant}
          variants={product.variants}
          tags={product.tags}
          inStock={product.inStock}
        />
      </div>
      {product.options.length > 0 && (
        <section style={{ marginTop: '3rem' }}>
          <h2 style={sectionHeadingStyle()}>Available options</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {product.options.map((option) => (
              <div
                key={option.id}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
              >
                <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{option.name}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {option.values.map((value) => (
                    <span
                      key={value.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '999px',
                        background: 'var(--color-bg-subtle, #f1f3f7)',
                        fontSize: '0.85rem',
                      }}
                    >
                      {value.swatchHex && (
                        <span
                          aria-hidden
                          style={{
                            display: 'inline-block',
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: value.swatchHex,
                            border: '1px solid rgba(0, 0, 0, 0.1)',
                          }}
                        />
                      )}
                      {value.value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {product.fitments.length > 0 && (
        <section style={{ marginTop: '3rem' }}>
          <h2 style={sectionHeadingStyle()}>Vehicle fitment</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {product.fitments.map((f) => (
              <li
                key={f.id}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'baseline',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: 'var(--color-bg-subtle, #f6f7fa)',
                  fontSize: '0.9rem',
                }}
              >
                <strong>{f.make}</strong>
                {f.model && <span>{f.model}</span>}
                {f.engine && (
                  <span style={{ color: 'var(--color-text-muted, #6b7280)' }}>· {f.engine}</span>
                )}
                {(f.yearMin ?? f.yearMax) !== null && (
                  <span style={{ color: 'var(--color-text-muted, #6b7280)' }}>
                    · {f.yearMin ?? '…'}–{f.yearMax ?? 'present'}
                  </span>
                )}
                {f.notes && (
                  <span style={{ color: 'var(--color-text-muted, #6b7280)' }}>· {f.notes}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Gallery({ alt, hasImages }: { alt: string; hasImages: boolean }) {
  return (
    <div
      role="img"
      aria-label={alt}
      style={{
        aspectRatio: '1 / 1',
        borderRadius: '14px',
        background: hasImages
          ? 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.05))'
          : 'var(--color-bg-subtle, #f1f3f7)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--color-text-muted, #9ca3af)',
        fontSize: '0.85rem',
      }}
    >
      {hasImages ? '' : 'Image coming soon'}
    </div>
  );
}

function Details({
  tenantName,
  title,
  vendor,
  description,
  defaultVariant,
  variants,
  tags,
  inStock,
}: {
  tenantName: string;
  title: string;
  vendor: string | null;
  description: string | null;
  defaultVariant: PublicProductVariant | undefined;
  variants: PublicProductVariant[];
  tags: string[];
  inStock: boolean;
}) {
  const price = defaultVariant?.priceCents ?? null;
  const compareAt = defaultVariant?.compareAtPriceCents ?? null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {vendor && (
        <span
          style={{
            fontSize: '0.75rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted, #6b7280)',
          }}
        >
          {vendor}
        </span>
      )}
      <h1 style={{ margin: 0, fontSize: '2rem', letterSpacing: '-0.02em' }}>{title}</h1>
      {price !== null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>
            {moneyFmt.format(price / 100)}
          </span>
          {compareAt !== null && compareAt > price && (
            <span
              style={{
                fontSize: '1rem',
                textDecoration: 'line-through',
                color: 'var(--color-text-muted, #9ca3af)',
              }}
            >
              {moneyFmt.format(compareAt / 100)}
            </span>
          )}
        </div>
      )}
      {description && (
        <p style={{ margin: 0, color: 'var(--color-text-secondary, #374151)', lineHeight: 1.6 }}>
          {description}
        </p>
      )}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                padding: '0.25rem 0.6rem',
                borderRadius: '999px',
                background: 'var(--color-bg-subtle, #eef2ff)',
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary, #4338ca)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled
        title="Cart + checkout wire in Phase 5"
        style={{
          marginTop: '1rem',
          padding: '0.85rem 1.25rem',
          borderRadius: '8px',
          background: inStock
            ? 'var(--color-action-primary, #6366f1)'
            : 'var(--color-bg-disabled, #d1d5db)',
          color: '#ffffff',
          border: 'none',
          fontSize: '0.95rem',
          cursor: 'not-allowed',
          opacity: inStock ? 0.85 : 1,
        }}
      >
        {inStock ? 'Add to cart (Phase 5)' : 'Out of stock'}
      </button>
      <p
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-text-muted, #9ca3af)',
          margin: 0,
        }}
      >
        Sold by {tenantName}. {variants.length} {variants.length === 1 ? 'variant' : 'variants'}{' '}
        available.
      </p>
    </div>
  );
}

function sectionHeadingStyle(): React.CSSProperties {
  return {
    margin: '0 0 1rem',
    fontSize: '1.25rem',
    letterSpacing: '-0.01em',
    fontWeight: 600,
  };
}
