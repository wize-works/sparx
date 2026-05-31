import Link from 'next/link';
import { Card, Heading, Text } from '@sparx/ui';
import { getSitePreviewToken, getTenant, listSections } from '../_lib/api';
import { PageBuilder } from '../_components/page-builder';
import { storefrontOrigin } from '../_lib/storefront';
import { PageSlugForm } from './page-slug-form';

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const pageKey = (await searchParams).page?.trim() ?? '';
  const [sections, tenant, previewToken] = await Promise.all([
    pageKey ? listSections(pageKey) : Promise.resolve([]),
    getTenant(),
    getSitePreviewToken(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading level={1}>Pages</Heading>
        <Text variant="muted">
          Compose section-based landing pages. For long-form content pages, use the{' '}
          <Link href="/cms" className="text-[var(--module-active)] hover:underline">
            CMS
          </Link>
          . Enter a page slug to add sections that render at that path.
        </Text>
      </div>

      <Card variant="module" padding="md">
        <PageSlugForm initial={pageKey} />
      </Card>

      {pageKey ? (
        <div className="flex flex-col gap-3">
          <Text size="sm" variant="muted">
            Editing sections for <span className="font-mono">/{pageKey}</span>
          </Text>
          <PageBuilder
            pageKey={pageKey}
            sections={sections}
            storefrontUrl={storefrontOrigin(tenant.slug)}
            slug={tenant.slug}
            previewPath={`/${pageKey}`}
            previewToken={previewToken}
          />
        </div>
      ) : null}
    </div>
  );
}
