'use client';

// Edit-form for one CMS page entry.
//
// Autosave model:
//   - Every controlled field change (title / slug / doc / seo) bumps a
//     "dirty cursor". A 600ms debounce fires `autosavePage` against
//     api-rest with the current values + last known ETag.
//   - Only one autosave in-flight at a time. If the user types during a
//     save, the post-save effect picks up the newer dirty cursor and
//     fires again.
//   - 412 PRECONDITION_FAILED → conflict banner with a Reload CTA. Until
//     reloaded, autosave is suspended (the next PATCH would also 412).
//   - Explicit Save button keeps publish/SEO revalidation semantics.
//
// We rely on api-rest's `updatedAt` always advancing on PATCH (the route
// sets it explicitly) so the ETag truly reflects "last write wins" state.

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
import { CalendarClock, History, RotateCw, Trash2 } from 'lucide-react';
import {
  autosavePage,
  deletePage,
  schedulePagePublish,
  setPageStatus,
  updatePage,
} from '../actions';
import { SeoPanel, type SeoFields } from './seo-panel';
import { PreviewButton } from './preview-button';

export interface EditableTenantPage {
  id: string;
  typeKey: string;
  slug: string;
  title: string;
  status: string;
  body: CmsDoc;
  seo: SeoFields;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  updatedAt: Date;
}

const ZONE_DOMAIN = process.env.NEXT_PUBLIC_SPARX_ZONE_DOMAIN ?? 'sparx.zone';
const AUTOSAVE_DEBOUNCE_MS = 600;

function storefrontOrigin(tenantSlug: string | null): string {
  if (tenantSlug) return `https://${tenantSlug}.${ZONE_DOMAIN}`;
  return process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://sparx.works';
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string };

export function EditPageForm({
  page,
  tenantSlug,
  initialEtag,
}: {
  page: EditableTenantPage;
  tenantSlug: string | null;
  initialEtag: string | null;
}) {
  const previewOrigin = storefrontOrigin(tenantSlug);
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [doc, setDoc] = React.useState<CmsDoc>(page.body ?? EMPTY_DOC);
  const [title, setTitle] = React.useState(page.title);
  const [slug, setSlug] = React.useState(page.slug);
  const [seo, setSeo] = React.useState<SeoFields>(page.seo);

  // Autosave bookkeeping.
  const [saveState, setSaveState] = React.useState<SaveState>({ kind: 'idle' });
  const etagRef = React.useRef<string | null>(initialEtag);
  const inFlightRef = React.useRef(false);
  const dirtyRef = React.useRef(false);
  const hydratedRef = React.useRef(false);

  // Stable refs for the current values — the debounce closure reads from
  // these so we don't re-arm the timer on every keystroke (which would
  // mean each keystroke pushes the save further out).
  const titleRef = React.useRef(title);
  const slugRef = React.useRef(slug);
  const docRef = React.useRef(doc);
  const seoRef = React.useRef(seo);
  React.useEffect(() => {
    titleRef.current = title;
  }, [title]);
  React.useEffect(() => {
    slugRef.current = slug;
  }, [slug]);
  React.useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  React.useEffect(() => {
    seoRef.current = seo;
  }, [seo]);

  const runAutosave = React.useCallback(async () => {
    if (inFlightRef.current) return;
    if (saveState.kind === 'conflict') return;
    inFlightRef.current = true;
    dirtyRef.current = false;
    setSaveState({ kind: 'saving' });
    const result = await autosavePage(
      page.id,
      {
        title: titleRef.current,
        slug: slugRef.current,
        content: docRef.current,
        seo: {
          ...(seoRef.current.title ? { title: seoRef.current.title } : {}),
          ...(seoRef.current.description ? { description: seoRef.current.description } : {}),
          ...(seoRef.current.canonical ? { canonical: seoRef.current.canonical } : {}),
          ...(seoRef.current.robots ? { robots: seoRef.current.robots } : {}),
          ...(seoRef.current.ogImage ? { ogImage: seoRef.current.ogImage } : {}),
        },
      },
      etagRef.current
    );
    inFlightRef.current = false;
    if (!result.ok) {
      if (result.error === 'CONFLICT') {
        setSaveState({ kind: 'conflict' });
      } else {
        setSaveState({ kind: 'error', message: result.error ?? 'Autosave failed.' });
      }
      return;
    }
    etagRef.current = result.data?.etag ?? etagRef.current;
    setSaveState({ kind: 'saved', at: new Date() });
    // Catch-up: if the user typed during the save, fire another tick.
    if (dirtyRef.current) {
      void runAutosave();
    }
  }, [page.id, saveState.kind]);

  // Debounce: whenever a controlled value changes, mark dirty + schedule
  // a save 600ms after the last edit. Skips the very first render so the
  // initial prop hydration doesn't trigger a needless save.
  React.useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    dirtyRef.current = true;
    const handle = setTimeout(() => {
      void runAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [title, slug, doc, seo, runAutosave]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    formData.set('content', JSON.stringify(doc));
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

  function onSchedule() {
    setError(null);
    setMessage(null);
    // Browser-native prompt is the smallest path to a working schedule UI.
    // Date is parsed as local time then re-emitted as ISO with offset so
    // the server gets an unambiguous UTC timestamp.
    const defaultValue = formatLocalDateTime(
      page.scheduledAt ?? new Date(Date.now() + 60 * 60 * 1000)
    );
    const raw = window.prompt(
      'Schedule this page to publish (YYYY-MM-DDTHH:MM, your local time)',
      defaultValue
    );
    if (!raw) return;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      setError('That doesn’t look like a valid date/time.');
      return;
    }

    startTransition(async () => {
      const result = await schedulePagePublish(page.id, parsed.toISOString());
      if (!result.ok) {
        setError(result.error ?? 'Could not schedule publish.');
        return;
      }
      setMessage(`Scheduled for ${parsed.toLocaleString()}.`);
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
                <AutosaveIndicator state={saveState} onReload={() => router.refresh()} />
              </Stack>
              <Stack direction="row" align="center" gap={2}>
                <PreviewButton
                  entryId={page.id}
                  slug={page.slug}
                  typeKey={page.typeKey}
                  tenantSlug={tenantSlug}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  asChild
                  leftIcon={<History className="h-3.5 w-3.5" />}
                >
                  <Link href={`/cms/${page.id}/revisions`}>Revisions</Link>
                </Button>
                {page.status !== 'published' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    leftIcon={<CalendarClock className="h-3.5 w-3.5" />}
                    onClick={onSchedule}
                    disabled={pending}
                  >
                    Schedule
                  </Button>
                )}
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
          {(page.publishedAt ?? page.scheduledAt) && (
            <CardContent>
              <Stack gap={1}>
                {page.scheduledAt && (
                  <Text size="sm" variant="muted">
                    Scheduled for {page.scheduledAt.toLocaleString()}
                  </Text>
                )}
                {page.publishedAt && (
                  <Text size="sm" variant="muted">
                    Last published {page.publishedAt.toLocaleString()}
                  </Text>
                )}
              </Stack>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <Heading level={3}>Content</Heading>
            <CardDescription>
              Title, slug, and the body block editor. Autosaves every keystroke after a brief pause.
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
          previewOrigin={previewOrigin}
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

// Formats a Date as `YYYY-MM-DDTHH:MM` in the browser's local time —
// matches the `datetime-local` input format and the parser the schedule
// prompt feeds into `new Date()`.
function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Small status pill rendered next to the Status badge so the editor
// always knows whether their last keystroke is safely on the server.
function AutosaveIndicator({ state, onReload }: { state: SaveState; onReload: () => void }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'saving') {
    return (
      <Text size="xs" variant="muted" aria-live="polite">
        Saving…
      </Text>
    );
  }
  if (state.kind === 'saved') {
    return (
      <Text size="xs" variant="muted" aria-live="polite">
        Saved {state.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    );
  }
  if (state.kind === 'conflict') {
    return (
      <Stack direction="row" align="center" gap={1}>
        <Text size="xs" variant="danger" aria-live="polite">
          Someone else saved this page.
        </Text>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          leftIcon={<RotateCw className="h-3 w-3" />}
          onClick={onReload}
        >
          Reload
        </Button>
      </Stack>
    );
  }
  return (
    <Text size="xs" variant="danger" aria-live="polite">
      Autosave failed: {state.message}
    </Text>
  );
}
