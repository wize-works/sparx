'use server';

// Server actions for the AI Integrations settings page.
//
// Tenant-scoped (requireSession() resolves the tenant); only owner/admin
// can issue or revoke keys. The plaintext key is returned ONCE to the
// caller — the dashboard renders it inside the modal that triggered the
// issuance and never persists it client-side.

import 'server-only';
import { revalidatePath } from 'next/cache';
import {
  type IssuedKey,
  issueApiKey as issueApiKeyService,
  listApiKeys as listApiKeysService,
  revokeApiKey as revokeApiKeyService,
} from '@sparx/auth';
import { requireSession } from '@sparx/auth';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

const VALID_SCOPES = ['read:crm', 'write:crm', 'write:crm_bulk'] as const;

function badScopes(scopes: string[]): string | null {
  for (const s of scopes) {
    if (!(VALID_SCOPES as readonly string[]).includes(s)) return s;
  }
  return null;
}

interface CreateInput {
  name: string;
  scopes: string[];
  expiresAt?: string | null;
}

export async function createApiKeyAction(input: CreateInput): Promise<ActionResult<IssuedKey>> {
  const session = await requireSession();
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return { ok: false, error: { message: 'Only owners or admins can issue API keys.' } };
  }
  if (!input.name?.trim()) {
    return { ok: false, error: { message: 'Name is required.' } };
  }
  if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
    return { ok: false, error: { message: 'At least one scope is required.' } };
  }
  const bad = badScopes(input.scopes);
  if (bad) return { ok: false, error: { message: `Unsupported scope: ${bad}` } };

  try {
    const issued = await issueApiKeyService({
      tenantId: session.user.tenantId,
      name: input.name.trim(),
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdByUserId: session.user.id,
    });
    revalidatePath('/settings/ai-integrations');
    return { ok: true, data: issued };
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return { ok: false, error: { message: 'Only owners or admins can revoke API keys.' } };
  }
  try {
    await revokeApiKeyService(session.user.tenantId, id);
    revalidatePath('/settings/ai-integrations');
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

export async function listApiKeysForCurrentTenant() {
  const session = await requireSession();
  return listApiKeysService(session.user.tenantId);
}
