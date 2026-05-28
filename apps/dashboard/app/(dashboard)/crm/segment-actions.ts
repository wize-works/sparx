'use server';

// Segment Server Actions — create/update/archive + previewCount.
//
// previewCount is the rule-builder feedback path: sample some customers,
// evaluate the candidate rule against each, return match count. The
// recomputeFull action is admin-only — it walks every customer.

import { revalidatePath } from 'next/cache';

import { segmentService } from '@sparx/crm';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createSegmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const segment = await segmentService.create(ctx, input);
    revalidatePath('/crm/segments');
    return { id: segment.id };
  });
}

export async function updateSegmentAction(
  segmentId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const segment = await segmentService.update(ctx, segmentId, input);
    revalidatePath('/crm/segments');
    revalidatePath(`/crm/segments/${segmentId}`);
    return { id: segment.id };
  });
}

export async function archiveSegmentAction(
  segmentId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const segment = await segmentService.archive(ctx, segmentId);
    revalidatePath('/crm/segments');
    return { id: segment.id };
  });
}

export async function previewSegmentCountAction(
  rule: unknown,
  sampleSize?: number
): Promise<ActionResult<{ matches: number; sampled: number; total: number }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    return segmentService.previewCount(ctx, { rule, sampleSize });
  });
}

/** Admin-only safety-net path: rebuilds segment_members from scratch
 *  against every customer. Used to reconcile drift from dropped events. */
export async function recomputeSegmentsAction(
  segmentId?: string
): Promise<ActionResult<{ scanned: number; changed: number }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await segmentService.recomputeFull(ctx, { segmentId });
    revalidatePath('/crm/segments');
    if (segmentId) revalidatePath(`/crm/segments/${segmentId}`);
    return result;
  });
}
