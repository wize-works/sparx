'use server';

// Domain write action (Slice 5): force re-verify a domain. Re-checks the
// domain:manage capability SERVER-SIDE (never trusts the client), then re-runs
// verification through the internal seam: a synchronous DNS re-check for a custom
// host, or a domain-worker re-trigger for a purchased one. Every call is audited
// against the target tenant.

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@wizeworks/operator-auth/next';
import { logOperatorAction } from '@wizeworks/operator-auth';
import { OperatorApiError, type OperatorDomainReverifyResult } from '@wizeworks/operator';
import { operatorApi } from '@/lib/operator-api';

export type ReverifyActionResult =
  { ok: true; result: OperatorDomainReverifyResult } | { ok: false; error: string };

export async function reverifyDomainAction(
  domainId: string,
  tenantId: string
): Promise<ReverifyActionResult> {
  // Default-deny: the capability is re-checked here, not just in the UI.
  const operator = await requireCapability('domain:manage');
  try {
    const result = await operatorApi().reverifyDomain(domainId, operator.id);
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'domain:manage',
        action: 'domain.reverify',
        targetTenantId: tenantId,
        diff: {
          host: result.host,
          mode: result.mode,
          passed: result.passed,
          status: result.status,
        },
      });
    } catch {
      // best-effort audit
    }
    revalidatePath(`/sparx/domains/${domainId}`);
    revalidatePath('/sparx/domains');
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof OperatorApiError ? err.message : 'Something went wrong. Please try again.',
    };
  }
}
