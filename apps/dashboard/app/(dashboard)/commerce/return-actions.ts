'use server';

import { revalidatePath } from 'next/cache';

import { returnService } from '@sparx/commerce';
import type {
  ApproveReturnInput,
  DenyReturnInput,
  IssueReturnRefundInput,
  RecordReturnInspectionInput,
} from '@sparx/commerce-schemas';

import { runAction, sessionContext, type ActionResult } from './_action-helpers';

export async function approveReturnAction(
  input: ApproveReturnInput
): Promise<ActionResult<{ labelMediaId: string | null }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await returnService.approve(ctx, input);
    revalidatePath('/commerce/returns');
    revalidatePath(`/commerce/returns/${input.returnId}`);
    return result;
  });
}

export async function denyReturnAction(input: DenyReturnInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await returnService.deny(ctx, input);
    revalidatePath('/commerce/returns');
    revalidatePath(`/commerce/returns/${input.returnId}`);
  });
}

export async function markReturnReceivedAction(returnId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await returnService.markReceived(ctx, returnId);
    revalidatePath('/commerce/returns');
    revalidatePath(`/commerce/returns/${returnId}`);
  });
}

export async function recordReturnInspectionAction(
  input: RecordReturnInspectionInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await returnService.recordInspection(ctx, input);
    revalidatePath(`/commerce/returns/${input.returnId}`);
  });
}

export async function issueReturnRefundAction(
  input: IssueReturnRefundInput
): Promise<ActionResult<{ refundId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await returnService.issueRefund(ctx, input);
    revalidatePath('/commerce/returns');
    revalidatePath(`/commerce/returns/${input.returnId}`);
    return result;
  });
}
