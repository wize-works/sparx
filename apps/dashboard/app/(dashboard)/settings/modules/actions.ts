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
import { prisma, type Prisma } from '@sparx/db';
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
  // Diagnostic log for the CRM audit's F-01 persistence repro. If the
  // toggle ever silently fails to persist, the pod logs will show whether
  // we got here, what role the session had, what the SQL update returned,
  // and which branch (assertOwner / SQL / bootstrap) blew up.
  console.log('[setModuleEnabledAction] enter', {
    slug,
    enabled,
    tenantId: session.user.tenantId,
    role: session.user.role,
  });
  try {
    assertOwner(session.user.role);
    if (!VALID_SLUGS.has(slug)) {
      return { ok: false, error: { message: `Unknown module: ${slug}` } };
    }

    // Read-modify-write rather than `jsonb_set`. The raw-SQL approach we
    // had previously silently no-op'd when `settings.modules.<slug>` did
    // not already exist as an object — Postgres `jsonb_set` "cannot create
    // a missing parent value", so writing `{modules, crm, enabled}` to a
    // tenant whose `settings.modules` had no `crm` key returned the
    // original settings unchanged while still counting as `UPDATE 1`.
    // That was the F-01 persistence repro: CMS deactivation worked
    // because the user had set `modules.cms` manually, but CRM activation
    // silently dropped because `modules.crm` had no parent object yet.
    //
    // The read/modify/write here always produces a correctly nested
    // structure regardless of starting shape, and we re-read after the
    // write to confirm persistence in the pod logs.
    const tenantBefore = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { settings: true },
    });
    if (!tenantBefore) {
      return { ok: false, error: { message: `Tenant ${session.user.tenantId} not found` } };
    }
    const currentSettings = (tenantBefore.settings as Record<string, unknown> | null) ?? {};
    const currentModules = (currentSettings.modules as Record<string, unknown> | undefined) ?? {};
    const currentSlot = (currentModules[slug] as Record<string, unknown> | undefined) ?? {};
    const nextSettings = {
      ...currentSettings,
      modules: {
        ...currentModules,
        [slug]: { ...currentSlot, enabled },
      },
    };
    console.log('[setModuleEnabledAction] writing', {
      slug,
      enabled,
      previousModules: currentModules,
    });
    await prisma.tenant.update({
      where: { id: session.user.tenantId },
      data: { settings: nextSettings as Prisma.InputJsonValue },
    });
    const tenantAfter = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { settings: true },
    });
    const verifiedModules =
      ((tenantAfter?.settings as Record<string, unknown> | null)?.modules as
        | Record<string, { enabled?: boolean }>
        | undefined) ?? {};
    console.log('[setModuleEnabledAction] verified', {
      slug,
      enabled,
      verifiedEnabled: verifiedModules[slug]?.enabled === true,
      allModules: verifiedModules,
    });

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

    // Revalidate the settings page (status pills) AND the toggled module's
    // route group layout — the gate now lives in each module's layout.tsx,
    // so flipping enabled needs to invalidate that layout's render cache or
    // the next /<module>/ request would still see the old gate result.
    revalidatePath('/settings/modules');
    revalidatePath(`/${slug}`, 'layout');
    console.log('[setModuleEnabledAction] success', { slug, enabled });
    return { ok: true, data: { slug, enabled } };
  } catch (err) {
    console.error('[setModuleEnabledAction] failed', {
      slug,
      enabled,
      tenantId: session.user.tenantId,
      role: session.user.role,
      err,
    });
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
