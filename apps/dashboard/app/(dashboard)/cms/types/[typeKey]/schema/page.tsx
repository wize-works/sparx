import { notFound } from 'next/navigation';
import { Badge, Container, PageHeader, Stack } from '@sparx/ui';

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
          <PageHeader
            title={type.name}
            badge={<Badge variant="outline">built-in</Badge>}
            description={
              <>
                Built-in content types are read-only — their schema is part of the platform and is
                maintained in <code>packages/cms-schemas</code>. Fork it into a custom type to
                tailor it for your tenant.
              </>
            }
          />
        </Stack>
      </Container>
    );
  }

  const schemaText = JSON.stringify(type.schema_json ?? { fields: [] }, null, 2);

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <PageHeader
          title={
            <>
              <code>{type.key}</code> schema
            </>
          }
          description="Edit the field definitions. Saving validates the JSON against the FieldDef union; an invalid schema is rejected before persisting."
        />

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
