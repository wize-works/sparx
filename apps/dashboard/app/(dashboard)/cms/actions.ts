'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';

// CRUD server actions for CMS pages. All wrapped in withTenant() — pages are
// FORCE RLS tenant-scoped, so even sparx_owner cannot bypass the tenant
// filter. The Zod schemas double as runtime validation and as the source of
// truth for what fields the forms can submit.

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

function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createPage(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireSession();

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
    const page = await withTenant({ tenantId: user.tenantId }, (tx) =>
      tx.page.create({
        data: {
          tenantId: user.tenantId,
          title: parsed.data.title,
          slug,
          content: parsed.data.content ? { body: parsed.data.content } : {},
        },
        select: { id: true },
      })
    );

    revalidatePath('/cms');
    return { ok: true, data: { id: page.id } };
  } catch (err: unknown) {
    if (isPrismaCode(err, 'P2002')) {
      return { ok: false, error: `A page with slug "${slug}" already exists.` };
    }
    console.error('createPage failed', err);
    return { ok: false, error: 'Could not create page.' };
  }
}

export async function updatePage(id: string, formData: FormData): Promise<ActionResult> {
  const { user } = await requireSession();

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
    await withTenant({ tenantId: user.tenantId }, (tx) =>
      tx.page.update({
        where: { id },
        data: {
          title: parsed.data.title,
          slug: parsed.data.slug,
          content: parsed.data.content ? { body: parsed.data.content } : undefined,
          seoTitle: parsed.data.seoTitle ?? null,
          metaDescription: parsed.data.metaDescription ?? null,
        },
      })
    );
  } catch (err: unknown) {
    if (isPrismaCode(err, 'P2002')) {
      return { ok: false, error: `Another page already uses slug "${parsed.data.slug}".` };
    }
    console.error('updatePage failed', err);
    return { ok: false, error: 'Could not save changes.' };
  }

  revalidatePath('/cms');
  revalidatePath(`/cms/${id}`);
  return { ok: true };
}

export async function setPageStatus(id: string, rawStatus: string): Promise<ActionResult> {
  const { user } = await requireSession();

  const parsed = StatusSchema.safeParse(rawStatus);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid status.' };
  }

  await withTenant({ tenantId: user.tenantId }, (tx) =>
    tx.page.update({
      where: { id },
      data: {
        status: parsed.data,
        publishedAt: parsed.data === 'published' ? new Date() : null,
      },
    })
  );

  revalidatePath('/cms');
  revalidatePath(`/cms/${id}`);
  return { ok: true };
}

export async function deletePage(id: string): Promise<ActionResult> {
  const { user } = await requireSession();

  await withTenant({ tenantId: user.tenantId }, (tx) => tx.page.delete({ where: { id } }));

  revalidatePath('/cms');
  return { ok: true };
}

function isPrismaCode(err: unknown, code: string): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  return (err as { code: string }).code === code;
}
