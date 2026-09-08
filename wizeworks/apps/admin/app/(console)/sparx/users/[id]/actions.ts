'use server';

// Staff-user write actions (user & site management). Each re-checks `user:act`
// SERVER-SIDE (never trust the client gate), acts through the internal seam (which
// stamps the affected TENANT's audit_logs as an operator action), writes the
// wize_admin operator audit, and revalidates the user detail page.

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@wizeworks/operator-auth/next';
import { logOperatorAction } from '@wizeworks/operator-auth';
import {
  OperatorApiError,
  type OperatorUserMembershipsResult,
  type OperatorPasswordResetResult,
} from '@wizeworks/operator';
import { operatorApi } from '@/lib/operator-api';

function errorMessage(err: unknown): string {
  return err instanceof OperatorApiError ? err.message : 'Something went wrong. Please try again.';
}

export type MembershipActionResult =
  { ok: true; result: OperatorUserMembershipsResult } | { ok: false; error: string };

export type PasswordResetActionResult =
  { ok: true; result: OperatorPasswordResetResult } | { ok: false; error: string };

export async function setMembershipStatusAction(
  userId: string,
  tenantId: string,
  suspended: boolean
): Promise<MembershipActionResult> {
  const operator = await requireCapability('user:act');
  try {
    const result = await operatorApi().setMembershipStatus(
      userId,
      { tenantId, suspended },
      operator.id
    );
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'user:act',
        action: suspended ? 'user.membership.suspend' : 'user.membership.reactivate',
        targetTenantId: tenantId,
        diff: { userId, suspended },
      });
    } catch {
      // best-effort audit
    }
    revalidatePath(`/sparx/users/${userId}`);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function setMembershipRoleAction(
  userId: string,
  tenantId: string,
  role: string
): Promise<MembershipActionResult> {
  const operator = await requireCapability('user:act');
  try {
    const result = await operatorApi().setMembershipRole(userId, { tenantId, role }, operator.id);
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'user:act',
        action: 'user.membership.role',
        targetTenantId: tenantId,
        diff: { userId, role },
      });
    } catch {
      // best-effort audit
    }
    revalidatePath(`/sparx/users/${userId}`);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function removeMembershipAction(
  userId: string,
  tenantId: string
): Promise<MembershipActionResult> {
  const operator = await requireCapability('user:act');
  try {
    const result = await operatorApi().removeMembership(userId, { tenantId }, operator.id);
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'user:act',
        action: 'user.membership.remove',
        targetTenantId: tenantId,
        diff: { userId },
      });
    } catch {
      // best-effort audit
    }
    revalidatePath(`/sparx/users/${userId}`);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function resetPasswordAction(
  userId: string,
  homeTenantId: string
): Promise<PasswordResetActionResult> {
  const operator = await requireCapability('user:act');
  try {
    const result = await operatorApi().resetUserPassword(userId, operator.id);
    try {
      await logOperatorAction({
        operatorId: operator.id,
        operatorEmail: operator.email,
        capability: 'user:act',
        action: 'user.password_reset',
        targetTenantId: homeTenantId,
        diff: { userId, sent: result.sent },
      });
    } catch {
      // best-effort audit
    }
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
