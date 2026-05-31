import { z } from 'zod';

// Per-tenant email settings. All fields optional — PATCH semantics (only the
// provided fields are updated). Brand identity (logo/colors/type) is NOT here:
// it is read from the tenant-level TenantBrand (docs/30 §6); email may never
// override the brand. The former `brandingOverride` field was removed in 1D-5.

export const UpdateEmailSettingsInput = z
  .object({
    fromName: z.string().max(255).nullable().optional(),
    fromAddress: z.string().email('Enter a valid email address.').nullable().optional(),
    replyTo: z.string().email('Enter a valid email address.').nullable().optional(),
    physicalAddress: z.string().max(2000).nullable().optional(),
    defaultSendingDomainId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type UpdateEmailSettingsInput = z.infer<typeof UpdateEmailSettingsInput>;
