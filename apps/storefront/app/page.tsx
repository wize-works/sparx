// Storefront root — resolves the tenant from Host, then renders the page
// with slug 'home'. If no home page exists yet, surfaces a friendly setup
// hint pointing at the dashboard.

import { notFound } from 'next/navigation';
import { resolveTenant } from '@/lib/tenant';
import { getPageBySlug } from '@/lib/content';
import { PageView } from '@/components/page-view';

export const dynamic = 'force-dynamic';

interface RootPageProps {
  searchParams?: Promise<{ sparxPreview?: string }>;
}

export default async function StorefrontRoot({ searchParams }: RootPageProps) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  const previewToken = (await searchParams)?.sparxPreview;
  const page = await getPageBySlug(tenant.slug, 'home', previewToken ? { previewToken } : {});

  if (!page) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 600,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          {tenant.name}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Storefront is live, but no <code>home</code> page is published yet.
        </p>
        <p style={{ color: 'var(--color-text-tertiary)', margin: 0, fontSize: '0.875rem' }}>
          Create a page with slug <code>home</code> in the dashboard to fill this in.
        </p>
      </main>
    );
  }

  return <PageView entry={page} />;
}
