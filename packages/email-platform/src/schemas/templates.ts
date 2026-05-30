import { z } from 'zod';

// Built-in transactional template override — constrained customization only.
export const SaveBuiltinOverrideInput = z
  .object({
    subject: z.string().max(255).optional(),
    intro: z.string().max(2000).optional(),
    outro: z.string().max(2000).optional(),
  })
  .strict();

export type SaveBuiltinOverrideInput = z.infer<typeof SaveBuiltinOverrideInput>;

// Authored marketing template — TipTap doc body (validated structurally by the
// editor; stored as JSON).
const TipTapDoc = z.object({ type: z.literal('doc'), content: z.array(z.unknown()).optional() });

export const CreateAuthoredTemplateInput = z
  .object({
    name: z.string().min(1).max(160),
    subject: z.string().min(1).max(255),
    preheader: z.string().max(255).optional(),
    body: TipTapDoc,
  })
  .strict();

export type CreateAuthoredTemplateInput = z.infer<typeof CreateAuthoredTemplateInput>;

export const UpdateAuthoredTemplateInput = z
  .object({
    name: z.string().min(1).max(160).optional(),
    subject: z.string().min(1).max(255).optional(),
    preheader: z.string().max(255).nullable().optional(),
    body: TipTapDoc.optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
  })
  .strict();

export type UpdateAuthoredTemplateInput = z.infer<typeof UpdateAuthoredTemplateInput>;

export const TestSendInput = z.object({ to: z.string().email() }).strict();
export type TestSendInput = z.infer<typeof TestSendInput>;
