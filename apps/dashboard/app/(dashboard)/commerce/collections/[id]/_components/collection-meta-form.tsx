'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

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

import { updateCollectionAction } from '../../../collection-actions';

interface Props {
  collectionId: string;
  name: string;
  handle: string;
  description: string | null;
  featured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
}

// Metadata tab for a collection — name, handle, description, featured
// flag, SEO. Type is intentionally not editable here (the service refuses
// type flips because they're destructive of opposite-mode data).

export function CollectionMetaForm({
  collectionId,
  name,
  handle,
  description,
  featured,
  seoTitle,
  seoDescription,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: stringField(form.get('name')).trim(),
      handle: stringField(form.get('handle')).trim(),
      description: stringOrNull(form.get('description')),
      featured: form.get('featured') === 'on',
      seoTitle: stringOrNull(form.get('seoTitle')),
      seoDescription: stringOrNull(form.get('seoDescription')),
    };

    startTransition(async () => {
      const result = await updateCollectionAction(collectionId, payload);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <Heading level={3}>Metadata</Heading>
          <CardDescription>
            Name, slug, description, and SEO. Type changes aren&apos;t supported — delete and
            recreate if you need to switch between manual and rules-driven.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            <Stack direction="row" gap={4}>
              <Stack gap={2} className="flex-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" defaultValue={name} required />
              </Stack>
              <Stack gap={2} className="flex-1">
                <Label htmlFor="handle">Handle</Label>
                <Input id="handle" name="handle" defaultValue={handle} />
              </Stack>
            </Stack>
            <Stack gap={2}>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={description ?? ''}
              />
            </Stack>
            <Stack direction="row" align="center" gap={2}>
              <input
                type="checkbox"
                id="featured"
                name="featured"
                defaultChecked={featured}
                className="h-4 w-4"
              />
              <Label htmlFor="featured">Featured</Label>
            </Stack>

            <Stack gap={2} className="border-t border-[var(--color-border-default)] pt-4">
              <Heading level={4}>SEO</Heading>
              <Stack gap={2}>
                <Label htmlFor="seoTitle">Page title</Label>
                <Input id="seoTitle" name="seoTitle" defaultValue={seoTitle ?? ''} />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="seoDescription">Meta description</Label>
                <Textarea
                  id="seoDescription"
                  name="seoDescription"
                  rows={3}
                  defaultValue={seoDescription ?? ''}
                />
              </Stack>
            </Stack>
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
          {savedAt !== null && (
            <Stack
              direction="row"
              align="center"
              gap={1}
              className="text-[var(--color-text-success)]"
            >
              <Check className="h-4 w-4" />
              <Text size="sm">Saved</Text>
            </Stack>
          )}
          <Button type="submit" color="module" disabled={pending} loading={pending}>
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stringOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
