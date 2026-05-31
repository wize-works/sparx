// Per-type listing page — every entry of a given content type.
//
// Mirrors /cms (the page-only listing) for any other type. Title is derived
// from the entry body via `body.title || body.name || slug || id`.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Grid,
  PageHeader,
  Stack,
  Text,
} from '@sparx/ui';
// Stable per-type badge ("built-in" outline / "custom" default). Replaces the
// "teal active" placeholder that shipped from the scaffolding.
import { FileText, Plus } from 'lucide-react';
import { api } from '@/lib/api-rest-client';

export const dynamic = 'force-dynamic';

interface ApiContentType {
  key: string;
  name: string;
  plural_name: string;
  url_pattern: string | null;
  is_singleton: boolean;
  is_built_in: boolean;
  description: string | null;
  schema_json: { fields: unknown[] };
}

interface ApiEntry {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: Record<string, unknown> & { title?: string; name?: string };
  updated_at: string;
}

function entryTitle(e: ApiEntry): string {
  if (typeof e.body.title === 'string' && e.body.title) return e.body.title;
  if (typeof e.body.name === 'string' && e.body.name) return e.body.name;
  return e.slug ?? '(untitled)';
}

interface PageProps {
  params: Promise<{ typeKey: string }>;
}

export default async function TypeListPage({ params }: PageProps) {
  const { typeKey } = await params;

  let type: ApiContentType;
  try {
    type = await api.get<ApiContentType>(`/v1/content/types/${encodeURIComponent(typeKey)}`);
  } catch {
    notFound();
  }

  const entries = await api.get<ApiEntry[]>(
    `/v1/content/entries?type=${encodeURIComponent(typeKey)}&limit=100`
  );

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<FileText className="h-5 w-5" />}
          title={type.plural_name}
          badge={
            <Badge color={type.is_built_in ? 'outline' : 'default'}>
              {type.is_built_in ? 'built-in' : 'custom'}
            </Badge>
          }
          description={type.description ?? undefined}
          actions={
            (!type.is_singleton || entries.length === 0) && (
              <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
                <Link href={`/cms/types/${typeKey}/new`}>New {type.name.toLowerCase()}</Link>
              </Button>
            )
          }
        />

        {entries.length === 0 ? (
          <Card variant="module" padding="none">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={`No ${type.plural_name.toLowerCase()} yet`}
              description={`Create your first ${type.name.toLowerCase()} to get started.`}
              action={
                <Button asChild color="module">
                  <Link href={`/cms/types/${typeKey}/new`}>Create a {type.name.toLowerCase()}</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {entries.map((e) => (
              <Card key={e.id} variant="module">
                <CardHeader>
                  {e.slug && <CardDescription>/{e.slug}</CardDescription>}
                  <CardTitle>{entryTitle(e)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Stack direction="row" align="center" gap={2}>
                    <Badge color={e.status === 'published' ? 'success' : 'outline'}>
                      {e.status}
                    </Badge>
                    <Text size="xs" variant="muted">
                      Updated {new Date(e.updated_at).toLocaleDateString()}
                    </Text>
                  </Stack>
                </CardContent>
                <CardFooter>
                  <Button color="module" variant="outline" size="sm" asChild>
                    <Link href={`/cms/types/${typeKey}/${e.id}`}>Edit</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}
