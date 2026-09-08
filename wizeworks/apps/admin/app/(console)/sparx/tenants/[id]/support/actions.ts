'use server';

// Per-tenant support write action (Slice 6): trigger a full search reindex. Re-checks
// support:act SERVER-SIDE, publishes the reindex event through the internal seam
// (the commerce-indexer rebuilds the tenant's Typesense collections from Postgres),
// and audits against the target tenant.

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@wizeworks/operator-auth/next';
import { logOperatorAction } from '@wizeworks/operator-auth';
import {
  OperatorApiError,
  type OperatorReindexInput,
  type OperatorReindexResult,
} from '@wizeworks/operator';
import { operatorApi } from '@/lib/operator-api';

export type ReindexActionResult =
  { ok: true; result: OperatorReindexResult } | { ok: false; error: string };

export async function reindexTenantAction(
  tenantId: string,
  input: OperatorReindexInput
): Promise<ReindexActionResult> {
  const operator = await requireCapability('support:act');
  try {
    const result = await operatorApi().reindexTenant(tenantId, input, operator.id);
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'support:act',
        action: 'search.reindex',
        targetTenantId: tenantId,
        diff: {
          runId: result.runId,
          collections: input.collections ?? 'all',
          dropStale: input.dropStale ?? false,
        },
      });
    } catch {
      // best-effort audit
    }
    revalidatePath(`/sparx/tenants/${tenantId}/support`);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof OperatorApiError ? err.message : 'Something went wrong. Please try again.',
    };
  }
}
