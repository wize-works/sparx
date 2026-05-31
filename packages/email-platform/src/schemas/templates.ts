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

// Authored marketing template — a section-composer body (docs/31 §5). The body
// shape (a {version, sections[]} list, or a legacy bare CmsDoc) is validated +
// normalized by @sparx/email-sections' parseBody in the service; here it is an
// opaque object so the zod layer doesn't duplicate the section registry.
const SectionBody = z.unknown();

export const CreateAuthoredTemplateInput = z
  .object({
    name: z.string().min(1).max(160),
    subject: z.string().min(1).max(255),
    preheader: z.string().max(255).optional(),
    body: SectionBody,
  })
  .strict();

export type CreateAuthoredTemplateInput = z.infer<typeof CreateAuthoredTemplateInput>;

export const UpdateAuthoredTemplateInput = z
  .object({
    name: z.string().min(1).max(160).optional(),
    subject: z.string().min(1).max(255).optional(),
    preheader: z.string().max(255).nullable().optional(),
    body: SectionBody.optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
  })
  .strict();

export type UpdateAuthoredTemplateInput = z.infer<typeof UpdateAuthoredTemplateInput>;

export const TestSendInput = z.object({ to: z.string().email() }).strict();
export type TestSendInput = z.infer<typeof TestSendInput>;
