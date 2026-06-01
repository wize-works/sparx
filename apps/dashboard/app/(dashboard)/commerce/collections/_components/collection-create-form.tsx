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
  Heading,
  Input,
  Label,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { createCollectionAction } from '../../collection-actions';

// New-collection form, surface-aware (§13.1). The SAME component renders:
//   - `surface="page"`   inside the /new route's Container + PageHeader
//   - `surface="overlay"` inside the `@detail` drawer/modal chrome
//
// Only the framing (internal heading, Cancel target) and the post-create
// transition differ by surface; the fields are identical. On success the
// overlay swaps to the new record's detail view (create flows into view); the
// page pushes to the record.

interface CollectionCreateFormProps {
  surface: 'page' | 'overlay';
}

export function CollectionCreateForm({ surface }: CollectionCreateFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [type, setType] = React.useState<'manual' | 'rules'>('manual');

  // After create: in an overlay, transition the token to the new record's
  // detail (preserving drawer vs modal); on a page, navigate to it.
  function onCreated(id: string) {
    if (surface === 'overlay') {
      const next = new URLSearchParams(searchParams ?? '');
      const mode = next.has('modal') ? 'modal' : 'drawer';
      next.delete('drawer');
      next.delete('modal');
      next.set(mode, `collection:${id}`);
      router.replace(`${pathname ?? '/'}?${next.toString()}`);
      router.refresh();
      return;
    }
    router.push(`/commerce/collections/${id}`);
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
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const name = stringField(form.get('name')).trim();
    const handle = stringField(form.get('handle')).trim();
    const description = stringField(form.get('description')).trim();
    const featured = form.get('featured') === 'on';
    const match = stringField(form.get('match'), 'all');
    const tagValue = stringField(form.get('seedTag')).trim();

    if (!name) {
      setFieldErrors({ name: 'Name is required.' });
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      ...(handle ? { handle } : {}),
      ...(description ? { description } : {}),
      type,
      featured,
    };

    if (type === 'rules') {
      if (!tagValue) {
        setFieldErrors({ seedTag: 'Provide at least one tag to seed the rule.' });
        return;
      }
      payload.ruleSet = {
        match,
        predicates: [{ field: 'tag', op: 'equals', value: tagValue }],
      };
    }

    startTransition(async () => {
      const result = await createCollectionAction(payload);
      if (!result.ok) {
        if (result.error.code === 'VALIDATION_ERROR' && result.error.details?.length) {
          const fe: Record<string, string> = {};
          for (const d of result.error.details) fe[d.field] = d.message;
          setFieldErrors(fe);
        }
        setError(result.error.message);
        return;
      }
      onCreated(result.data.id);
    });
  }

  return (
    <Stack gap={6}>
      {surface === 'overlay' && (
        <Stack gap={1}>
          <Heading level={2}>New collection</Heading>
          <Text size="sm" variant="muted">
            Start with a name and a type. Manual collections let you hand-pick products; rules
            collections re-project membership when products or their tags change.
          </Text>
        </Stack>
      )}

      <form onSubmit={onSubmit} noValidate>
        <Stack gap={4}>
          <Card>
            <CardHeader>
              <Heading level={3}>Basics</Heading>
              <CardDescription>Name, slug, description.</CardDescription>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack gap={2}>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    placeholder="Featured, New for Spring, Diesel specials…"
                  />
                  {fieldErrors.name && (
                    <Text size="xs" variant="danger">
                      {fieldErrors.name}
                    </Text>
                  )}
                </Stack>
                <Stack gap={2}>
                  <Label htmlFor="handle">Handle (optional)</Label>
                  <Input id="handle" name="handle" placeholder="auto-derived from the name" />
                </Stack>
                <Stack gap={2}>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={3} />
                </Stack>
                <Stack direction="row" align="center" gap={2}>
                  <input type="checkbox" id="featured" name="featured" className="h-4 w-4" />
                  <Label htmlFor="featured">Featured</Label>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Heading level={3}>Type</Heading>
              <CardDescription>How is membership decided?</CardDescription>
            </CardHeader>
            <CardContent>
              <Stack gap={3}>
                <Stack direction="row" align="center" gap={2}>
                  <input
                    type="radio"
                    id="type-manual"
                    name="type"
                    value="manual"
                    checked={type === 'manual'}
                    onChange={() => setType('manual')}
                    className="h-4 w-4"
                  />
                  <Stack gap={0}>
                    <Label htmlFor="type-manual">Manual</Label>
                    <Text size="xs" variant="muted">
                      Add products by hand on the detail page.
                    </Text>
                  </Stack>
                </Stack>
                <Stack direction="row" align="center" gap={2}>
                  <input
                    type="radio"
                    id="type-rules"
                    name="type"
                    value="rules"
                    checked={type === 'rules'}
                    onChange={() => setType('rules')}
                    className="h-4 w-4"
                  />
                  <Stack gap={0}>
                    <Label htmlFor="type-rules">Rules-driven</Label>
                    <Text size="xs" variant="muted">
                      Membership re-projected on the next index flush.
                    </Text>
                  </Stack>
                </Stack>

                {type === 'rules' && (
                  <Stack
                    gap={3}
                    className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3"
                  >
                    <Stack gap={2}>
                      <Label htmlFor="match">Match mode</Label>
                      <NativeSelect id="match" name="match" defaultValue="all">
                        <option value="all">Match all (AND)</option>
                        <option value="any">Match any (OR)</option>
                      </NativeSelect>
                    </Stack>
                    <Stack gap={2}>
                      <Label htmlFor="seedTag">Seed predicate — tag equals</Label>
                      <Input id="seedTag" name="seedTag" placeholder="bestseller" />
                      <Text size="xs" variant="muted">
                        Phase 1.3 seeds a single tag predicate. The full rule editor lands on the
                        detail page in Phase 1.5 (vendor / product_type / price / fitment).
                      </Text>
                      {fieldErrors.seedTag && (
                        <Text size="xs" variant="danger">
                          {fieldErrors.seedTag}
                        </Text>
                      )}
                    </Stack>
                  </Stack>
                )}
              </Stack>
            </CardContent>
            {error && (
              <CardContent>
                <Text size="sm" variant="danger" role="alert" aria-live="polite">
                  {error}
                </Text>
              </CardContent>
            )}
            <CardFooter>
              {surface === 'overlay' ? (
                <Button type="button" variant="ghost" onClick={closeOverlay}>
                  Cancel
                </Button>
              ) : (
                <Button type="button" variant="ghost" asChild>
                  <Link href="/commerce/collections">Cancel</Link>
                </Button>
              )}
              <Button type="submit" color="module" disabled={pending} loading={pending}>
                Create collection
              </Button>
            </CardFooter>
          </Card>
        </Stack>
      </form>
    </Stack>
  );
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
