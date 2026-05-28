'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
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
import { Trash2 } from 'lucide-react';
import { deletePage, setPageStatus, updatePage } from '../actions';

// EditableTenantPage holds the dashboard's plain-text view of a page entry.
// The server component in [id]/page.tsx unwraps the rich-text doc into the
// `content` string field for now (until the block editor lands in Phase 2).

export interface EditableTenantPage {
  id: string;
  slug: string;
  title: string;
  status: string;
  content: string;
  seoTitle: string | null;
  metaDescription: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
}

export function EditPageForm({ page }: { page: EditableTenantPage }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updatePage(page.id, formData);
      if (!result.ok) {
        setError(result.error ?? 'Could not save changes.');
        return;
      }
      setMessage('Saved.');
      router.refresh();
    });
  }

  function onTogglePublish() {
    setError(null);
    setMessage(null);
    const target = page.status === 'published' ? 'draft' : 'published';

    startTransition(async () => {
      const result = await setPageStatus(page.id, target);
      if (!result.ok) {
        setError(result.error ?? 'Could not update status.');
        return;
      }
      setMessage(target === 'published' ? 'Published.' : 'Reverted to draft.');
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${page.title}"? This cannot be undone.`)) return;
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await deletePage(page.id);
      if (!result.ok) {
        setError(result.error ?? 'Could not delete page.');
        return;
      }
      router.push('/cms');
      router.refresh();
    });
  }

  return (
    <Stack gap={6}>
      <Card>
        <CardHeader>
          <Stack direction="row" align="center" justify="between">
            <Stack direction="row" align="center" gap={2}>
              <Heading level={3}>Status</Heading>
              <Badge variant={page.status === 'published' ? 'success' : 'outline'}>
                {page.status}
              </Badge>
            </Stack>
            <Button
              variant={page.status === 'published' ? 'secondary' : 'module'}
              size="sm"
              onClick={onTogglePublish}
              disabled={pending}
            >
              {page.status === 'published' ? 'Unpublish' : 'Publish'}
            </Button>
          </Stack>
        </CardHeader>
        {page.publishedAt && (
          <CardContent>
            <Text size="sm" variant="muted">
              Last published {page.publishedAt.toLocaleString()}
            </Text>
          </CardContent>
        )}
      </Card>

      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardHeader>
            <Heading level={3}>Content</Heading>
            <CardDescription>Plain text for now — the rich editor lands in Phase 2.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack gap={2}>
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" defaultValue={page.title} required />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" name="slug" defaultValue={page.slug} required />
                <Text size="xs" variant="muted">
                  /{page.slug} is your storefront path.
                </Text>
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="content">Body</Label>
                <Textarea
                  id="content"
                  name="content"
                  rows={8}
                  defaultValue={page.content}
                />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="seoTitle">SEO title (optional)</Label>
                <Input
                  id="seoTitle"
                  name="seoTitle"
                  defaultValue={page.seoTitle ?? ''}
                  maxLength={60}
                />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="metaDescription">Meta description (optional)</Label>
                <Textarea
                  id="metaDescription"
                  name="metaDescription"
                  rows={3}
                  defaultValue={page.metaDescription ?? ''}
                  maxLength={160}
                />
              </Stack>

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
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              variant="ghost"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={onDelete}
              disabled={pending}
            >
              Delete
            </Button>
            <Button type="submit" variant="module" disabled={pending} loading={pending}>
              Save changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Stack>
  );
}
