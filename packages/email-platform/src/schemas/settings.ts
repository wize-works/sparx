import { z } from 'zod';

// Per-tenant email settings. All fields optional — PATCH semantics (only the
// provided fields are updated). Branding override is the fallback brand used
// until a storefront theme is published (see the brand resolver, P4).

export const BrandingOverrideSchema = z
  .object({
    logoMediaId: z.string().uuid().nullable().optional(),
    colors: z
      .object({
        primary: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color.')
          .optional(),
      })
      .optional(),
  })
  .strict();

export const UpdateEmailSettingsInput = z
  .object({
    fromName: z.string().max(255).nullable().optional(),
    fromAddress: z.string().email('Enter a valid email address.').nullable().optional(),
    replyTo: z.string().email('Enter a valid email address.').nullable().optional(),
    physicalAddress: z.string().max(2000).nullable().optional(),
    brandingOverride: BrandingOverrideSchema.optional(),
    defaultSendingDomainId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type UpdateEmailSettingsInput = z.infer<typeof UpdateEmailSettingsInput>;
