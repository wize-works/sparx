import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  PageHeader,
  Stack,
  Text,
} from '@sparx/ui';
import { Pencil, Tag } from 'lucide-react';
import { api } from '@/lib/api-rest-client';
import { EntityRowLink } from '../../_components/entity-row-link';
import { TaxonomyCreateForm } from './taxonomy-create-form';

export const dynamic = 'force-dynamic';

interface ApiTaxonomy {
  id: string;
  key: string;
  name: string;
  plural_name: string;
  hierarchical: boolean;
  term_count: number;
}

export default async function TaxonomyIndexPage() {
  const taxonomies = await api.get<ApiTaxonomy[]>('/v1/taxonomies');

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Tag className="h-5 w-5" />}
          title="Taxonomies"
          badge={<Badge variant="outline">{taxonomies.length}</Badge>}
          description="Tenant-defined vocabularies. Mark hierarchical to allow parent/child term nesting (good for categories); leave flat for tag-style lists."
        />

        <TaxonomyCreateForm />

        <Card variant="module">
          <CardHeader>
            <Heading level={3}>Existing taxonomies</Heading>
          </CardHeader>
          <CardContent>
            {taxonomies.length === 0 ? (
              <EmptyState
                icon={<Tag className="h-5 w-5" />}
                title="No taxonomies yet"
                description="Add your first taxonomy above. Tags and categories group entries on storefront index pages and feeds."
              />
            ) : (
              <Stack gap={2}>
                {taxonomies.map((t) => (
                  <Stack
                    key={t.id}
                    direction="row"
                    align="center"
                    justify="between"
                    className="rounded-md border border-[var(--color-border-default)] px-3 py-2"
                  >
                    <Stack gap={0}>
                      <Stack direction="row" align="center" gap={2}>
                        <Text size="sm">{t.name}</Text>
                        <Badge variant="outline">{t.hierarchical ? 'hierarchical' : 'flat'}</Badge>
                      </Stack>
                      <Text size="xs" variant="muted">
                        <code>{t.key}</code> · {t.term_count} term{t.term_count === 1 ? '' : 's'}
                      </Text>
                    </Stack>
                    <Button
                      asChild
                      variant="ghost"
                      size="xs"
                      leftIcon={<Pencil className="h-3 w-3" />}
                    >
                      <EntityRowLink
                        href={`/cms/taxonomy/${t.key}`}
                        entityType="taxonomy"
                        entityId={t.key}
                      >
                        Manage terms
                      </EntityRowLink>
                    </Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
