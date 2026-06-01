import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, Heading, Stack, Text } from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { SchemaEditor } from './schema/schema-editor';

// Detail-view body for a content TYPE definition (the `@detail` drawer/modal,
// or the full-page route at /cms/types/[typeKey]/schema reuses SchemaEditor
// directly). Keyed by the type `key`. Custom types render the live editor
// (identity + schema JSON + delete) — this is where "edit a content type"
// lives now; built-in types are read-only (their schema is platform-owned).

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

export const dynamic = 'force-dynamic';

export async function ContentTypeDetailContent({ id }: { id: string }) {
  let type: ApiContentType;
  try {
    type = await api.get<ApiContentType>(`/v1/content/types/${encodeURIComponent(id)}`);
  } catch (err) {
    if ((err as ApiRestError).status === 404) notFound();
    throw err;
  }

  const schemaText = JSON.stringify(type.schema_json ?? { fields: [] }, null, 2);

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Stack direction="row" align="center" gap={3} wrap>
          <Heading level={1}>{type.name}</Heading>
          <Badge color={type.is_built_in ? 'outline' : 'module'}>
            {type.is_built_in ? 'built-in' : 'custom'}
          </Badge>
          {type.is_singleton && <Badge variant="outline">singleton</Badge>}
        </Stack>
        <Stack direction="row" align="center" gap={2} wrap>
          <Text size="sm" variant="muted">
            <code>{type.key}</code>
          </Text>
          {type.description && (
            <Text size="sm" variant="muted">
              · {type.description}
            </Text>
          )}
        </Stack>
        <div>
          <Button
            asChild
            variant="outline"
            size="sm"
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
          >
            <Link href={`/cms/types/${type.key}`}>View {type.plural_name.toLowerCase()}</Link>
          </Button>
        </div>
      </Stack>

      {type.is_built_in ? (
        <Card variant="module">
          <CardHeader>
            <Heading level={3}>Schema (read-only)</Heading>
          </CardHeader>
          <CardContent>
            <Stack gap={3}>
              <Text size="sm" variant="muted">
                Built-in types are maintained in <code>packages/cms-schemas</code>. Fork into a
                custom type to tailor it for your tenant.
              </Text>
              <pre className="overflow-auto rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3 font-mono text-xs">
                {schemaText}
              </pre>
            </Stack>
          </CardContent>
        </Card>
      ) : (
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
      )}
    </Stack>
  );
}
