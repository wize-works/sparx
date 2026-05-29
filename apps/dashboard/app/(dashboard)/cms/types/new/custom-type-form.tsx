'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';
import { Plus } from 'lucide-react';
import { createContentType } from '../actions';

export function CustomTypeForm({ initialSchema }: { initialSchema: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [schemaText, setSchemaText] = React.useState(initialSchema);
  const [validationHint, setValidationHint] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(schemaText);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as { fields?: unknown }).fields)
      ) {
        setValidationHint('Schema must be a JSON object with a `fields` array.');
        return;
      }
      const count = (parsed as { fields: unknown[] }).fields.length;
      setValidationHint(`Looks good — ${count} field${count === 1 ? '' : 's'}.`);
    } catch {
      setValidationHint('JSON is malformed — fix syntax before saving.');
    }
  }, [schemaText]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    data.set('schema', schemaText);
    startTransition(async () => {
      const result = await createContentType(data);
      if (!result.ok) {
        setError(result.error ?? 'Could not create content type.');
        return;
      }
      router.push(`/cms/types/${result.data!.key}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={5}>
        <Card>
          <CardHeader>
            <Heading level={3}>Identity</Heading>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack direction="row" gap={3}>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="key">Key</Label>
                  <Input id="key" name="key" placeholder="case_study" required />
                  <Text size="xs" variant="muted">
                    Immutable URL-safe identifier (lowercase, underscores).
                  </Text>
                </Stack>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Case study" required />
                </Stack>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="plural_name">Plural</Label>
                  <Input id="plural_name" name="plural_name" placeholder="Case studies" required />
                </Stack>
              </Stack>
              <Stack gap={1}>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={2}
                  placeholder="Optional short note shown in the dashboard listing."
                />
              </Stack>
              <Stack direction="row" gap={3}>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="url_pattern">URL pattern (optional)</Label>
                  <Input id="url_pattern" name="url_pattern" placeholder="/case-studies/{slug}" />
                  <Text size="xs" variant="muted">
                    Leave blank for non-routable types (referenced from other entries).
                  </Text>
                </Stack>
                <Stack gap={1}>
                  <Label htmlFor="is_singleton">Singleton?</Label>
                  <Stack direction="row" align="center" gap={2}>
                    <input
                      id="is_singleton"
                      name="is_singleton"
                      type="checkbox"
                      className="h-5 w-5"
                    />
                    <Text size="xs" variant="muted">
                      Only one entry of this type can ever exist.
                    </Text>
                  </Stack>
                </Stack>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Heading level={3}>Schema</Heading>
            <CardDescription>
              JSON object with a <code>fields</code> array. Each field is one of: <code>text</code>,{' '}
              <code>long_text</code>, <code>rich_text</code>, <code>slug</code>, <code>number</code>
              , <code>boolean</code>, <code>date</code>, <code>datetime</code>, <code>enum</code>,{' '}
              <code>url</code>, <code>email</code>, <code>reference</code>, <code>asset</code>,{' '}
              <code>object</code>, <code>repeater</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={2}>
              <Textarea
                value={schemaText}
                onChange={(e) => setSchemaText(e.target.value)}
                rows={20}
                className="font-mono text-xs"
                aria-label="Schema JSON"
              />
              {validationHint && (
                <Text
                  size="xs"
                  variant={validationHint.startsWith('Looks good') ? 'muted' : 'danger'}
                  aria-live="polite"
                >
                  {validationHint}
                </Text>
              )}
            </Stack>
          </CardContent>
          <CardFooter>
            <Stack direction="row" align="center" gap={3}>
              <Button
                type="submit"
                variant="module"
                leftIcon={<Plus className="h-4 w-4" />}
                disabled={pending}
                loading={pending}
              >
                Create content type
              </Button>
              {error && (
                <Text size="sm" variant="danger" role="alert" aria-live="polite">
                  {error}
                </Text>
              )}
            </Stack>
          </CardFooter>
        </Card>
      </Stack>
    </form>
  );
}
