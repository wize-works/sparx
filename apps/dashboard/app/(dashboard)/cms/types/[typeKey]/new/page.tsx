import { notFound } from 'next/navigation';
import type { FieldDef } from '@sparx/cms-schemas';
import { Container, PageHeader, Stack } from '@sparx/ui';
import { api } from '@/lib/api-rest-client';
import { NewEntryForm } from './new-entry-form';

export const dynamic = 'force-dynamic';

interface ApiContentType {
  key: string;
  name: string;
  plural_name: string;
  url_pattern: string | null;
  is_singleton: boolean;
  description: string | null;
  schema_json: { fields: unknown[] };
}

interface PageProps {
  params: Promise<{ typeKey: string }>;
}

export default async function NewEntryPage({ params }: PageProps) {
  const { typeKey } = await params;
  let type: ApiContentType;
  try {
    type = await api.get<ApiContentType>(`/v1/content/types/${encodeURIComponent(typeKey)}`);
  } catch {
    notFound();
  }

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title={`New ${type.name.toLowerCase()}`}
          description={type.description ?? undefined}
        />
        <NewEntryForm
          typeKey={type.key}
          urlPattern={type.url_pattern}
          schema={type.schema_json as { fields: FieldDef[] }}
        />
      </Stack>
    </Container>
  );
}
