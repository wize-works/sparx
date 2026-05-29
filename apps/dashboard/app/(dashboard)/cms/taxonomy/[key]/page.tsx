import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, Container, Heading, Stack, Text } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { CmsTabs } from '../../_components/cms-tabs';
import { TermsManager } from './terms-manager';

export const dynamic = 'force-dynamic';

interface ApiTaxonomy {
  id: string;
  key: string;
  name: string;
  plural_name: string;
  hierarchical: boolean;
  term_count: number;
}

interface ApiTerm {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_term_id: string | null;
}

interface PageParams {
  params: Promise<{ key: string }>;
}

export default async function TaxonomyDetailPage({ params }: PageParams) {
  const { key } = await params;

  let taxonomy: ApiTaxonomy;
  let terms: ApiTerm[];
  try {
    [taxonomy, terms] = await Promise.all([
      api.get<ApiTaxonomy[]>(`/v1/taxonomies`).then((rows) => {
        const found = rows.find((r) => r.key === key);
        if (!found) throw Object.assign(new Error('not found'), { status: 404 });
        return found;
      }),
      api.get<ApiTerm[]>(`/v1/taxonomies/${encodeURIComponent(key)}/terms`),
    ]);
  } catch (err) {
    if ((err as ApiRestError).status === 404) notFound();
    throw err;
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="taxonomy" />
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/cms/taxonomy">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to taxonomies
            </Link>
          </Button>
          <Stack direction="row" align="center" gap={2}>
            <Heading level={1}>{taxonomy.plural_name}</Heading>
            <Badge variant="outline">{taxonomy.hierarchical ? 'hierarchical' : 'flat'}</Badge>
            <code className="text-xs text-[var(--color-text-tertiary)]">{taxonomy.key}</code>
          </Stack>
          <Text variant="muted">
            {terms.length} term{terms.length === 1 ? '' : 's'} in this taxonomy.
          </Text>
        </Stack>

        <TermsManager taxonomyKey={key} hierarchical={taxonomy.hierarchical} terms={terms} />
      </Stack>
    </Container>
  );
}
