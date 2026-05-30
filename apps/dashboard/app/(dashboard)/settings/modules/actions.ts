'use server';

// Server actions for the modules settings page.
//
// Every toggle and read goes through api-rest now (`PATCH /v1/tenant/modules/:slug`,
// `GET /v1/tenant/modules`). The role gate (owner/admin only), persistence,
// and the in-process module-gate cache invalidation all live there. The CRM
// activation bootstrap is a separate, idempotent admin call to the CRM route
// (`POST /v1/crm/bootstrap`) — it's intentionally not folded into the toggle
// endpoint so the tenant route stays module-agnostic.
//
// Cross-process cache (api-rest's separate LRU) self-heals within 60s via the
// TTL. We don't publish a Pub/Sub event yet — that lands when the platform-wide
// event bus moves off the in-process stub.

import 'server-only';
import { revalidatePath } from 'next/cache';
import { type ModuleSlug } from '@sparx/auth';

import { api, type ApiRestError } from '@/lib/api-rest-client';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

const VALID_SLUGS: ReadonlySet<ModuleSlug> = new Set([
  'storefront',
  'commerce',
  'cms',
  'crm',
  'email',
  'b2b',
  'dropship',
  'ai',
]);

export async function setModuleEnabledAction(
  slug: ModuleSlug,
  enabled: boolean
): Promise<ActionResult<{ slug: ModuleSlug; enabled: boolean }>> {
  if (!VALID_SLUGS.has(slug)) {
    return { ok: false, error: { message: `Unknown module: ${slug}` } };
  }
  try {
    const result = await api.patch<{ slug: ModuleSlug; enabled: boolean }>(
      `/v1/tenant/modules/${encodeURIComponent(slug)}`,
      { enabled }
    );

    // CRM activation seeds the default pipeline + built-in segments. The
    // same functions also run when the platform bus delivers
    // `module.activated` to the api-rest consumer; both paths are
    // idempotent so a double-run is a no-op.
    if (enabled && slug === 'crm') {
      await api.post<{ bootstrapped: boolean }>('/v1/crm/bootstrap', {});
    }

    revalidatePath('/settings/modules');
    revalidatePath(`/${slug}`, 'layout');
    return { ok: true, data: result };
  } catch (err) {
    const e = err as ApiRestError;
    return { ok: false, error: { message: e.message ?? 'Module update failed.' } };
  }
}

export interface ModuleState {
  slug: ModuleSlug;
  enabled: boolean;
}

export async function listModuleStateForCurrentTenant(): Promise<ModuleState[]> {
  return api.get<ModuleState[]>('/v1/tenant/modules');
}
