// Collection index. Lists every published collection for the tenant.
// Featured collections float to the top; both manual and rules-driven
// collections appear here — the storefront only consumes the
// materialized membership, so the distinction is invisible to shoppers.

import { notFound } from 'next/navigation';
import Link from 'next/link';

import { listCollections } from '@/lib/commerce';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function CollectionListingPage() {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  const collections = await listCollections(tenant.slug);

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
          Collections
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-muted, #6b7280)' }}>
          Curated lineups from {tenant.name}.
        </p>
      </header>
      {collections.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted, #6b7280)' }}>
          No collections yet. The merchant can create one in the dashboard.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/collections/${collection.handle}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid var(--color-border-default, #e5e7eb)',
                background: 'var(--color-bg-surface, #ffffff)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              {collection.featured && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-accent, #6366f1)',
                  }}
                >
                  Featured
                </span>
              )}
              <span style={{ fontSize: '1.05rem', fontWeight: 500 }}>{collection.name}</span>
              {collection.description && (
                <span
                  style={{
                    color: 'var(--color-text-muted, #6b7280)',
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                  }}
                >
                  {collection.description}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
