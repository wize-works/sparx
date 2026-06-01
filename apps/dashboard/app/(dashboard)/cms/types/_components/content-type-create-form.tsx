'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
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
} from '@sparx/ui';
import { Plus } from 'lucide-react';

import { createContentType } from '../actions';

// Surface-aware create form for a content TYPE definition (§13.1). The SAME
// component renders inside the /cms/types/new route (`surface="page"`) and
// inside the `@detail` drawer/modal (`surface="overlay"`). On success the
// overlay swaps to the new type's detail (create flows into the editor); the
// page navigates to the type.

const SAMPLE_SCHEMA = JSON.stringify(
  {
    fields: [
      { key: 'title', type: 'text', label: 'Title', required: true, max: 200 },
      { key: 'slug', type: 'slug', label: 'Slug', sourceField: 'title' },
      { key: 'summary', type: 'long_text', label: 'Summary', max: 480 },
      { key: 'body', type: 'rich_text', label: 'Body', required: true },
      { key: 'heroImage', type: 'asset', label: 'Hero image', accept: ['image/*'] },
    ],
  },
  null,
  2
);

interface ContentTypeCreateFormProps {
  surface: 'page' | 'overlay';
  initialSchema?: string;
}

export function ContentTypeCreateForm({
  surface,
  initialSchema = SAMPLE_SCHEMA,
}: ContentTypeCreateFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [schemaText, setSchemaText] = React.useState(initialSchema);
  const [isSingleton, setIsSingleton] = React.useState(false);
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

  function onCreated(key: string) {
    if (surface === 'overlay') {
      const next = new URLSearchParams(searchParams ?? '');
      const mode = next.has('modal') ? 'modal' : 'drawer';
      next.delete('drawer');
      next.delete('modal');
      next.set(mode, `content-type:${key}`);
      router.replace(`${pathname ?? '/'}?${next.toString()}`);
      router.refresh();
      return;
    }
    router.push(`/cms/types/${key}`);
    router.refresh();
  }

  function closeOverlay() {
    const next = new URLSearchParams(searchParams ?? '');
    next.delete('drawer');
    next.delete('modal');
    const qs = next.toString();
    router.replace(qs ? `${pathname ?? '/'}?${qs}` : (pathname ?? '/'));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    data.set('schema', schemaText);
    // <Checkbox> writes to React state, not native FormData — inject before
    // the server action reads.
    if (isSingleton) data.set('is_singleton', 'on');
    else data.delete('is_singleton');
    startTransition(async () => {
      const result = await createContentType(data);
      if (!result.ok) {
        setError(result.error ?? 'Could not create content type.');
        return;
      }
      onCreated(result.data!.key);
    });
  }

  return (
    <Stack gap={6}>
      {surface === 'overlay' && (
        <Stack gap={1}>
          <Heading level={2}>New content type</Heading>
          <Text size="sm" variant="muted">
            Define a tenant-specific authoring shape — testimonials, case studies, events, anything.
            The schema validates against the same FieldDef union the platform uses for built-ins.
          </Text>
        </Stack>
      )}

      <form onSubmit={onSubmit} noValidate>
        <Stack gap={5}>
          <Card variant="module">
            <CardHeader>
              <Heading level={3}>Identity</Heading>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack direction="row" gap={3}>
                  <Stack gap={1} className="flex-1">
                    <Label htmlFor="key" required>
                      Key
                    </Label>
                    <Input id="key" name="key" placeholder="case_study" required aria-required />
                    <Text size="xs" variant="muted">
                      Immutable URL-safe identifier (lowercase, underscores).
                    </Text>
                  </Stack>
                  <Stack gap={1} className="flex-1">
                    <Label htmlFor="name" required>
                      Name
                    </Label>
                    <Input id="name" name="name" placeholder="Case study" required aria-required />
                  </Stack>
                  <Stack gap={1} className="flex-1">
                    <Label htmlFor="plural_name" required>
                      Plural
                    </Label>
                    <Input
                      id="plural_name"
                      name="plural_name"
                      placeholder="Case studies"
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
                      <Checkbox
                        id="is_singleton"
                        checked={isSingleton}
                        onCheckedChange={(next) => setIsSingleton(next === true)}
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

          <Card variant="module">
            <CardHeader>
              <Heading level={3}>Schema</Heading>
              <CardDescription>
                JSON object with a <code>fields</code> array. Each field is one of:{' '}
                <code>text</code>, <code>long_text</code>, <code>rich_text</code>, <code>slug</code>
                , <code>number</code>, <code>boolean</code>, <code>date</code>,{' '}
                <code>datetime</code>, <code>enum</code>, <code>url</code>, <code>email</code>,{' '}
                <code>reference</code>, <code>asset</code>, <code>object</code>,{' '}
                <code>repeater</code>.
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
                {surface === 'overlay' ? (
                  <Button type="button" variant="ghost" onClick={closeOverlay}>
                    Cancel
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" asChild>
                    <Link href="/cms/types">Cancel</Link>
                  </Button>
                )}
                <Button
                  type="submit"
                  color="module"
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
    </Stack>
  );
}
