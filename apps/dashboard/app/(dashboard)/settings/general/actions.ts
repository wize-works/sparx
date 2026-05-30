'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, type ApiRestError } from '@/lib/api-rest-client';

// Update the merchant's general settings via api-rest. The role gate and
// audit trail live in the api-rest route (`PATCH /v1/tenant`, requires
// admin role). Schema validation still happens here so the form error
// surfaces inline without a round-trip.

const TenantUpdateSchema = z.object({
  name: z.string().min(1, 'Store name is required.').max(255),
  email: z.string().email('Enter a valid email address.').max(255),
});

export interface UpdateGeneralResult {
  ok: boolean;
  error?: string;
}

export async function updateGeneralSettings(formData: FormData): Promise<UpdateGeneralResult> {
  const parsed = TenantUpdateSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await api.patch<{ id: string }>('/v1/tenant', parsed.data);
  } catch (err) {
    return { ok: false, error: (err as ApiRestError).message ?? 'Update failed.' };
  }

  revalidatePath('/settings/general');
  return { ok: true };
}
