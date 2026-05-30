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

import { api, type ApiRestError } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';

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

function toActionError(err: unknown): ActionResult<never> {
  const restErr = err as ApiRestError;
  const details = Array.isArray(restErr.details)
    ? (restErr.details as { field: string; message: string }[])
    : undefined;
  return {
    ok: false,
    error: {
      code: restErr.code ?? 'INTERNAL_ERROR',
      message: restErr.message ?? 'Unexpected error',
      ...(details ? { details } : {}),
    },
  };
}

export async function createSegmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const segment = await api.post<SegmentResponse>('/v1/crm/segments', input);
    revalidatePath('/crm/segments');
    return { ok: true, data: { id: segment.id } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function updateSegmentAction(
  segmentId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const segment = await api.patch<SegmentResponse>(`/v1/crm/segments/${segmentId}`, input);
    revalidatePath('/crm/segments');
    revalidatePath(`/crm/segments/${segmentId}`);
    return { ok: true, data: { id: segment.id } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function archiveSegmentAction(
  segmentId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await api.delete<void>(`/v1/crm/segments/${segmentId}`);
    revalidatePath('/crm/segments');
    return { ok: true, data: { id: segmentId } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function previewSegmentCountAction(
  rule: unknown,
  sampleSize?: number
): Promise<ActionResult<PreviewCountResponse>> {
  try {
    const result = await api.post<PreviewCountResponse>('/v1/crm/segments/preview-count', {
      rule,
      sampleSize,
    });
    return { ok: true, data: result };
  } catch (err) {
    return toActionError(err);
  }
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
  try {
    const result = await api.post<RecomputeResponse>(
      `/v1/crm/segments/${segmentId}/recompute`,
      {}
    );
    revalidatePath('/crm/segments');
    revalidatePath(`/crm/segments/${segmentId}`);
    return { ok: true, data: result };
  } catch (err) {
    return toActionError(err);
  }
}
