import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
import { Button, Container, Heading, Stack } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { CmsTabs } from '../_components/cms-tabs';
import { EditPageForm, type EditableTenantPage } from './edit-form';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ id: string }>;
}

interface ApiEntry {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: Record<string, unknown>;
  seo: Record<string, unknown>;
  published_at: string | null;
  scheduled_at: string | null;
  updated_at: string;
}

export default async function EditCmsPage({ params }: PageParams) {
  const { id } = await params;
  const { user } = await requireSession();

  const [entryResult, tenant] = await Promise.all([
    (async () => {
      try {
        return await api.getWithEtag<ApiEntry>(`/v1/content/entries/${id}`);
      } catch (err) {
        const e = err as ApiRestError;
        if (e?.status === 404) notFound();
        throw err;
      }
    })(),
    withTenant({ tenantId: user.tenantId }, (tx) =>
      tx.tenant.findUnique({ where: { id: user.tenantId }, select: { slug: true } })
    ),
  ]);
  const entry = entryResult.data;
  const initialEtag = entryResult.etag;

  const docBody =
    entry.body.body && typeof entry.body.body === 'object'
      ? (entry.body.body as Record<string, unknown>)
      : { type: 'doc', content: [] };

  const seoVal = entry.seo ?? {};
  const editable: EditableTenantPage = {
    id: entry.id,
    typeKey: entry.type_key,
    slug: entry.slug ?? '',
    title: typeof entry.body.title === 'string' ? entry.body.title : '',
    status: entry.status,
    body: docBody,
    seo: {
      title: typeof seoVal.title === 'string' ? seoVal.title : '',
      description: typeof seoVal.description === 'string' ? seoVal.description : '',
      canonical: typeof seoVal.canonical === 'string' ? seoVal.canonical : '',
      robots: typeof seoVal.robots === 'string' ? seoVal.robots : '',
      ogImage: typeof seoVal.ogImage === 'string' ? seoVal.ogImage : '',
    },
    publishedAt: entry.published_at ? new Date(entry.published_at) : null,
    scheduledAt: entry.scheduled_at ? new Date(entry.scheduled_at) : null,
    updatedAt: new Date(entry.updated_at),
  };

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="pages" />
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/cms">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to pages
            </Link>
          </Button>
          <Heading level={1}>Edit page</Heading>
        </Stack>

        <EditPageForm page={editable} tenantSlug={tenant?.slug ?? null} initialEtag={initialEtag} />
      </Stack>
    </Container>
  );
}
