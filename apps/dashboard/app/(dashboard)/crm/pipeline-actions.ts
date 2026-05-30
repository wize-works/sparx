'use server';

// Pipeline + stage Server Actions — adapters over api-rest /v1/crm/pipelines.

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface PipelineResponse {
  id: string;
  slug: string;
}

interface StageResponse {
  id: string;
}

export async function createPipelineAction(
  input: unknown
): Promise<ActionResult<{ id: string; slug: string }>> {
  return restAction(async () => {
    const pipeline = await api.post<PipelineResponse>('/v1/crm/pipelines', input);
    revalidatePath('/crm/pipelines');
    return { id: pipeline.id, slug: pipeline.slug };
  });
}

export async function updatePipelineAction(
  pipelineId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const pipeline = await api.patch<PipelineResponse>(`/v1/crm/pipelines/${pipelineId}`, input);
    revalidatePath('/crm/pipelines');
    revalidatePath(`/crm/pipelines/${pipelineId}/edit`);
    return { id: pipeline.id };
  });
}

export async function archivePipelineAction(
  pipelineId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/crm/pipelines/${pipelineId}`);
    revalidatePath('/crm/pipelines');
    return { id: pipelineId };
  });
}

export async function createPipelineStageAction(
  pipelineId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const stage = await api.post<StageResponse>(`/v1/crm/pipelines/${pipelineId}/stages`, input);
    revalidatePath(`/crm/pipelines/${pipelineId}`);
    revalidatePath(`/crm/pipelines/${pipelineId}/edit`);
    return { id: stage.id };
  });
}

/** REST exposes stage updates as `PATCH /v1/crm/pipelines/:id/stages/:stageId`,
 *  so the dashboard now carries `pipelineId` through to the action call. */
export async function updatePipelineStageAction(
  pipelineId: string,
  stageId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const stage = await api.patch<StageResponse>(
      `/v1/crm/pipelines/${pipelineId}/stages/${stageId}`,
      input
    );
    revalidatePath('/crm/pipelines');
    revalidatePath(`/crm/pipelines/${pipelineId}/edit`);
    return { id: stage.id };
  });
}

export async function reorderPipelineStagesAction(
  pipelineId: string,
  input: unknown
): Promise<ActionResult<{ pipelineId: string }>> {
  return restAction(async () => {
    await api.post<void>(`/v1/crm/pipelines/${pipelineId}/stages/reorder`, input);
    revalidatePath(`/crm/pipelines/${pipelineId}`);
    revalidatePath(`/crm/pipelines/${pipelineId}/edit`);
    return { pipelineId };
  });
}
