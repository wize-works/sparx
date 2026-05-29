'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, type ApiRestError } from '@/lib/api-rest-client';

const TaxonomyKey = z
  .string()
  .min(1)
  .max(63)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Use lowercase letters, numbers, and underscores; start with a letter.'
  );

const CreateTaxonomy = z.object({
  key: TaxonomyKey,
  name: z.string().min(1).max(120),
  plural_name: z.string().min(1).max(120),
  hierarchical: z.boolean().optional(),
});

const CreateTerm = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().max(255).optional(),
  description: z.string().max(8192).optional(),
  parent_term_id: z.string().uuid().nullable().optional(),
});

export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

function friendly(err: unknown): string {
  const e = err as ApiRestError;
  if (typeof e?.message === 'string') return e.message;
  return 'An error occurred.';
}

function readString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createTaxonomy(formData: FormData): Promise<ActionResult> {
  const parsed = CreateTaxonomy.safeParse({
    key: readString(formData, 'key'),
    name: readString(formData, 'name'),
    plural_name: readString(formData, 'plural_name'),
    hierarchical: formData.get('hierarchical') === 'on',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  try {
    await api.post('/v1/taxonomies', parsed.data);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  revalidatePath('/cms/taxonomy');
  return { ok: true };
}

export async function deleteTaxonomy(key: string): Promise<ActionResult> {
  try {
    await api.delete(`/v1/taxonomies/${encodeURIComponent(key)}`);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  revalidatePath('/cms/taxonomy');
  return { ok: true };
}

export async function createTerm(key: string, formData: FormData): Promise<ActionResult> {
  const parsed = CreateTerm.safeParse({
    name: readString(formData, 'name'),
    slug: readString(formData, 'slug') || undefined,
    description: readString(formData, 'description') || undefined,
    parent_term_id: readString(formData, 'parent_term_id') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  try {
    await api.post(`/v1/taxonomies/${encodeURIComponent(key)}/terms`, parsed.data);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  revalidatePath(`/cms/taxonomy/${key}`);
  return { ok: true };
}

export async function deleteTerm(key: string, id: string): Promise<ActionResult> {
  try {
    await api.delete(`/v1/taxonomies/${encodeURIComponent(key)}/terms/${id}`);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  revalidatePath(`/cms/taxonomy/${key}`);
  return { ok: true };
}
