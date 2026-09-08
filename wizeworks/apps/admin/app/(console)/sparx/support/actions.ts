'use server';

// Support write actions (Slice 6): re-send an order-confirmation email. Re-checks
// support:act SERVER-SIDE (never trusts the client), then re-sends through the
// tenant's own published order-confirmation template via the internal seam. Every
// call is audited against the target tenant.

import { requireCapability } from '@wizeworks/operator-auth/next';
import { logOperatorAction } from '@wizeworks/operator-auth';
import { OperatorApiError, type OperatorResendConfirmationResult } from '@wizeworks/operator';
import { operatorApi } from '@/lib/operator-api';

export type ResendActionResult =
  { ok: true; result: OperatorResendConfirmationResult } | { ok: false; error: string };

export async function resendOrderConfirmationAction(
  tenantId: string,
  orderId: string
): Promise<ResendActionResult> {
  const operator = await requireCapability('support:act');
  try {
    const result = await operatorApi().resendOrderConfirmation(tenantId, orderId, operator.id);
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'support:act',
        action: 'order.confirmation.resend',
        targetTenantId: tenantId,
        diff: {
          orderNumber: result.orderNumber,
          sent: result.sent,
          reason: result.reason,
          to: result.to,
        },
      });
    } catch {
      // best-effort audit
    }
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof OperatorApiError ? err.message : 'Something went wrong. Please try again.',
    };
  }
}
