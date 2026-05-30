'use server';

// Segment Server Actions — thin adapters over api-rest.
//
// Each handler signs an internal JWT from the staff session and calls the
// matching /v1/crm/segments/* endpoint. The service-layer call lives in
// api-rest now; the dashboard no longer imports `@sparx/crm` directly.
//
// previewCount is the rule-builder feedback path: sample some customers,
// evaluate the candidate rule against each, return match count. recomputeFull
// is admin-only and walks every customer.

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface SegmentResponse {
  id: string;
}

interface PreviewCountResponse {
  matches: number;
  sampled: number;
  total: number;
}

interface RecomputeResponse {
  scanned: number;
  changed: number;
}

export async function createSegmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const segment = await api.post<SegmentResponse>('/v1/crm/segments', input);
    revalidatePath('/crm/segments');
    return { id: segment.id };
  });
}

export async function updateSegmentAction(
  segmentId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const segment = await api.patch<SegmentResponse>(`/v1/crm/segments/${segmentId}`, input);
    revalidatePath('/crm/segments');
    revalidatePath(`/crm/segments/${segmentId}`);
    return { id: segment.id };
  });
}

export async function archiveSegmentAction(
  segmentId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/crm/segments/${segmentId}`);
    revalidatePath('/crm/segments');
    return { id: segmentId };
  });
}

export async function previewSegmentCountAction(
  rule: unknown,
  sampleSize?: number
): Promise<ActionResult<PreviewCountResponse>> {
  return restAction(async () =>
    api.post<PreviewCountResponse>('/v1/crm/segments/preview-count', {
      rule,
      sampleSize,
    })
  );
}

/** Admin-only safety-net path: rebuilds segment_members from scratch
 *  against every customer in this segment. */
export async function recomputeSegmentsAction(
  segmentId?: string
): Promise<ActionResult<RecomputeResponse>> {
  if (!segmentId) {
    return {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Bulk recompute is not exposed via REST yet — recompute a specific segment.',
      },
    };
  }
  return restAction(async () => {
    const result = await api.post<RecomputeResponse>(`/v1/crm/segments/${segmentId}/recompute`, {});
    revalidatePath('/crm/segments');
    revalidatePath(`/crm/segments/${segmentId}`);
    return result;
  });
}
