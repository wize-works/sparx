// Pipeline + pipeline stage input schemas.
//
// docs/11 §4. Tenants can run multiple pipelines (e.g. "New B2B Acquisition",
// "Fleet Contract Renewals"); each has its own stage list. The default
// pipeline template is shipped as a built-in (see ./builtins/pipeline) and
// seeded into each new tenant on signup by the onboarding worker.

import { z } from 'zod';

import { StageType } from './common';

const Slug = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-z0-9-]*$/, 'Slug must be lowercase kebab-case');

export const CreatePipelineInput = z.object({
  name: z.string().min(1).max(120),
  slug: Slug,
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreatePipelineInput = z.infer<typeof CreatePipelineInput>;

export const UpdatePipelineInput = CreatePipelineInput.partial();
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineInput>;

export const CreatePipelineStageInput = z.object({
  name: z.string().min(1).max(120),
  sortOrder: z.number().int().min(0),
  probability: z.number().min(0).max(100).default(0),
  stageType: StageType.default('open'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'Color must be #RRGGBB or #RRGGBBAA hex')
    .optional()
    .nullable(),
});
export type CreatePipelineStageInput = z.infer<typeof CreatePipelineStageInput>;

export const UpdatePipelineStageInput = CreatePipelineStageInput.partial();
export type UpdatePipelineStageInput = z.infer<typeof UpdatePipelineStageInput>;

// Reorder takes the desired final ordering — service layer rewrites
// sort_order on each stage atomically inside the same transaction.
export const ReorderPipelineStagesInput = z.object({
  stageIds: z.array(z.string().uuid()).min(1).max(50),
});
export type ReorderPipelineStagesInput = z.infer<typeof ReorderPipelineStagesInput>;
