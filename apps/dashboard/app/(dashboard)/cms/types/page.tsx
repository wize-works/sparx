// Content type browser.
//
// Lists every content type the tenant can author, plus a count of entries
// per type. Built-ins (page, blog_post, module, feature, faq_item,
// editorial_section) are surfaced from api-rest's /v1/content/types; any
// custom merchant-defined types (Pro+ plan) appear here too. Clicking a row
// opens the type's detail (identity + schema editor for custom, read-only for
// built-in) in the drawer/modal per the user's defaultDetailView.

import {
  Badge,
  Card,
  CardContent,
  Container,
  EmptyState,
  PageHeader,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';
import { Database, Plus } from 'lucide-react';
import { api } from '@/lib/api-rest-client';
import { EntityCreateButton } from '../../_components/entity-create-button';
import { EntityRowLink } from '../../_components/entity-row-link';

export const dynamic = 'force-dynamic';

interface ApiContentType {
  key: string;
  name: string;
  plural_name: string;
  url_pattern: string | null;
  is_built_in: boolean;
  is_singleton: boolean;
  description: string | null;
}

interface ApiEntry {
  id: string;
  type_key: string;
}

export default async function ContentTypesPage() {
  const [types, entries] = await Promise.all([
    api.get<ApiContentType[]>('/v1/content/types'),
    api.get<ApiEntry[]>('/v1/content/entries?limit=250'),
  ]);

  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.type_key, (counts.get(e.type_key) ?? 0) + 1);

  // Pages have their own dedicated section; everything else lives here.
  const rows = types.filter((t) => t.key !== 'page');

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Database className="h-5 w-5" />}
          title="Content types"
          badge={<Badge variant="outline">{rows.length}</Badge>}
          description="Authoring spaces for blog posts, modules, FAQs, editorial sections, and any custom merchant type. Click a type to edit its schema; pages have their own dedicated tab."
          actions={
            <EntityCreateButton
              entityType="content-type"
              newHref="/cms/types/new"
              color="module"
              leftIcon={<Plus className="h-4 w-4" />}
            >
              New
            </EntityCreateButton>
          }
        />

        {rows.length === 0 ? (
          <Card variant="module" padding="none">
            <EmptyState
              icon={<Database className="h-5 w-5" />}
              title="No content types yet"
              description="Define a custom authoring shape — testimonials, case studies, events — with its own field schema."
              action={
                <EntityCreateButton
                  entityType="content-type"
                  newHref="/cms/types/new"
                  color="module"
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  New
                </EntityCreateButton>
              }
            />
          </Card>
        ) : (
          <Card variant="module" padding="none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>URL pattern</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => {
                    const count = counts.get(t.key) ?? 0;
                    return (
                      <TableRow key={t.key}>
                        <TableCell>
                          <Stack gap={1}>
                            <EntityRowLink
                              href={`/cms/types/${t.key}`}
                              entityType="content-type"
                              entityId={t.key}
                              className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                            >
                              {t.plural_name}
                            </EntityRowLink>
                            {t.description && (
                              <Text size="xs" variant="muted" className="line-clamp-1">
                                {t.description}
                              </Text>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" align="center" gap={2}>
                            <Badge color={t.is_built_in ? 'outline' : 'module'} className="text-xs">
                              {t.is_built_in ? 'built-in' : 'custom'}
                            </Badge>
                            {t.is_singleton && (
                              <Badge variant="outline" className="text-xs">
                                singleton
                              </Badge>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {t.url_pattern ? (
                            <Text size="xs" variant="muted" className="font-mono">
                              {t.url_pattern}
                            </Text>
                          ) : (
                            <Text size="xs" variant="muted">
                              —
                            </Text>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Text size="sm">{count}</Text>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
