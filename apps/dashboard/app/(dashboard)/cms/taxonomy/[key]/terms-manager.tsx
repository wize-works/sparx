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
import { Plus, Trash2 } from 'lucide-react';
import { createTerm, deleteTerm } from '../actions';

export interface Term {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_term_id: string | null;
}

export function TermsManager({
  taxonomyKey,
  hierarchical,
  terms,
}: {
  taxonomyKey: string;
  hierarchical: boolean;
  terms: Term[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await createTerm(taxonomyKey, data);
      if (!result.ok) {
        setError(result.error ?? 'Could not create term.');
        return;
      }
      form.reset();
      setMessage('Term created.');
      router.refresh();
    });
  }

  function onDelete(id: string, name: string) {
    if (!confirm(`Delete term "${name}"? Entries tagged with it will be untagged.`)) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteTerm(taxonomyKey, id);
      if (!result.ok) {
        setError(result.error ?? 'Could not delete term.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <Stack gap={5}>
      <Card>
        <CardHeader>
          <Heading level={3}>Add term</Heading>
          <CardDescription>Slug auto-derives from the name when blank.</CardDescription>
        </CardHeader>
        <form onSubmit={onCreate}>
          <CardContent>
            <Stack gap={4}>
              <Stack direction="row" gap={3}>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required />
                </Stack>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="slug">Slug (optional)</Label>
                  <Input id="slug" name="slug" />
                </Stack>
                {hierarchical && (
                  <Stack gap={1} className="flex-1">
                    <Label htmlFor="parent_term_id">Parent</Label>
                    <select
                      id="parent_term_id"
                      name="parent_term_id"
                      defaultValue=""
                      className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm"
                    >
                      <option value="">— (top level)</option>
                      {terms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Stack>
                )}
              </Stack>
              <Stack gap={1}>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" rows={2} />
              </Stack>
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
                Add term
              </Button>
              {error && (
                <Text size="sm" variant="danger" role="alert">
                  {error}
                </Text>
              )}
              {message && (
                <Text size="sm" variant="success">
                  {message}
                </Text>
              )}
            </Stack>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <Heading level={3}>Terms</Heading>
        </CardHeader>
        <CardContent>
          {terms.length === 0 ? (
            <Text variant="muted">No terms yet.</Text>
          ) : (
            <Stack gap={2}>
              {terms.map((t) => (
                <Stack
                  key={t.id}
                  direction="row"
                  align="center"
                  justify="between"
                  className="rounded-md border border-[var(--color-border-default)] px-3 py-2"
                >
                  <Stack gap={0}>
                    <Text size="sm">{t.name}</Text>
                    <Text size="xs" variant="muted">
                      <code>{t.slug}</code>
                      {t.parent_term_id ? ` · parent ${t.parent_term_id.slice(0, 8)}` : ''}
                      {t.description ? ` · ${t.description.slice(0, 60)}` : ''}
                    </Text>
                  </Stack>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    leftIcon={<Trash2 className="h-3 w-3" />}
                    onClick={() => onDelete(t.id, t.name)}
                    disabled={pending}
                  >
                    Remove
                  </Button>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
