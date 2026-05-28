'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';

// Update the merchant's general settings.
//
// Goes through withTenant() so the SET LOCAL app.tenant_id is in scope for the
// Prisma client (sparx_app, NOBYPASSRLS). The tenants table itself is not RLS-
// scoped (it's the dispatch table), but using withTenant here keeps every
// business-data action shaped the same — and we also constrain the WHERE
// clause to session.user.tenantId so this is a triple safety belt.

const TenantUpdateSchema = z.object({
  name: z.string().min(1, 'Store name is required.').max(255),
  email: z.string().email('Enter a valid email address.').max(255),
});

export interface UpdateGeneralResult {
  ok: boolean;
  error?: string;
}

export async function updateGeneralSettings(formData: FormData): Promise<UpdateGeneralResult> {
  const { user } = await requireSession();

  const parsed = TenantUpdateSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  await withTenant({ tenantId: user.tenantId }, (tx) =>
    tx.tenant.update({
      where: { id: user.tenantId },
      data: { name: parsed.data.name, email: parsed.data.email },
    }),
  );

  revalidatePath('/settings/general');
  return { ok: true };
}
