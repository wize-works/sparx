'use server';

// Pipeline + stage Server Actions — thin transport over pipelineService.

import { revalidatePath } from 'next/cache';

import { pipelineService } from '@sparx/crm';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createPipelineAction(
  input: unknown
): Promise<ActionResult<{ id: string; slug: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const pipeline = await pipelineService.create(ctx, input);
    revalidatePath('/crm/pipelines');
    return { id: pipeline.id, slug: pipeline.slug };
  });
}

export async function updatePipelineAction(
  pipelineId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const pipeline = await pipelineService.update(ctx, pipelineId, input);
    revalidatePath('/crm/pipelines');
    revalidatePath(`/crm/pipelines/${pipelineId}/edit`);
    return { id: pipeline.id };
  });
}

export async function archivePipelineAction(
  pipelineId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const pipeline = await pipelineService.archive(ctx, pipelineId);
    revalidatePath('/crm/pipelines');
    return { id: pipeline.id };
  });
}

export async function createPipelineStageAction(
  pipelineId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const stage = await pipelineService.createStage(ctx, pipelineId, input);
    revalidatePath(`/crm/pipelines/${pipelineId}`);
    revalidatePath(`/crm/pipelines/${pipelineId}/edit`);
    return { id: stage.id };
  });
}

export async function updatePipelineStageAction(
  stageId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const stage = await pipelineService.updateStage(ctx, stageId, input);
    revalidatePath('/crm/pipelines');
    return { id: stage.id };
  });
}

export async function reorderPipelineStagesAction(
  pipelineId: string,
  input: unknown
): Promise<ActionResult<{ pipelineId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await pipelineService.reorderStages(ctx, pipelineId, input);
    revalidatePath(`/crm/pipelines/${pipelineId}`);
    revalidatePath(`/crm/pipelines/${pipelineId}/edit`);
    return { pipelineId };
  });
}
