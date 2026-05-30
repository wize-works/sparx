'use server';

// Server actions for the modules settings page.
//
// Owner-only — non-owners can't flip module activation. Each toggle:
//   1. Updates tenant.settings.modules.<slug>.enabled in JSONB.
//   2. Invalidates the local module-gate cache so the next page render
//      sees the new state immediately.
//   3. On enable for slugs that need it (today: crm), runs the in-process
//      bootstrap so the merchant doesn't have to wait for the next event
//      tick — the bootstrap functions are idempotent.
//
// Cross-process cache (api-rest's separate LRU) self-heals within 60s
// via the TTL. We don't publish a Pub/Sub event yet — that lands when the
// platform-wide event bus moves off the in-process stub.

import 'server-only';
import { revalidatePath } from 'next/cache';
import { invalidateModuleCache, requireSession, type ModuleSlug } from '@sparx/auth';
import { prisma } from '@sparx/db';
import { pipelineService, segmentService } from '@sparx/crm';

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

function assertOwner(role: string): void {
  if (role !== 'owner' && role !== 'admin') {
    throw new Error('Only owners or admins can change module activation.');
  }
}

export async function setModuleEnabledAction(
  slug: ModuleSlug,
  enabled: boolean
): Promise<ActionResult<{ slug: ModuleSlug; enabled: boolean }>> {
  const session = await requireSession();
  try {
    assertOwner(session.user.role);
    if (!VALID_SLUGS.has(slug)) {
      return { ok: false, error: { message: `Unknown module: ${slug}` } };
    }

    // jsonb_set creates the nested path if it doesn't exist (last arg = true).
    // Building the JSONB value via parameters avoids any string-formatting
    // injection — slug is enum-validated above.
    await prisma.$executeRawUnsafe(
      `UPDATE tenants SET settings = jsonb_set(
         COALESCE(settings, '{}'::jsonb),
         '{modules,${slug},enabled}',
         to_jsonb($1::boolean),
         true
       ) WHERE id = $2::uuid`,
      enabled,
      session.user.tenantId
    );

    invalidateModuleCache(session.user.tenantId, slug);

    // CRM activation seeds the default pipeline + built-in segments. The
    // same functions also run when the platform bus delivers
    // `module.activated` to the api-rest consumer; both paths are
    // idempotent so a double-run is a no-op.
    if (enabled && slug === 'crm') {
      const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
      await pipelineService.bootstrapDefaultPipeline(ctx);
      await segmentService.bootstrapBuiltInSegments(ctx);
    }

    revalidatePath('/settings/modules');
    return { ok: true, data: { slug, enabled } };
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

export interface ModuleState {
  slug: ModuleSlug;
  enabled: boolean;
}

export async function listModuleStateForCurrentTenant(): Promise<ModuleState[]> {
  const session = await requireSession();
  const row = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { settings: true },
  });
  const settings = row?.settings as { modules?: Record<string, { enabled?: boolean }> } | null;
  const modules = settings?.modules ?? {};
  return Array.from(VALID_SLUGS).map((slug) => ({
    slug,
    enabled: modules[slug]?.enabled === true,
  }));
}
