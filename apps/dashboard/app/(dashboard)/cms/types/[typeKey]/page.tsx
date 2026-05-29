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
  Heading,
  Stack,
  Text,
} from '@sparx/ui';
import { FileText, Plus } from 'lucide-react';
import { api } from '@/lib/api-rest-client';
import { CmsTabs } from '../../_components/cms-tabs';

export const dynamic = 'force-dynamic';

interface ApiContentType {
  key: string;
  name: string;
  plural_name: string;
  url_pattern: string | null;
  is_singleton: boolean;
  description: string | null;
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
        <CmsTabs current="types" />
        <Stack direction="row" align="end" justify="between">
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <FileText className="h-5 w-5" />
              <Heading level={1}>{type.plural_name}</Heading>
              <Badge variant="module">teal active</Badge>
            </Stack>
            {type.description && <Text variant="muted">{type.description}</Text>}
          </Stack>
          {(!type.is_singleton || entries.length === 0) && (
            <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href={`/cms/types/${typeKey}/new`}>New {type.name.toLowerCase()}</Link>
            </Button>
          )}
        </Stack>

        {entries.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={`No ${type.plural_name.toLowerCase()} yet`}
              description={`Create your first ${type.name.toLowerCase()} to get started.`}
              action={
                <Button asChild>
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
                    <Badge variant={e.status === 'published' ? 'success' : 'outline'}>
                      {e.status}
                    </Badge>
                    <Text size="xs" variant="muted">
                      Updated {new Date(e.updated_at).toLocaleDateString()}
                    </Text>
                  </Stack>
                </CardContent>
                <CardFooter>
                  <Button variant="module-outline" size="sm" asChild>
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
