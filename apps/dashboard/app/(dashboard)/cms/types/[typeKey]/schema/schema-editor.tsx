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
import { Save, Trash2 } from 'lucide-react';
import { deleteContentType, updateContentType } from '../../actions';

export interface SchemaEditorInitial {
  name: string;
  pluralName: string;
  description: string;
  urlPattern: string;
  isSingleton: boolean;
  schemaText: string;
}

export function SchemaEditor({
  typeKey,
  initial,
}: {
  typeKey: string;
  initial: SchemaEditorInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [schemaText, setSchemaText] = React.useState(initial.schemaText);
  const [hint, setHint] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(schemaText);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as { fields?: unknown }).fields)
      ) {
        setHint('Schema must be a JSON object with a `fields` array.');
        return;
      }
      const count = (parsed as { fields: unknown[] }).fields.length;
      setHint(`Looks good — ${count} field${count === 1 ? '' : 's'}.`);
    } catch {
      setHint('JSON is malformed — fix syntax before saving.');
    }
  }, [schemaText]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const data = new FormData(e.currentTarget);
    data.set('schema', schemaText);
    startTransition(async () => {
      const result = await updateContentType(typeKey, data);
      if (!result.ok) {
        setError(result.error ?? 'Could not save schema.');
        return;
      }
      setMessage('Schema saved.');
      router.refresh();
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Delete the "${typeKey}" content type? This is rejected if any entries still use it.`
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteContentType(typeKey);
      if (!result.ok) {
        setError(result.error ?? 'Could not delete type.');
        return;
      }
      router.push('/cms/types');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={5}>
        <Card>
          <CardHeader>
            <Heading level={3}>Identity</Heading>
            <CardDescription>
              The key is immutable. Name and labels can change freely.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack direction="row" gap={3}>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={initial.name} required />
                </Stack>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="plural_name">Plural</Label>
                  <Input
                    id="plural_name"
                    name="plural_name"
                    defaultValue={initial.pluralName}
                    required
                  />
                </Stack>
              </Stack>
              <Stack gap={1}>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={initial.description}
                  rows={2}
                />
              </Stack>
              <Stack direction="row" gap={3}>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="url_pattern">URL pattern</Label>
                  <Input
                    id="url_pattern"
                    name="url_pattern"
                    defaultValue={initial.urlPattern}
                    placeholder="/case-studies/{slug}"
                  />
                </Stack>
                <Stack gap={1}>
                  <Label htmlFor="is_singleton">Singleton</Label>
                  <input
                    id="is_singleton"
                    name="is_singleton"
                    type="checkbox"
                    defaultChecked={initial.isSingleton}
                    className="h-5 w-5"
                  />
                </Stack>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Heading level={3}>Schema JSON</Heading>
            <CardDescription>
              Same FieldDef union the platform validators use. Saving an invalid schema gets
              rejected with the validation error.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={2}>
              <Textarea
                value={schemaText}
                onChange={(e) => setSchemaText(e.target.value)}
                rows={24}
                className="font-mono text-xs"
                aria-label="Schema JSON"
              />
              {hint && (
                <Text
                  size="xs"
                  variant={hint.startsWith('Looks good') ? 'muted' : 'danger'}
                  aria-live="polite"
                >
                  {hint}
                </Text>
              )}
            </Stack>
          </CardContent>
          <CardFooter>
            <Stack direction="row" align="center" gap={3}>
              <Button
                type="submit"
                variant="module"
                leftIcon={<Save className="h-4 w-4" />}
                disabled={pending}
                loading={pending}
              >
                Save schema
              </Button>
              <Button
                type="button"
                variant="ghost"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={onDelete}
                disabled={pending}
              >
                Delete type
              </Button>
              {error && (
                <Text size="sm" variant="danger" role="alert" aria-live="polite">
                  {error}
                </Text>
              )}
              {message && (
                <Text size="sm" variant="success" aria-live="polite">
                  {message}
                </Text>
              )}
            </Stack>
          </CardFooter>
        </Card>
      </Stack>
    </form>
  );
}
