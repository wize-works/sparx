// Segment input schemas.
//
// docs/11 §2. The rules field is validated against SegmentRuleSchema before
// insert/update so we never persist an unparseable predicate tree.

import { z } from 'zod';

import { SegmentRuleSchema } from './segment-rule.js';

const Slug = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-z0-9-]*$/, 'Segment slug must be lowercase kebab-case');

export const CreateSegmentInput = z.object({
  name: z.string().min(1).max(120),
  slug: Slug,
  description: z.string().max(2000).nullable().optional(),
  rules: SegmentRuleSchema,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)
    .optional()
    .nullable(),
});
export type CreateSegmentInput = z.infer<typeof CreateSegmentInput>;

export const UpdateSegmentInput = CreateSegmentInput.partial();
export type UpdateSegmentInput = z.infer<typeof UpdateSegmentInput>;
