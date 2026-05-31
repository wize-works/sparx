import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, Container, Heading, Stack, Text } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { SchemaEditor } from './schema-editor';

export const dynamic = 'force-dynamic';

interface ApiContentType {
  key: string;
  name: string;
  plural_name: string;
  description: string | null;
  url_pattern: string | null;
  is_singleton: boolean;
  is_built_in: boolean;
  schema_json: unknown;
}

interface PageParams {
  params: Promise<{ typeKey: string }>;
}

export default async function EditTypeSchemaPage({ params }: PageParams) {
  const { typeKey } = await params;

  let type: ApiContentType;
  try {
    type = await api.get<ApiContentType>(`/v1/content/types/${encodeURIComponent(typeKey)}`);
  } catch (err) {
    if ((err as ApiRestError).status === 404) notFound();
    throw err;
  }

  if (type.is_built_in) {
    return (
      <Container size="lg">
        <Stack gap={6} className="py-10">
          <Stack gap={2}>
            <Heading level={1}>{type.name}</Heading>
            <Badge variant="outline">built-in</Badge>
            <Text variant="muted">
              Built-in content types are read-only — their schema is part of the platform and is
              maintained in <code>packages/cms-schemas</code>. Fork it into a custom type to tailor
              it for your tenant.
            </Text>
          </Stack>
        </Stack>
      </Container>
    );
  }

  const schemaText = JSON.stringify(type.schema_json ?? { fields: [] }, null, 2);

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button color="primary" variant="link" size="sm" asChild>
            <Link href="/cms/types">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to content types
            </Link>
          </Button>
          <Heading level={1}>
            <code>{type.key}</code> schema
          </Heading>
          <Text variant="muted">
            Edit the field definitions. Saving validates the JSON against the FieldDef union; an
            invalid schema is rejected before persisting.
          </Text>
        </Stack>

        <SchemaEditor
          typeKey={type.key}
          initial={{
            name: type.name,
            pluralName: type.plural_name,
            description: type.description ?? '',
            urlPattern: type.url_pattern ?? '',
            isSingleton: type.is_singleton,
            schemaText,
          }}
        />
      </Stack>
    </Container>
  );
}
