'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type {
  ApproveReturnInput,
  DenyReturnInput,
  IssueReturnRefundInput,
  RecordReturnInspectionInput,
} from '@sparx/commerce-schemas';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

export async function approveReturnAction(
  input: ApproveReturnInput
): Promise<ActionResult<{ labelMediaId: string | null }>> {
  return restAction(async () => {
    const result = await api.post<{ labelMediaId: string | null }>(
      `/v1/commerce/returns/${input.returnId}/approve`,
      input
    );
    revalidatePath('/commerce/returns');
    revalidatePath(`/commerce/returns/${input.returnId}`);
    return result;
  });
}

export async function denyReturnAction(input: DenyReturnInput): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/returns/${input.returnId}/deny`, input);
    revalidatePath('/commerce/returns');
    revalidatePath(`/commerce/returns/${input.returnId}`);
  });
}

export async function markReturnReceivedAction(returnId: string): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/returns/${returnId}/received`, {});
    revalidatePath('/commerce/returns');
    revalidatePath(`/commerce/returns/${returnId}`);
  });
}

export async function recordReturnInspectionAction(
  input: RecordReturnInspectionInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/returns/${input.returnId}/inspection`, input);
    revalidatePath(`/commerce/returns/${input.returnId}`);
  });
}

export async function issueReturnRefundAction(
  input: IssueReturnRefundInput
): Promise<ActionResult<{ refundId: string }>> {
  return restAction(async () => {
    const result = await api.post<{ refundId: string }>(
      `/v1/commerce/returns/${input.returnId}/refund`,
      input
    );
    revalidatePath('/commerce/returns');
    revalidatePath(`/commerce/returns/${input.returnId}`);
    return result;
  });
}
