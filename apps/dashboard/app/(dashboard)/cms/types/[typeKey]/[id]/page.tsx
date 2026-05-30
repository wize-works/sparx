import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { FieldDef } from '@sparx/cms-schemas';
import { Badge, Button, Container, Heading, Stack, Text } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api-rest-client';
import { CmsTabs } from '../../../_components/cms-tabs';
import { EditEntryForm } from './edit-entry-form';

export const dynamic = 'force-dynamic';

interface ApiContentType {
  key: string;
  name: string;
  plural_name: string;
  url_pattern: string | null;
  schema_json: { fields: unknown[] };
}

interface ApiEntry {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: Record<string, unknown>;
  seo: Record<string, unknown>;
  published_at: string | null;
  updated_at: string;
}

interface PageProps {
  params: Promise<{ typeKey: string; id: string }>;
}

export default async function EditEntryPage({ params }: PageProps) {
  const { typeKey, id } = await params;

  let type: ApiContentType;
  let entry: ApiEntry;
  try {
    [type, entry] = await Promise.all([
      api.get<ApiContentType>(`/v1/content/types/${encodeURIComponent(typeKey)}`),
      api.get<ApiEntry>(`/v1/content/entries/${id}`),
    ]);
  } catch {
    notFound();
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="types" />
        <Stack direction="row" align="end" justify="between">
          <Stack gap={2}>
            <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-3 w-3" />}>
              <Link href={`/cms/types/${typeKey}`}>Back to {type.plural_name.toLowerCase()}</Link>
            </Button>
            <Heading level={1}>Edit {type.name.toLowerCase()}</Heading>
            <Stack direction="row" align="center" gap={2}>
              <Badge variant={entry.status === 'published' ? 'success' : 'outline'}>
                {entry.status}
              </Badge>
              {entry.slug && (
                <Text size="xs" variant="muted">
                  /{entry.slug}
                </Text>
              )}
            </Stack>
          </Stack>
        </Stack>
        <EditEntryForm
          id={entry.id}
          typeKey={type.key}
          urlPattern={type.url_pattern}
          schema={type.schema_json as { fields: FieldDef[] }}
          initialBody={entry.body}
          initialStatus={entry.status}
        />
      </Stack>
    </Container>
  );
}
