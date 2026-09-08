'use server';

// Tenant write actions (build-plan §5 Slice 8): module activate/deactivate,
// suspend/unsuspend, and storage-limit override. Each re-checks its capability
// SERVER-SIDE (never trust the client gate), acts through the internal seam
// (which stamps the TENANT's audit_logs as an operator action), then writes the
// wize_admin operator audit and revalidates the detail page.
//
// SCOPE: suspend is status-only and the storage-limit is stored-not-enforced for
// now — see docs/apps/admin/slice-8-enforcement-followups.md.

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@wizeworks/operator-auth/next';
import { logOperatorAction } from '@wizeworks/operator-auth';
import { OperatorApiError, type OperatorModuleToggleResult } from '@wizeworks/operator';
import { operatorApi } from '@/lib/operator-api';

function errorMessage(err: unknown): string {
  return err instanceof OperatorApiError ? err.message : 'Something went wrong. Please try again.';
}

export type ModuleToggleActionResult =
  { ok: true; result: OperatorModuleToggleResult } | { ok: false; error: string };

export async function toggleTenantModuleAction(
  tenantId: string,
  slug: string,
  enabled: boolean
): Promise<ModuleToggleActionResult> {
  const operator = await requireCapability('module:toggle');
  try {
    const result = await operatorApi().toggleTenantModule(tenantId, slug, { enabled }, operator.id);
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'module:toggle',
        action: enabled ? 'tenant.module.activate' : 'tenant.module.deactivate',
        targetTenantId: tenantId,
        diff: { module: slug, enabled, changed: result.changed },
      });
    } catch {
      // best-effort audit
    }
    revalidatePath(`/sparx/tenants/${tenantId}`);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export type StatusActionResult = { ok: true; status: string } | { ok: false; error: string };

/** Suspend / unsuspend a tenant (status-only). Gated `tenant:suspend`. */
export async function setTenantStatusAction(
  tenantId: string,
  suspended: boolean,
  reason?: string
): Promise<StatusActionResult> {
  const operator = await requireCapability('tenant:suspend');
  try {
    const trimmed = reason?.trim();
    const result = await operatorApi().setTenantStatus(
      tenantId,
      { suspended, ...(trimmed ? { reason: trimmed } : {}) },
      operator.id
    );
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'tenant:suspend',
        action: suspended ? 'tenant.suspend' : 'tenant.unsuspend',
        targetTenantId: tenantId,
        diff: { status: result.status, reason: trimmed ?? null },
      });
    } catch {
      // best-effort audit
    }
    revalidatePath(`/sparx/tenants/${tenantId}`);
    return { ok: true, status: result.status };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export type StorageLimitActionResult =
  { ok: true; limitBytes: number | null } | { ok: false; error: string };

/** Set (or clear, with null) a tenant's storage-cap override. Gated
 *  `tenant:suspend` (a tenant-account administration lever). */
export async function setTenantStorageLimitAction(
  tenantId: string,
  limitBytes: number | null
): Promise<StorageLimitActionResult> {
  const operator = await requireCapability('tenant:suspend');
  try {
    const result = await operatorApi().setTenantStorageLimit(tenantId, { limitBytes }, operator.id);
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'tenant:suspend',
        action: limitBytes === null ? 'tenant.storage_limit.clear' : 'tenant.storage_limit.set',
        targetTenantId: tenantId,
        diff: { limitBytes: result.limitBytes },
      });
    } catch {
      // best-effort audit
    }
    revalidatePath(`/sparx/tenants/${tenantId}`);
    return { ok: true, limitBytes: result.limitBytes };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
