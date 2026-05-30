'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, type ApiRestError } from '@/lib/api-rest-client';

const CreateBody = z.object({
  display_name: z.string().min(1).max(255),
  slug: z.string().max(255).optional(),
  bio: z.string().max(8192).optional(),
});

const UpdateBody = z.object({
  display_name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  bio: z.string().max(8192).optional(),
});

export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  /** Optional field key the error is scoped to (e.g. 'slug' for a slug collision). */
  field?: string;
  error?: string;
}

function friendly(err: unknown): { message: string; field?: string } {
  const e = err as ApiRestError;
  const message = typeof e?.message === 'string' ? e.message : 'An error occurred.';
  // The api-rest CONFLICT envelope for slug clashes is shaped like
  // 'An author with slug "x" already exists.' Pin it to the slug field so the
  // UI can render the error inline next to the offending input instead of in
  // the form footer.
  if (e?.code === 'CONFLICT' && /slug/i.test(message)) {
    return { message, field: 'slug' };
  }
  return { message };
}

function readString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createAuthor(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateBody.safeParse({
    display_name: readString(formData, 'display_name'),
    slug: readString(formData, 'slug') || undefined,
    bio: readString(formData, 'bio') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  try {
    const created = await api.post<{ id: string }>('/v1/authors', parsed.data);
    revalidatePath('/cms/authors');
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    const { message, field } = friendly(err);
    return { ok: false, error: message, ...(field ? { field } : {}) };
  }
}

export async function updateAuthor(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = UpdateBody.safeParse({
    display_name: readString(formData, 'display_name'),
    slug: readString(formData, 'slug'),
    bio: readString(formData, 'bio') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  try {
    await api.patch(`/v1/authors/${id}`, parsed.data);
    revalidatePath('/cms/authors');
    revalidatePath(`/cms/authors/${id}`);
    return { ok: true };
  } catch (err) {
    const { message, field } = friendly(err);
    return { ok: false, error: message, ...(field ? { field } : {}) };
  }
}

export async function deleteAuthor(id: string): Promise<ActionResult> {
  try {
    await api.delete(`/v1/authors/${id}`);
    revalidatePath('/cms/authors');
    return { ok: true };
  } catch (err) {
    const { message, field } = friendly(err);
    return { ok: false, error: message, ...(field ? { field } : {}) };
  }
}
