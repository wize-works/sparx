import { notFound } from 'next/navigation';
import type { FieldDef } from '@sparx/cms-schemas';
import { Container, Heading, Stack, Text } from '@sparx/ui';
import { api } from '@/lib/api-rest-client';
import { CmsTabs } from '../../../_components/cms-tabs';
import { NewEntryForm } from './new-entry-form';

export const dynamic = 'force-dynamic';

interface ApiContentType {
  key: string;
  name: string;
  plural_name: string;
  url_pattern: string | null;
  is_singleton: boolean;
  description: string | null;
  schema: { fields: unknown[] };
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
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="types" />
        <Stack gap={1}>
          <Heading level={1}>New {type.name.toLowerCase()}</Heading>
          {type.description && <Text variant="muted">{type.description}</Text>}
        </Stack>
        <NewEntryForm
          typeKey={type.key}
          urlPattern={type.url_pattern}
          schema={type.schema as { fields: FieldDef[] }}
        />
      </Stack>
    </Container>
  );
}
