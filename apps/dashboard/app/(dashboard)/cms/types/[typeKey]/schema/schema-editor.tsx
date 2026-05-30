'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Checkbox,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
  toast,
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
  const [schemaText, setSchemaText] = React.useState(initial.schemaText);
  const [isSingleton, setIsSingleton] = React.useState(initial.isSingleton);
  const [hint, setHint] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

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
    const data = new FormData(e.currentTarget);
    data.set('schema', schemaText);
    // <Checkbox> writes to React state, not native FormData — inject value
    // before the server action reads.
    if (isSingleton) data.set('is_singleton', 'on');
    else data.delete('is_singleton');
    startTransition(async () => {
      const result = await updateContentType(typeKey, data);
      if (!result.ok) {
        setError(result.error ?? 'Could not save schema.');
        return;
      }
      toast.success('Schema saved.');
      router.refresh();
    });
  }

  function executeDelete() {
    setConfirmDelete(false);
    setError(null);
    startTransition(async () => {
      const result = await deleteContentType(typeKey);
      if (!result.ok) {
        setError(result.error ?? 'Could not delete type.');
        return;
      }
      toast.success(`Deleted content type "${typeKey}".`);
      router.push('/cms/types');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={5}>
        <Card variant="module">
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
                  <Label htmlFor="name" required>
                    Name
                  </Label>
                  <Input id="name" name="name" defaultValue={initial.name} required aria-required />
                </Stack>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="plural_name" required>
                    Plural
                  </Label>
                  <Input
                    id="plural_name"
                    name="plural_name"
                    defaultValue={initial.pluralName}
                    required
                    aria-required
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
                  <Stack direction="row" align="center" gap={2}>
                    <Checkbox
                      id="is_singleton"
                      checked={isSingleton}
                      onCheckedChange={(next) => setIsSingleton(next === true)}
                    />
                    <Text size="xs" variant="muted">
                      Only one entry can exist.
                    </Text>
                  </Stack>
                </Stack>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="module">
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
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
              >
                Delete type
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the &ldquo;{typeKey}&rdquo; content type?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the schema definition. If any entries still use this type the API will
              reject the deletion — you&apos;ll need to archive those entries first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete}>Delete type</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
