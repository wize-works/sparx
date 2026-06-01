import Link from 'next/link';
import { Card, Heading, Text } from '@sparx/ui';
import { listSectionsByPageLayout, resolvePageLayout } from '../_lib/api';
import { SectionBuilder } from '../_components/section-builder';
import { PageSlugForm } from './page-slug-form';

// Section-based landing pages. Renders in the editor shell's inspector column;
// once a page slug is chosen, the shared persistent canvas previews that path
// and the section editor drives it. A slug page is a `cms:content-page` target
// layout keyed by the slug; we resolve it (idempotent) once a slug is entered.
export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const pageKey = (await searchParams).page?.trim() ?? '';
  const pageLayout = pageKey ? await resolvePageLayout('cms:content-page', pageKey) : null;
  const sections = pageLayout ? await listSectionsByPageLayout(pageLayout.id) : [];

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

      {pageLayout ? (
        <div className="flex flex-col gap-3">
          <Text size="sm" variant="muted">
            Editing sections for <span className="font-mono">/{pageKey}</span>
          </Text>
          <SectionBuilder
            pageLayoutId={pageLayout.id}
            targetId="cms:content-page"
            sections={sections}
            previewPath={`/${pageKey}`}
          />
        </div>
      ) : null}
    </div>
  );
}
