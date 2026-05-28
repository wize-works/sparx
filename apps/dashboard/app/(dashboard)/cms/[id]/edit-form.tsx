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
} from '@sparx/ui';
import { ContentBlockEditor, EMPTY_DOC, type CmsDoc } from '@sparx/cms-editor';
import Link from 'next/link';
import { History, Trash2 } from 'lucide-react';
import { deletePage, setPageStatus, updatePage } from '../actions';
import { SeoPanel, type SeoFields } from './seo-panel';
import { PreviewButton } from './preview-button';

// EditableTenantPage holds the dashboard's view of a page entry, with
// `body` as a TipTap doc (JSON) so the block editor can round-trip it
// without losing formatting on save.

export interface EditableTenantPage {
  id: string;
  typeKey: string;
  slug: string;
  title: string;
  status: string;
  body: CmsDoc;
  seo: SeoFields;
  publishedAt: Date | null;
  updatedAt: Date;
}

const PREVIEW_ORIGIN = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://sparx.works';

export function EditPageForm({ page }: { page: EditableTenantPage }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [doc, setDoc] = React.useState<CmsDoc>(page.body ?? EMPTY_DOC);
  const [title, setTitle] = React.useState(page.title);
  const [slug, setSlug] = React.useState(page.slug);
  const [seo, setSeo] = React.useState<SeoFields>(page.seo);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    formData.set('content', JSON.stringify(doc));
    // SEO fields are component-state, not form-controlled, so write them
    // through explicitly. Empty strings become "unset" on the server side.
    formData.set('seoTitle', seo.title);
    formData.set('metaDescription', seo.description);
    formData.set('canonical', seo.canonical);
    formData.set('robots', seo.robots);
    formData.set('ogImage', seo.ogImage);

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
    <form onSubmit={onSubmit} noValidate>
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
              <Stack direction="row" align="center" gap={2}>
                <PreviewButton entryId={page.id} slug={page.slug} typeKey={page.typeKey} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  asChild
                  leftIcon={<History className="h-3.5 w-3.5" />}
                >
                  <Link href={`/cms/${page.id}/revisions`}>Revisions</Link>
                </Button>
                <Button
                  type="button"
                  variant={page.status === 'published' ? 'secondary' : 'module'}
                  size="sm"
                  onClick={onTogglePublish}
                  disabled={pending}
                >
                  {page.status === 'published' ? 'Unpublish' : 'Publish'}
                </Button>
              </Stack>
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

        <Card>
          <CardHeader>
            <Heading level={3}>Content</Heading>
            <CardDescription>
              Title, slug, and the body block editor. Autosaved every keystroke once autosave lands;
              in the meantime use <strong>Save changes</strong> below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack gap={2}>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                />
                <Text size="xs" variant="muted">
                  /{slug} is your storefront path.
                </Text>
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="content">Body</Label>
                <ContentBlockEditor
                  value={doc}
                  onChange={setDoc}
                  placeholder="Write the page body. Use the toolbar for formatting."
                  ariaLabel="Page body editor"
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <SeoPanel
          value={seo}
          onChange={setSeo}
          previewOrigin={PREVIEW_ORIGIN}
          slug={slug}
          fallbackTitle={title}
        />

        <Card>
          <CardContent>
            <Stack gap={2}>
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
      </Stack>
    </form>
  );
}
