'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, type ApiRestError } from '@/lib/api-rest-client';

// Whole-tree replace save for a navigation menu. Navigation menus are owned by
// the CMS module (docs/30 §8); the underlying api-rest endpoint (`PUT
// /v1/navigation/menus/:location`) is module-neutral and stays put — the
// storefront consumes the same rows. Site Builder only binds a menu into a
// layout slot by id; it does not edit the menu tree.

const ItemInput: z.ZodType<MenuItemInput> = z.lazy(() =>
  z
    .object({
      label: z.string().min(1).max(255),
      entry_id: z.string().uuid().optional(),
      external_url: z.string().url().max(2048).optional(),
      open_in_new_tab: z.boolean().optional(),
      children: z.array(ItemInput).optional(),
    })
    .refine(
      (v) => (v.entry_id ? 1 : 0) + (v.external_url ? 1 : 0) === 1,
      'Each item must link to either an entry OR an external URL — not both, not neither.'
    )
);

interface MenuItemInput {
  label: string;
  entry_id?: string;
  external_url?: string;
  open_in_new_tab?: boolean;
  children?: MenuItemInput[];
}

const PutBody = z.object({
  name: z.string().min(1).max(120),
  items: z.array(ItemInput).max(500),
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

export async function saveMenu(
  location: string,
  payload: z.infer<typeof PutBody>
): Promise<ActionResult> {
  const parsed = PutBody.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid menu tree.' };
  }
  try {
    await api.put(`/v1/navigation/menus/${encodeURIComponent(location)}`, parsed.data);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  revalidatePath('/cms/navigation');
  revalidatePath(`/cms/navigation/${location}`);
  return { ok: true };
}
