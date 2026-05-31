'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Container,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
  NativeSelect,
} from '@sparx/ui';

import { createCollectionAction } from '../../collection-actions';

// New-collection form. Type drives the next-step UX: manual collections
// land on the detail page so the merchant can add products; rules
// collections also land on detail but with the rule editor expanded.

export default function NewCollectionPage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [type, setType] = React.useState<'manual' | 'rules'>('manual');

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
      router.push(`/commerce/collections/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button color="primary" variant="link" size="sm" asChild>
            <Link href="/commerce/collections">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to collections
            </Link>
          </Button>
          <Heading level={1}>New collection</Heading>
          <Text variant="muted">
            Start with a name and a type. Manual collections let you hand-pick products; rules
            collections re-project membership when products or their tags change.
          </Text>
        </Stack>

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
                <Button type="button" variant="ghost" asChild>
                  <Link href="/commerce/collections">Cancel</Link>
                </Button>
                <Button type="submit" color="module" disabled={pending} loading={pending}>
                  Create collection
                </Button>
              </CardFooter>
            </Card>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
