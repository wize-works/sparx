'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, type ApiRestError } from '@/lib/api-rest-client';

// Server actions are thin adapters over api-rest. The dashboard CMS UI still
// uses "page" vocabulary (slug / title / status / body / SEO) for continuity,
// but underneath each action calls /v1/content/entries with type_key='page'.
// Moving to the unified content model means a future block editor needs
// zero changes to the URLs the dashboard hits.
//
// Why we keep server actions instead of posting straight to api-rest from
// the browser: server actions inherit Next.js cookies + `requireSession()`,
// run on the dashboard server (which holds the JWT secret), and integrate
// with `revalidatePath` for cache invalidation. Calling api-rest from the
// client would require either CORS + double session validation or a public
// internet exposure of api-rest — neither yet warranted.

const PAGE_TYPE_KEY = 'page';

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);

const CreateSchema = z.object({
  title: z.string().min(1, 'Title is required.').max(255),
  slug: z.string().max(255).optional(),
  content: z.string().max(50_000).optional(),
});

const UpdateSchema = z.object({
  title: z.string().min(1, 'Title is required.').max(255),
  slug: z
    .string()
    .min(1, 'Slug is required.')
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and dashes.'),
  content: z.string().max(50_000).optional(),
  seoTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(500).optional(),
});

const StatusSchema = z.enum(['draft', 'published']);

export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface ApiEntry {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: Record<string, unknown>;
  seo: Record<string, unknown>;
  published_at: string | null;
  updated_at: string;
  created_at: string;
}

function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

// The block editor stringifies a TipTap doc into the form's `content`
// field. We parse it back here and pass it through to api-rest as-is. If
// the JSON doesn't shape-check (no `type: 'doc'`) we substitute an empty
// doc rather than 422 — the form validator should have caught any user
// error already, and silent recovery beats a confusing dashboard 500.
function parseDoc(raw: string | undefined): Record<string, unknown> {
  if (!raw) return { type: 'doc', content: [] };
  try {
    const parsed = JSON.parse(raw) as { type?: unknown } & Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return { type: 'doc', content: [] };
}

function friendly(err: unknown): string {
  const e = err as ApiRestError;
  if (e?.code === 'VALIDATION_ERROR' && Array.isArray(e.details) && e.details.length) {
    const first = e.details[0] as { path?: string; message?: string };
    return first.message ?? e.message ?? 'Invalid input.';
  }
  if (typeof e?.message === 'string') return e.message;
  return 'An error occurred.';
}

export async function createPage(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSchema.safeParse({
    title: readField(formData, 'title'),
    slug: readField(formData, 'slug') || undefined,
    content: readField(formData, 'content') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.title);
  if (!slug) {
    return { ok: false, error: 'Title must contain letters or numbers.' };
  }

  try {
    const entry = await api.post<ApiEntry>('/v1/content/entries', {
      type_key: PAGE_TYPE_KEY,
      slug,
      body: {
        title: parsed.data.title,
        body: parseDoc(parsed.data.content),
      },
    });
    revalidatePath('/cms');
    return { ok: true, data: { id: entry.id } };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function updatePage(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = UpdateSchema.safeParse({
    title: readField(formData, 'title'),
    slug: readField(formData, 'slug'),
    content: readField(formData, 'content') || undefined,
    seoTitle: readField(formData, 'seoTitle') || undefined,
    metaDescription: readField(formData, 'metaDescription') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await api.patch(`/v1/content/entries/${id}`, {
      slug: parsed.data.slug,
      body: {
        title: parsed.data.title,
        body: parseDoc(parsed.data.content),
      },
      seo: {
        ...(parsed.data.seoTitle ? { title: parsed.data.seoTitle } : {}),
        ...(parsed.data.metaDescription ? { description: parsed.data.metaDescription } : {}),
      },
    });
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }

  revalidatePath('/cms');
  revalidatePath(`/cms/${id}`);
  return { ok: true };
}

export async function setPageStatus(id: string, rawStatus: string): Promise<ActionResult> {
  const parsed = StatusSchema.safeParse(rawStatus);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid status.' };
  }
  try {
    if (parsed.data === 'published') {
      await api.post(`/v1/content/entries/${id}/publish`);
    } else {
      await api.post(`/v1/content/entries/${id}/unpublish`);
    }
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  revalidatePath('/cms');
  revalidatePath(`/cms/${id}`);
  return { ok: true };
}

export async function deletePage(id: string): Promise<ActionResult> {
  try {
    await api.delete(`/v1/content/entries/${id}`);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  revalidatePath('/cms');
  return { ok: true };
}
