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
  Stack,
  Text,
} from '@sparx/ui';
import { ContentBlockEditor, EMPTY_DOC, type CmsDoc } from '@sparx/cms-editor';

import { createPage } from '../actions';

// New-page form, surface-aware (§13.1). The SAME component renders:
//   - `surface="page"`   inside the /cms/new route's Container + PageHeader
//   - `surface="overlay"` inside the `@detail` drawer/modal chrome
//
// Only the framing (internal heading, Cancel target) and the post-create
// transition differ by surface; the fields are identical. On success the
// overlay swaps to the new record's detail view (create flows into view); the
// page pushes to the record.

interface PageCreateFormProps {
  surface: 'page' | 'overlay';
}

export function PageCreateForm({ surface }: PageCreateFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [doc, setDoc] = React.useState<CmsDoc>(EMPTY_DOC);

  // After create: in an overlay, transition the token to the new record's
  // detail (preserving drawer vs modal); on a page, navigate to it.
  function onCreated(id: string) {
    if (surface === 'overlay') {
      const next = new URLSearchParams(searchParams ?? '');
      const mode = next.has('modal') ? 'modal' : 'drawer';
      next.delete('drawer');
      next.delete('modal');
      next.set(mode, `page:${id}`);
      router.replace(`${pathname ?? '/'}?${next.toString()}`);
      router.refresh();
      return;
    }
    router.push(`/cms/${id}`);
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
    const formData = new FormData(e.currentTarget);
    formData.set('content', JSON.stringify(doc));

    startTransition(async () => {
      const result = await createPage(formData);
      if (!result.ok || !result.data) {
        setError(result.error ?? 'Could not create page.');
        return;
      }
      onCreated(result.data.id);
    });
  }

  return (
    <Stack gap={6}>
      {surface === 'overlay' && (
        <Stack gap={1}>
          <Heading level={2}>New page</Heading>
          <Text size="sm" variant="muted">
            Saves as a draft. Publish from the editor once the content is ready — nothing goes live
            until you say so.
          </Text>
        </Stack>
      )}

      <form onSubmit={onSubmit} noValidate>
        <Card variant="module">
          <CardHeader>
            <Heading level={3}>Page basics</Heading>
            <CardDescription>You can edit everything after creation.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack gap={2}>
                <Label htmlFor="title" required>
                  Title
                </Label>
                <Input id="title" name="title" required aria-required />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="slug">Slug (optional)</Label>
                <Input id="slug" name="slug" placeholder="auto-derived from title" />
                <Text size="xs" variant="muted">
                  Lowercase letters, numbers, and dashes only.
                </Text>
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="page-body-editor">Content (optional)</Label>
                <ContentBlockEditor
                  id="page-body-editor"
                  value={doc}
                  onChange={setDoc}
                  placeholder="Write the initial body. You can always edit after creation."
                  ariaLabel="Page body editor"
                />
              </Stack>

              {error && (
                <Text size="sm" variant="danger" role="alert" aria-live="polite">
                  {error}
                </Text>
              )}
            </Stack>
          </CardContent>
          <CardFooter>
            {surface === 'overlay' ? (
              <Button type="button" variant="ghost" onClick={closeOverlay}>
                Cancel
              </Button>
            ) : (
              <Button type="button" variant="ghost" asChild>
                <Link href="/cms/pages">Cancel</Link>
              </Button>
            )}
            <Button type="submit" color="module" disabled={pending} loading={pending}>
              Create draft
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Stack>
  );
}
