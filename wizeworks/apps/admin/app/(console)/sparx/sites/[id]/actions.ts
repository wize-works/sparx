'use server';

// Site write actions (user & site management). Re-checks `site:act` SERVER-SIDE,
// acts through the internal seam (which stamps the owning TENANT's audit_logs as an
// operator action), writes the wize_admin operator audit, and revalidates the
// site detail page. Status-only: pause / archive / reactivate a site.

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@wizeworks/operator-auth/next';
import { logOperatorAction } from '@wizeworks/operator-auth';
import { OperatorApiError, type OperatorSiteStatusResult } from '@wizeworks/operator';
import { operatorApi } from '@/lib/operator-api';

function errorMessage(err: unknown): string {
  return err instanceof OperatorApiError ? err.message : 'Something went wrong. Please try again.';
}

export type SiteStatusActionResult =
  { ok: true; result: OperatorSiteStatusResult } | { ok: false; error: string };

export async function setSiteStatusAction(
  siteId: string,
  tenantId: string,
  status: 'active' | 'paused' | 'archived'
): Promise<SiteStatusActionResult> {
  const operator = await requireCapability('site:act');
  try {
    const result = await operatorApi().setSiteStatus(siteId, { status }, operator.id);
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'site:act',
        action: `site.${status === 'active' ? 'reactivate' : status}`,
        targetTenantId: tenantId,
        diff: { siteId, status: result.status },
      });
    } catch {
      // best-effort audit
    }
    revalidatePath(`/sparx/sites/${siteId}`);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
