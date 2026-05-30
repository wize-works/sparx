import { notFound } from 'next/navigation';
import { Badge, Heading, Stack, Text } from '@sparx/ui';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { TermsManager } from './terms-manager';

// Detail content for a CMS taxonomy. Mounted by both the full-page route
// and the dashboard shell's drawer / modal. The "id" passed in is the
// taxonomy `key` (e.g. 'category', 'tag'), not a UUID.

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

interface Props {
  /** Taxonomy `key` (e.g. 'category'). */
  id: string;
}

export async function TaxonomyDetailContent({ id: key }: Props) {
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
    <Stack gap={6}>
      <Stack gap={2}>
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
  );
}
