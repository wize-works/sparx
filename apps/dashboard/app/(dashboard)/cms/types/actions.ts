'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, type ApiRestError } from '@/lib/api-rest-client';

// Generic CRUD over /v1/content/entries for ANY content type. Used by the
// schema-driven dashboard pages under /cms/types/[typeKey]. Distinct from
// `cms/actions.ts` (which is page-only), so the page-only flow stays
// unaffected by changes here.

const SlugSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and dashes.');

const TypeKeySchema = z.string().min(1).max(63);

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

function friendly(err: unknown): string {
  const e = err as ApiRestError;
  if (e?.code === 'VALIDATION_ERROR' && Array.isArray(e.details) && e.details.length) {
    const first = e.details[0] as { path?: string; message?: string };
    return first.message ?? e.message ?? 'Invalid input.';
  }
  return e?.message ?? 'An error occurred.';
}

export async function createEntry(
  typeKey: string,
  body: Record<string, unknown>,
  slug?: string
): Promise<ActionResult<{ id: string }>> {
  const typeParsed = TypeKeySchema.safeParse(typeKey);
  if (!typeParsed.success) return { ok: false, error: 'Invalid content type.' };

  const payload: Record<string, unknown> = {
    type_key: typeParsed.data,
    body,
  };
  if (slug) {
    const slugParsed = SlugSchema.safeParse(slug);
    if (!slugParsed.success) return { ok: false, error: slugParsed.error.issues[0]?.message };
    payload.slug = slugParsed.data;
  }

  try {
    const entry = await api.post<ApiEntry>('/v1/content/entries', payload);
    revalidatePath(`/cms/types/${typeKey}`);
    revalidatePath('/cms/types');
    return { ok: true, data: { id: entry.id } };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function updateEntry(
  id: string,
  body: Record<string, unknown>,
  slug?: string
): Promise<ActionResult> {
  const payload: Record<string, unknown> = { body };
  if (slug) {
    const slugParsed = SlugSchema.safeParse(slug);
    if (!slugParsed.success) return { ok: false, error: slugParsed.error.issues[0]?.message };
    payload.slug = slugParsed.data;
  }
  try {
    const entry = await api.patch<ApiEntry>(`/v1/content/entries/${id}`, payload);
    revalidatePath(`/cms/types/${entry.type_key}`);
    revalidatePath(`/cms/types/${entry.type_key}/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function deleteEntry(id: string, typeKey: string): Promise<ActionResult> {
  try {
    await api.delete(`/v1/content/entries/${id}`);
    revalidatePath(`/cms/types/${typeKey}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function setEntryStatus(
  id: string,
  typeKey: string,
  rawStatus: string
): Promise<ActionResult> {
  const StatusSchema = z.enum(['draft', 'published']);
  const parsed = StatusSchema.safeParse(rawStatus);
  if (!parsed.success) return { ok: false, error: 'Invalid status.' };

  try {
    if (parsed.data === 'published') {
      await api.post(`/v1/content/entries/${id}/publish`);
    } else {
      await api.post(`/v1/content/entries/${id}/unpublish`);
    }
    revalidatePath(`/cms/types/${typeKey}`);
    revalidatePath(`/cms/types/${typeKey}/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}
